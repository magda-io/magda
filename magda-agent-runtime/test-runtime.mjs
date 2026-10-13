import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const dockerfile = await readFile(
    new URL("Dockerfile", import.meta.url),
    "utf8"
);
const packageJson = JSON.parse(
    await readFile(new URL("package.json", import.meta.url), "utf8")
);
const lernaJson = JSON.parse(
    await readFile(new URL("../lerna.json", import.meta.url), "utf8")
);
const mgdPackageJson = JSON.parse(
    await readFile(
        new URL("../packages/mgd/package.json", import.meta.url),
        "utf8"
    )
);
const managedClient = await readFile(
    new URL("dsh-client-managed-profile/lib/client.js", import.meta.url),
    "utf8"
);
const cordisPatch = await readFile(
    new URL("magda.cordis.patch.yml", import.meta.url),
    "utf8"
);
const bootstrap = await readFile(
    new URL("bootstrap.mjs", import.meta.url),
    "utf8"
);

assert.match(
    dockerfile,
    /ARG DSH_VERSION=0\.2\.1-alpha\.1/,
    "The qualified DSH release must remain pinned"
);
assert.equal(packageJson.version, lernaJson.version);
assert.equal(mgdPackageJson.version, lernaJson.version);
assert.equal(packageJson.dependencies["@magda/mgd"], `^${lernaJson.version}`);
assert.equal(packageJson.config.docker.name, "magda-agent-runtime");
assert.equal(packageJson.magda.language, "typescript");
assert.equal(packageJson.magda.categories.dockerizedTool, true);
assert.equal(packageJson.magda.categories.api, undefined);
assert.match(packageJson.scripts.check, /bash -n entrypoint\.sh/);
assert.equal(packageJson.scripts.build, "yarn run check");
assert.match(
    packageJson.scripts.test,
    /yarn run check && node test-runtime\.mjs/
);
assert.match(packageJson.scripts["prepare-docker"], /packages\/mgd build/);
assert.match(
    packageJson.scripts["docker-build-prod"],
    /create-docker-context-for-node-component/
);

const dockerIncludes = new Set(
    packageJson.config.docker.include.split(" ").filter(Boolean)
);
for (const requiredPath of [
    "node_modules",
    "Dockerfile",
    "../magda-agent-runtime/dsh-client-managed-profile",
    "../magda-agent-runtime/magda.cordis.patch.yml",
    "../magda-agent-runtime/entrypoint.sh",
    "../magda-agent-runtime/bootstrap.mjs",
    "../magda-agent-runtime/dsh-launch.mjs"
]) {
    assert.ok(
        dockerIncludes.has(requiredPath),
        `Docker context must include ${requiredPath}`
    );
}
for (const legacyMgdSource of [
    "../packages/mgd/package.json",
    "../packages/mgd/esbuild.js",
    "../packages/mgd/src",
    "../packages/mgd/skills"
]) {
    assert.ok(
        !dockerIncludes.has(legacyMgdSource),
        `Docker context must package @magda/mgd as a dependency, not ${legacyMgdSource}`
    );
}
assert.doesNotMatch(
    dockerfile,
    /AS mgd-build|COPY --from=mgd-build|npm pack|\/tmp\/mgd/,
    "The runtime must use standard dependency packaging instead of a manual mgd build stage"
);
assert.match(
    dockerfile,
    /COPY node_modules\/ \/usr\/local\/lib\/node_modules\//,
    "The generated production dependency tree must be copied into the image"
);
assert.match(
    dockerfile,
    /ln -s \/usr\/local\/lib\/node_modules\/@magda\/mgd\/bin\/mgd\.js \/usr\/local\/bin\/mgd/,
    "The mgd executable must remain on PATH"
);
assert.match(
    dockerfile,
    /ENV DSH_HOME=\/data\/agent-home/,
    "DSH state must use the Agent Workspace branded home path"
);
assert.match(
    dockerfile,
    /deepseek-harness.*agent-harness/s,
    "The pinned DSH default workspace path must be renamed during the image build"
);
assert.doesNotMatch(
    dockerfile,
    /migrate-data-paths|patch-dsh-workspace-path/,
    "The local-only path rename must not ship upgrade migration helpers"
);
assert.match(
    cordisPatch,
    /process\.env\.MAGDA_LLM_MODEL \|\| 'magda-agent-default'/,
    "The managed provider and default selection must use the stable public alias"
);
assert.doesNotMatch(
    cordisPatch,
    /gpt-5\.6-sol/,
    "DSH configuration must not expose the provider-specific model identifier"
);
assert.match(
    cordisPatch,
    /contextWindow: !!js Number\(process\.env\.MAGDA_LLM_CONTEXT_WINDOW \|\| 1050000\)/,
    "The model context window must come from managed bootstrap configuration"
);
assert.match(
    cordisPatch,
    /maxTokens: !!js Number\(process\.env\.MAGDA_LLM_MAX_TOKENS \|\| 128000\)/,
    "The model output limit must come from managed bootstrap configuration"
);
assert.match(
    cordisPatch,
    /reasoningEffort: !!js process\.env\.MAGDA_LLM_REASONING_EFFORT \|\| undefined/,
    "Reasoning effort must remain optional with no runtime default"
);
assert.doesNotMatch(
    cordisPatch,
    /MAGDA_LLM_REASONING_EFFORT \|\| ['\"]medium['\"]/,
    "The runtime must not restore an omitted reasoning effort"
);
for (const managedLimit of [
    "MAGDA_LLM_CONTEXT_WINDOW",
    "MAGDA_LLM_MAX_TOKENS"
]) {
    assert.match(
        bootstrap,
        new RegExp(`export ${managedLimit}=`),
        `Bootstrap must persist ${managedLimit}`
    );
}

const bootstrapRoot = await mkdtemp(
    path.join(tmpdir(), "magda-agent-bootstrap-test-")
);
try {
    const bootstrapPayload = {
        version: 1,
        userId: "runtime-test-user",
        magda: {
            baseUrl: "https://magda.example",
            profile: "magda-agent-workspace",
            apiKeyId: "runtime-test-key-id",
            apiKey: "runtime-test-key"
        },
        llm: {
            baseUrl: "https://magda.example/api/v0/llm/v1",
            authorization: "runtime-test-authorization",
            model: "magda-agent-default",
            reasoningEffort: "medium",
            contextWindow: 1050000,
            maxTokens: 128000
        }
    };
    const runBootstrap = (payload) => {
        const result = spawnSync(
            process.execPath,
            [fileURLToPath(new URL("bootstrap.mjs", import.meta.url))],
            {
                input: JSON.stringify(payload),
                encoding: "utf8",
                env: {
                    ...process.env,
                    MAGDA_AGENT_BOOTSTRAP_DATA_ROOT: bootstrapRoot,
                    MAGDA_AGENT_BOOTSTRAP_SKIP_RESTART: "1"
                }
            }
        );
        assert.equal(result.status, 0, result.stderr);
    };

    runBootstrap(bootstrapPayload);
    const envFile = path.join(bootstrapRoot, "config/magda-agent.env");
    assert.match(
        await readFile(envFile, "utf8"),
        /MAGDA_LLM_REASONING_EFFORT='medium'/
    );

    const {
        reasoningEffort: _removed,
        ...withoutReasoning
    } = bootstrapPayload.llm;
    runBootstrap({ ...bootstrapPayload, llm: withoutReasoning });
    assert.doesNotMatch(
        await readFile(envFile, "utf8"),
        /MAGDA_LLM_REASONING_EFFORT/,
        "Re-provisioning without reasoning effort must remove a stale value"
    );
} finally {
    await rm(bootstrapRoot, { recursive: true, force: true });
}

assert.match(
    cordisPatch,
    /- id: ui-message-feedback\n\s+disabled: true/,
    "The managed UI must not expose DSH feedback collection"
);
for (const hiddenWorkspaceControl of [
    "Choose workspace",
    "Add workspace",
    "View options",
    "Automation tasks"
]) {
    assert.match(
        managedClient,
        new RegExp(`button\\[aria-label="${hiddenWorkspaceControl}"\\]`),
        `The managed UI must hide ${hiddenWorkspaceControl}`
    );
}
assert.match(
    managedClient,
    /item\.textContent\?\.trim\(\) === "Delete workspace"/,
    "The managed UI must hide DSH's destructive workspace action"
);
assert.match(
    managedClient,
    /element\.textContent = "Agent Workspace"/,
    "The managed UI must preserve the Agent Workspace hero branding"
);
assert.match(
    managedClient,
    /element\.textContent\?\.trim\(\) !== "Agent Workspace"/,
    "Hero branding must not create a MutationObserver feedback loop"
);
let loadedManagedModule;
runInNewContext(managedClient, {
    window: {
        __ModuleLoader__: {
            load(value) {
                loadedManagedModule = value;
            }
        }
    }
});
assert.equal(
    loadedManagedModule?.id,
    "@magda/dsh-client-managed-profile",
    "The managed client module must register with DSH"
);
const requiredModules = [];
const managedPlugin = loadedManagedModule.factory((id) => {
    requiredModules.push(id);
    if (id !== "react/jsx-runtime") {
        throw new Error(`Unexpected managed client dependency: ${id}`);
    }
    return {
        jsx: (type, props) => ({ type, props })
    };
});
assert.deepEqual(requiredModules, ["react/jsx-runtime"]);
assert.deepEqual(Array.from(managedPlugin.inject), ["commandUi", "slots"]);

const slotInjections = [];
const slotRegistrations = [];
const serviceInjections = [];
managedPlugin.apply({
    effect(_callback, label) {
        assert.equal(label, "managed profile: Magda chrome");
        return () => undefined;
    },
    slots: {
        inject(name, register) {
            slotInjections.push(name);
            register();
            return () => undefined;
        },
        register(options, component) {
            slotRegistrations.push({ options, component });
            return () => undefined;
        }
    },
    inject(dependencies) {
        serviceInjections.push(Array.from(dependencies));
        return () => undefined;
    }
});
assert.deepEqual(slotInjections, [
    "sidebar.brand.mark",
    "conversation.hero.brand.mark",
    "sidebar.brand.name",
    "sidebar.settings"
]);
assert.deepEqual(
    slotRegistrations.map(({ options }) => ({ ...options })),
    [
        { name: "sidebar.brand.mark", priority: -100 },
        { name: "conversation.hero.brand.mark", priority: -100 },
        { name: "sidebar.brand.name", priority: -100 },
        { name: "sidebar.settings", priority: -100 }
    ]
);
assert.deepEqual(serviceInjections, [["commandUi"]]);
const [brandMark, heroBrandMark, brandName, settings] = slotRegistrations.map(
    ({ component }) => component
);
assert.deepEqual(JSON.parse(JSON.stringify(brandMark({ size: 24 }))), {
    type: "span",
    props: {
        "aria-hidden": true,
        className: "magda-dsh-brand-mark",
        style: { width: 24, height: 24 },
        children: "M"
    }
});
assert.deepEqual(JSON.parse(JSON.stringify(heroBrandMark())), {
    type: "span",
    props: {
        "aria-hidden": true,
        className: "magda-dsh-brand-mark magda-dsh-hero-brand-mark",
        children: "M"
    }
});
assert.deepEqual(JSON.parse(JSON.stringify(brandName())), {
    type: "span",
    props: {
        className: "magda-dsh-brand-name",
        children: "Agent Workspace"
    }
});
assert.equal(
    settings(),
    null,
    "The managed Settings sidebar slot must be empty"
);
assert.doesNotMatch(
    cordisPatch,
    /- id: ui-settings\n\s+disabled: true/,
    "The underlying DSH Settings service must remain enabled"
);
assert.match(
    cordisPatch,
    /- id: ui-plugin-manager\n\s+disabled: true/,
    "The managed UI must keep the Plugins control hidden"
);
