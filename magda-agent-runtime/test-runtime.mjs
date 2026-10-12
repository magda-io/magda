import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";

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
const managedClient = await readFile(
    new URL("dsh-client-managed-profile/lib/client.js", import.meta.url),
    "utf8"
);
const cordisPatch = await readFile(
    new URL("magda.cordis.patch.yml", import.meta.url),
    "utf8"
);

function decompressZstdFrames(source) {
    const frames = [];
    let offset = 0;
    while (offset < source.length) {
        const result = zstdDecompressSync(source.subarray(offset), {
            info: true
        });
        assert.ok(result.engine.bytesWritten > 0);
        frames.push(result.buffer.toString("utf8"));
        offset += result.engine.bytesWritten;
    }
    return frames;
}

assert.match(
    dockerfile,
    /ARG DSH_VERSION=0\.2\.1-alpha\.1/,
    "The qualified DSH release must remain pinned"
);
assert.equal(packageJson.version, lernaJson.version);
assert.equal(packageJson.config.docker.name, "magda-agent-runtime");
assert.equal(packageJson.magda.language, "typescript");
assert.equal(packageJson.magda.categories.dockerizedTool, true);
assert.equal(packageJson.magda.categories.api, undefined);
assert.match(
    packageJson.scripts["docker-build-prod"],
    /create-docker-context-for-node-component/
);

const dockerIncludes = new Set(
    packageJson.config.docker.include.split(" ").filter(Boolean)
);
for (const requiredPath of [
    "Dockerfile",
    "../packages/mgd/package.json",
    "../packages/mgd/esbuild.js",
    "../packages/mgd/src",
    "../packages/mgd/skills",
    "../magda-agent-runtime/dsh-client-managed-profile",
    "../magda-agent-runtime/magda.cordis.patch.yml",
    "../magda-agent-runtime/entrypoint.sh",
    "../magda-agent-runtime/bootstrap.mjs",
    "../magda-agent-runtime/dsh-launch.mjs",
    "../magda-agent-runtime/migrate-data-paths.mjs",
    "../magda-agent-runtime/patch-dsh-workspace-path.mjs"
]) {
    assert.ok(
        dockerIncludes.has(requiredPath),
        `Docker context must include ${requiredPath}`
    );
}
assert.ok(
    ![...dockerIncludes].some((path) => path.includes("node_modules")),
    "Docker context must not include local node_modules"
);
assert.match(
    dockerfile,
    /ENV DSH_HOME=\/data\/agent-home/,
    "DSH state must use the Agent Workspace branded home path"
);
assert.match(
    dockerfile,
    /patch-dsh-workspace-path\.mjs/,
    "The pinned DSH default workspace path must be patched during the image build"
);

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "magda-agent-paths-"));
try {
    const dataRoot = path.join(temporaryRoot, "data");
    const legacyWorkspace = path.join(
        dataRoot,
        "workspace",
        "deepseek-harness",
        "default-workspace"
    );
    const agentWorkspace = path.join(
        dataRoot,
        "workspace",
        "agent-harness",
        "default-workspace"
    );
    const legacySessionGroup =
        "--data-workspace-deepseek-harness-default-workspace--";
    const agentSessionGroup =
        "--data-workspace-agent-harness-default-workspace--";
    await mkdir(
        path.join(dataRoot, "dsh-home", "sessions", legacySessionGroup),
        { recursive: true }
    );
    await writeFile(
        path.join(dataRoot, "dsh-home", "state.json"),
        JSON.stringify({ path: legacyWorkspace })
    );
    await writeFile(
        path.join(
            dataRoot,
            "dsh-home",
            "sessions",
            legacySessionGroup,
            "session.v4.jsonl.zstd"
        ),
        Buffer.concat([
            zstdCompressSync(
                Buffer.from(`${JSON.stringify({ cwd: legacyWorkspace })}\n`)
            ),
            zstdCompressSync(
                Buffer.from(`${JSON.stringify({ event: "first turn" })}\n`)
            ),
            zstdCompressSync(
                Buffer.from(`${JSON.stringify({ event: "second turn" })}\n`)
            )
        ])
    );
    await mkdir(
        path.join(
            dataRoot,
            "workspace",
            "deepseek-harness",
            "default-workspace"
        ),
        { recursive: true }
    );
    await writeFile(
        path.join(
            dataRoot,
            "workspace",
            "deepseek-harness",
            "default-workspace",
            "result.txt"
        ),
        "result"
    );
    const migration = new URL("migrate-data-paths.mjs", import.meta.url);
    const migrationEnvironment = {
        ...process.env,
        MAGDA_AGENT_DATA_ROOT: dataRoot
    };
    execFileSync(process.execPath, [migration.pathname], {
        env: migrationEnvironment
    });
    // A second boot must be a no-op.
    execFileSync(process.execPath, [migration.pathname], {
        env: migrationEnvironment
    });

    assert.deepEqual(
        JSON.parse(
            await readFile(
                path.join(dataRoot, "agent-home", "state.json"),
                "utf8"
            )
        ),
        { path: agentWorkspace }
    );
    assert.equal(
        await readFile(path.join(agentWorkspace, "result.txt"), "utf8"),
        "result"
    );
    const migratedFrames = decompressZstdFrames(
        await readFile(
            path.join(
                dataRoot,
                "agent-home",
                "sessions",
                agentSessionGroup,
                "session.v4.jsonl.zstd"
            )
        )
    ).map((frame) => JSON.parse(frame));
    assert.deepEqual(migratedFrames, [
        { cwd: agentWorkspace },
        { event: "first turn" },
        { event: "second turn" }
    ]);
    await assert.rejects(
        lstat(path.join(dataRoot, "workspace", "deepseek-harness")),
        (error) => error?.code === "ENOENT"
    );
    assert.equal(
        await readFile(path.join(dataRoot, ".agent-paths-v1"), "utf8"),
        "1\n"
    );

    const packageRoot = path.join(temporaryRoot, "workspace-controller");
    await mkdir(path.join(packageRoot, "lib", "types"), { recursive: true });
    await writeFile(
        path.join(packageRoot, "lib", "index.js"),
        'paths.join(directory, "deepseek-harness", DEFAULT_WORKSPACE_DIRECTORY)'
    );
    await writeFile(
        path.join(packageRoot, "lib", "types", "default-directory.js"),
        "paths.join(directory, 'deepseek-harness', DEFAULT_WORKSPACE_DIRECTORY)"
    );
    execFileSync(
        process.execPath,
        [
            new URL("patch-dsh-workspace-path.mjs", import.meta.url).pathname,
            packageRoot
        ],
        { stdio: "ignore" }
    );
    assert.match(
        await readFile(path.join(packageRoot, "lib", "index.js"), "utf8"),
        /agent-harness/
    );
    assert.match(
        await readFile(
            path.join(packageRoot, "lib", "types", "default-directory.js"),
            "utf8"
        ),
        /agent-harness/
    );
} finally {
    await rm(temporaryRoot, { recursive: true, force: true });
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
