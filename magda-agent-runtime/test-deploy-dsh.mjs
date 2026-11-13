// Run with Node 22+: node --test magda-agent-runtime/test-deploy-dsh.mjs
// All package payloads and source metadata are synthetic; no Docker, network,
// checkout dependencies, credentials, or upstream runtime build is required.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    symlink,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("deploy-dsh.mjs", import.meta.url));
const version = "4.5.6";
const sourceMetadata = {
    DSH_SOURCE_REPO: "https://example.invalid/fixture/dsh.git",
    DSH_SOURCE_REF: "fixture/0.0.0/1.0.0",
    DSH_SOURCE_SHA: "0123456789abcdef0123456789abcdef01234567",
    DSH_UPSTREAM_REF: "upstream/fixture",
    DSH_UPSTREAM_SHA: "89abcdef0123456789abcdef0123456789abcdef"
};
const coreFiles = {
    "lib/index.js": "export const core = 'source-built';\n",
    "lib/nested/value.json": '{"fixture":true}\n'
};
const pluginFiles = {
    "lib/index.js": "export const plugin = 'source-built';\n"
};
const notices = {
    LICENSE: "Synthetic fixture license; not a real upstream license.\n",
    "THIRD_PARTY_NOTICES.md": "Synthetic fixture third-party notices.\n"
};

async function json(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

async function packageAt(directory, manifest, files = {}) {
    await json(path.join(directory, "package.json"), manifest);
    for (const [relative, contents] of Object.entries(files)) {
        const file = path.join(directory, relative);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, contents);
    }
}

async function link(from, to) {
    await mkdir(path.dirname(to), { recursive: true });
    await symlink(path.relative(path.dirname(to), from), to, "dir");
}

async function fixture(t) {
    const home = await mkdtemp(path.join(tmpdir(), "magda-deploy-dsh-"));
    t.after(() => rm(home, { recursive: true, force: true }));
    const source = path.join(home, "source");
    const target = path.join(home, "deployment");
    const core = path.join(source, "apps/core");
    const plugin = path.join(source, "apps/plugin");
    const assembly = path.join(source, "python/sdk-runtime");
    const modules = path.join(target, "node_modules");
    const manifest = {
        name: "fixture-runtime-assembly",
        version,
        dependencies: {
            "@deepseek-ai/dsh": "workspace:*",
            "@dsh/plugin": "workspace:*",
            // A scoped external package must not be mistaken for a workspace.
            "@dsh/libreoffice-kit": "1.2.3"
        }
    };
    await json(path.join(source, "package.json"), {
        name: "fixture-checkout",
        private: true,
        version,
        workspaces: ["apps/*", "python/sdk-runtime"]
    });
    for (const [name, contents] of Object.entries(notices)) {
        await writeFile(path.join(source, name), contents);
    }
    await packageAt(
        core,
        { name: "@deepseek-ai/dsh", version, license: "MIT" },
        coreFiles
    );
    await packageAt(plugin, { name: "@dsh/plugin", version }, pluginFiles);
    await packageAt(assembly, manifest);
    await packageAt(target, manifest);

    // pnpm's legacy deploy can omit a hoisted workspace dependency entirely.
    await link(core, path.join(assembly, "node_modules/@deepseek-ai/dsh"));
    // Source-only nested node_modules must not be copied into the deployment.
    await packageAt(
        path.join(core, "node_modules/source-only"),
        {
            name: "source-only",
            version: "0.0.0"
        },
        { "index.js": "must not ship\n" }
    );
    // An already-present direct workspace link must also be materialized.
    await link(plugin, path.join(modules, "@dsh/plugin"));
    await packageAt(
        path.join(modules, "@dsh/libreoffice-kit"),
        {
            name: "@dsh/libreoffice-kit",
            version: "1.2.3",
            license: "Apache-2.0"
        },
        { "index.js": "external fixture\n" }
    );
    const nested = path.join(source, "external/nested");
    await packageAt(
        nested,
        { name: "nested-external", version: "2.0.0" },
        {
            "index.js": "nested external fixture\n"
        }
    );
    await link(
        nested,
        path.join(modules, "@dsh/libreoffice-kit/node_modules/nested-external")
    );
    await link(plugin, path.join(modules, ".bin/fixture-plugin"));
    await link(
        nested,
        path.join(modules, "@dsh/libreoffice-kit/node_modules/.bin/nested")
    );
    return { source, target, core, plugin, assembly, modules, manifest };
}

function deploy({ source, target }, metadata = sourceMetadata) {
    return spawnSync(process.execPath, [helper, target], {
        cwd: source,
        encoding: "utf8",
        // Deliberately do not forward credentials or the caller's DSH settings.
        env: { PATH: process.env.PATH, ...metadata },
        timeout: 30_000,
        maxBuffer: 1024 * 1024
    });
}

function rejectsDeployment(f, expected, metadata) {
    const result = deploy(f, metadata);
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    assert.notEqual(
        result.status,
        0,
        "invalid deployment unexpectedly succeeded"
    );
    assert.match(result.stderr, expected);
    return result;
}

async function assertMaterialized(directory) {
    for (const entry of await readdir(directory)) {
        const file = path.join(directory, entry);
        const stat = await lstat(file);
        assert.equal(stat.isSymbolicLink(), false, `symlink survived: ${file}`);
        assert.notEqual(
            entry,
            ".bin",
            `executable shim directory survived: ${file}`
        );
        if (stat.isDirectory()) await assertMaterialized(file);
    }
}

function payloadHash(files) {
    const hash = createHash("sha256");
    for (const [name, contents] of Object.entries(files).sort(([a], [b]) =>
        a.localeCompare(b)
    )) {
        hash.update(name.split("/").join(path.sep))
            .update("\0")
            .update(contents);
    }
    return hash.digest("hex");
}

test("restores hoisted workspaces, materializes links, and records exact provenance", async (t) => {
    const f = await fixture(t);
    await assert.rejects(lstat(path.join(f.modules, "@deepseek-ai/dsh")), {
        code: "ENOENT"
    });
    assert.equal(
        (await lstat(path.join(f.modules, "@dsh/plugin"))).isSymbolicLink(),
        true
    );
    const result = deploy(f);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
        result.stdout,
        /Verified 2 source-built workspace packages, 4 total package instances/
    );
    await assertMaterialized(f.target);
    assert.equal(
        await readFile(
            path.join(f.modules, "@deepseek-ai/dsh/lib/index.js"),
            "utf8"
        ),
        coreFiles["lib/index.js"]
    );
    assert.equal(
        await readFile(
            path.join(f.modules, "@dsh/plugin/lib/index.js"),
            "utf8"
        ),
        pluginFiles["lib/index.js"]
    );
    assert.equal(
        await readFile(
            path.join(
                f.modules,
                "@dsh/libreoffice-kit/node_modules/nested-external/index.js"
            ),
            "utf8"
        ),
        "nested external fixture\n"
    );
    await assert.rejects(
        lstat(path.join(f.modules, "@deepseek-ai/dsh/node_modules")),
        { code: "ENOENT" }
    );
    for (const [name, contents] of Object.entries(notices)) {
        assert.equal(
            await readFile(path.join(f.target, "provenance", name), "utf8"),
            contents
        );
    }
    const provenance = JSON.parse(
        await readFile(
            path.join(f.target, "provenance/dsh-source.json"),
            "utf8"
        )
    );
    assert.deepEqual(provenance, {
        repository: sourceMetadata.DSH_SOURCE_REPO,
        ref: sourceMetadata.DSH_SOURCE_REF,
        sha: sourceMetadata.DSH_SOURCE_SHA,
        upstream: {
            ref: sourceMetadata.DSH_UPSTREAM_REF,
            sha: sourceMetadata.DSH_UPSTREAM_SHA
        },
        version,
        assembly: f.manifest.name,
        packages: [
            {
                name: "@deepseek-ai/dsh",
                version,
                files: 2,
                sha256: payloadHash(coreFiles)
            },
            {
                name: "@dsh/plugin",
                version,
                files: 1,
                sha256: payloadHash(pluginFiles)
            }
        ],
        dependencies: [
            { name: "@deepseek-ai/dsh", version, license: "MIT" },
            {
                name: "@dsh/libreoffice-kit",
                version: "1.2.3",
                license: "Apache-2.0"
            },
            { name: "@dsh/plugin", version, license: null },
            { name: "nested-external", version: "2.0.0", license: null }
        ]
    });
});

test("rejects missing or abbreviated source and upstream baseline metadata", async (t) => {
    for (const [change, expected] of [
        [{ DSH_UPSTREAM_REF: undefined }, /DSH_UPSTREAM_REF must be set/],
        [{ DSH_UPSTREAM_SHA: undefined }, /DSH_UPSTREAM_SHA must be set/],
        [{ DSH_SOURCE_REF: "" }, /DSH_SOURCE_REF must be set/],
        [
            { DSH_SOURCE_SHA: "0123456789ab" },
            /DSH_SOURCE_SHA must be a full SHA/
        ],
        [
            { DSH_UPSTREAM_SHA: "5badb150" },
            /DSH_UPSTREAM_SHA must be a full SHA/
        ]
    ]) {
        const f = await fixture(t);
        const metadata = { ...sourceMetadata, ...change };
        for (const [name, value] of Object.entries(metadata))
            if (value === undefined) delete metadata[name];
        rejectsDeployment(f, expected, metadata);
        await assert.rejects(
            lstat(path.join(f.target, "provenance/dsh-source.json")),
            { code: "ENOENT" }
        );
    }
});

test("rejects an assembly direct dependency absent from deployment and source", async (t) => {
    const f = await fixture(t);
    f.manifest.dependencies["missing-assembly-dependency"] = "1.0.0";
    await json(path.join(f.target, "package.json"), f.manifest);
    rejectsDeployment(
        f,
        /Missing runtime assembly dependency: missing-assembly-dependency/
    );
    await assert.rejects(
        lstat(path.join(f.target, "provenance/dsh-source.json")),
        { code: "ENOENT" }
    );
});

test("rejects deployed workspace payload that differs from source", async (t) => {
    const f = await fixture(t);
    await packageAt(
        path.join(f.modules, "@deepseek-ai/dsh"),
        {
            name: "@deepseek-ai/dsh",
            version
        },
        { ...coreFiles, "lib/index.js": "export const core = 'wrong-build';\n" }
    );
    rejectsDeployment(
        f,
        /Not a source-built artifact: @deepseek-ai\/dsh\/lib[/\\]index\.js/
    );
});

test("rejects a workspace omitted behind an incorrectly named installed package", async (t) => {
    const f = await fixture(t);
    await packageAt(
        path.join(f.modules, "@deepseek-ai/dsh"),
        {
            name: "not-the-required-workspace",
            version
        },
        coreFiles
    );
    rejectsDeployment(
        f,
        /Workspace omitted from deployment: @deepseek-ai\/dsh/
    );
});

test("rejects an empty workspace package even when its manifest matches", async (t) => {
    const f = await fixture(t);
    await packageAt(path.join(f.modules, "@deepseek-ai/dsh"), {
        name: "@deepseek-ai/dsh",
        version
    });
    rejectsDeployment(f, /Empty workspace package: @deepseek-ai\/dsh/);
});

test("rejects missing source workspace discovery", async (t) => {
    const f = await fixture(t);
    await json(path.join(f.source, "package.json"), {
        name: "fixture-checkout",
        version,
        workspaces: []
    });
    rejectsDeployment(f, /Pinned source workspace discovery failed/);
});

test("rejects an assembly workspace missing from the source checkout", async (t) => {
    const f = await fixture(t);
    // Preserve a valid deployed payload, but remove the corresponding source.
    const deployedPlugin = path.join(f.modules, "@dsh/plugin");
    await rm(deployedPlugin);
    await packageAt(
        deployedPlugin,
        { name: "@dsh/plugin", version },
        pluginFiles
    );
    await rm(f.plugin, { recursive: true });
    rejectsDeployment(
        f,
        /Runtime workspace missing from pinned source: @dsh\/plugin/
    );
});

test("rejects a workspace version that differs from source", async (t) => {
    const f = await fixture(t);
    await packageAt(
        path.join(f.modules, "@deepseek-ai/dsh"),
        {
            name: "@deepseek-ai/dsh",
            version: "0.0.1"
        },
        coreFiles
    );
    rejectsDeployment(f, /Wrong workspace version: @deepseek-ai\/dsh/);
});
