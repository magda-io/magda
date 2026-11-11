// Node 22+: node --test magda-agent-runtime/test-prune-dsh-runtime.mjs
// Synthetic installed trees only: no Docker, network, package manager or source
// lock changes. Package entrypoints deliberately throw if anyone executes them.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    symlink,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pruneRuntime } from "./prune-dsh-runtime.mjs";

const CLI = "@deepseek-ai/dsh";
const CORDIS = "@deepseek-ai/cordis";
const helper = fileURLToPath(new URL("prune-dsh-runtime.mjs", import.meta.url));

async function json(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

async function fixture(t, metadata = {}) {
    const temporary = await realpath(tmpdir());
    const home = await realpath(await mkdtemp(path.join(temporary, "magda-prune-dsh-")));
    t.after(async () => {
        assert(path.isAbsolute(home) && home.startsWith(temporary + path.sep) &&
            path.basename(home).startsWith("magda-prune-dsh-"));
        await rm(home, { recursive: true, force: true });
    });
    const root = path.join(home, "deployment");
    const modules = path.join(root, "node_modules");
    await mkdir(modules, { recursive: true });
    const manifest = {
        name: "dsh-python-runtime-closure",
        private: true,
        version: "0.0.0",
        dependencies: { [CLI]: "workspace:*" },
        ...metadata
    };
    await json(path.join(root, "package.json"), manifest);
    async function pkg(name, metadata = {}, parent = modules) {
        const directory = path.join(parent, name);
        await json(path.join(directory, "package.json"), {
            name,
            version: "1.2.3",
            main: "index.cjs",
            ...metadata
        });
        await writeFile(path.join(directory, "index.cjs"), "throw new Error('Fixture package MUST NOT execute');\n");
        return directory;
    }
    const manifestAt = async (directory) => JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    const exists = async (directory) => {
        try {
            await lstat(directory);
            return true;
        } catch (error) {
            if (error.code === "ENOENT") return false;
            throw error;
        }
    };
    return { home, root, modules, pkg, manifest, manifestAt, exists };
}

function installedRequire(directory) {
    return createRequire(path.join(directory, "package.json"));
}

test("prunes optional-peer-only MCP SDK/Express tree and extra source packages, retaining host peers", async (t) => {
    const f = await fixture(t, {
        dependencies: {
            [CLI]: "workspace:*",
            "@deepseek-ai/dsh-provider-unused": "workspace:*",
            "@modelcontextprotocol/sdk": "1.99.0"
        }
    });
    const cli = await f.pkg(CLI, { dependencies: { plugin: "*" }, peerDependencies: { [CORDIS]: "*" } });
    const plugin = await f.pkg("plugin", {
        peerDependencies: { "@modelcontextprotocol/sdk": "*", "@deepseek-ai/dsh-host": "*", [CORDIS]: "*" },
        peerDependenciesMeta: { "@modelcontextprotocol/sdk": { optional: true } }
    });
    await f.pkg(CORDIS, { version: "9.8.7" });
    await f.pkg("@deepseek-ai/dsh-host");
    await f.pkg("@modelcontextprotocol/sdk", { dependencies: { express: "*", "ip-address": "*" } });
    await f.pkg("express", { dependencies: { "body-parser": "*" } });
    await f.pkg("body-parser");
    await f.pkg("ip-address");
    await f.pkg("@deepseek-ai/dsh-provider-unused");
    const cliBefore = await readFile(path.join(cli, "package.json"), "utf8");
    const report = await pruneRuntime({ root: f.root });
    assert.deepEqual(report.before, { packages: 9, names: 9 });
    assert.deepEqual(report.retained, { packages: 4, names: 4 });
    assert.deepEqual(report.removed.map((item) => item.name).sort(), [
        "@deepseek-ai/dsh-provider-unused", "@modelcontextprotocol/sdk", "body-parser", "express", "ip-address"
    ]);
    assert(report.removed.every((item) => item.version === "1.2.3" && item.path.startsWith("node_modules/")));
    for (const name of ["@modelcontextprotocol/sdk", "express", "body-parser", "ip-address", "@deepseek-ai/dsh-provider-unused"]) {
        assert.equal(await f.exists(path.join(f.modules, name)), false);
    }
    assert.equal(await readFile(path.join(cli, "package.json"), "utf8"), cliBefore);
    assert.equal((await f.manifestAt(path.join(f.modules, CORDIS))).version, "9.8.7");
    assert.deepEqual(report.cordisPaths, [`node_modules/${CORDIS}`]);
    assert.equal(installedRequire(cli).resolve(CORDIS), installedRequire(plugin).resolve(CORDIS));
    assert.deepEqual((await f.manifestAt(f.root)).dependencies, { [CLI]: "workspace:*" });
    assert.equal((await f.manifestAt(f.root)).name, "magda-dsh-cli-peer-closure");
    assert.deepEqual(JSON.parse(await readFile(path.join(f.root, "provenance/dsh-prune.json"), "utf8")), report);
});

test("an already restored required peer is retained, including its ordinary dependencies", async (t) => {
    const f = await fixture(t);
    await f.pkg(CLI, { peerDependencies: { restored: "*" } });
    await f.pkg("restored", { version: "7.6.5", dependencies: { ordinary: "*" } });
    await f.pkg("ordinary", { version: "3.2.1" });
    const report = await pruneRuntime({ root: f.root });
    assert.equal(report.removed.length, 0);
    assert.deepEqual(report.retainedPackages.map((item) => [item.name, item.version]), [
        [CLI, "1.2.3"], ["ordinary", "3.2.1"], ["restored", "7.6.5"]
    ]);
});

test("missing required peers fail before ANY package, .bin or metadata mutation", async (t) => {
    const f = await fixture(t);
    await f.pkg(CLI, { peerDependencies: { missing: "*" } });
    const unused = await f.pkg("unused");
    await mkdir(path.join(f.modules, ".bin"));
    await writeFile(path.join(f.modules, ".bin/sentinel"), "unchanged");
    const before = await readFile(path.join(f.root, "package.json"), "utf8");
    await assert.rejects(pruneRuntime({ root: f.root }), /Missing required dependency\/peer missing/);
    assert.equal(await f.exists(unused), true);
    assert.equal(await readFile(path.join(f.modules, ".bin/sentinel"), "utf8"), "unchanged");
    assert.equal(await readFile(path.join(f.root, "package.json"), "utf8"), before);
    assert.equal(await f.exists(path.join(f.root, "provenance")), false);
});

test("missing ordinary dependencies and unsupported required packages fail closed", async (t) => {
    for (const unsupported of [false, true]) {
        const f = await fixture(t);
        await f.pkg(CLI, { dependencies: { required: "*" } });
        const unused = await f.pkg("unused");
        if (unsupported) await f.pkg("required", { os: [`!${process.platform}`] });
        await assert.rejects(pruneRuntime({ root: f.root }), /Missing required dependency\/peer required/);
        assert.equal(await f.exists(unused), true);
    }
});

test("optional peer required elsewhere remains, but its own optional peers do not", async (t) => {
    const f = await fixture(t);
    await f.pkg(CLI, { dependencies: { plugin: "*", ordinary: "*" } });
    await f.pkg("plugin", { peerDependencies: { sdk: "*" }, peerDependenciesMeta: { sdk: { optional: true } } });
    await f.pkg("ordinary", { dependencies: { sdk: "*" } });
    await f.pkg("sdk", {
        peerDependencies: { unused: "*" },
        peerDependenciesMeta: { unused: { optional: true } },
        dependencies: { express: "*" }
    });
    await f.pkg("express");
    await f.pkg("unused");
    const report = await pruneRuntime({ root: f.root });
    assert.deepEqual(report.removed.map((item) => item.name), ["unused"]);
    assert.equal(report.retained.packages, 5);
});

test("client-private browser peers are skipped without suppressing ordinary or host peers", async (t) => {
    const f = await fixture(t);
    await f.pkg(CLI, { dependencies: { client: "*" } });
    await f.pkg("client", {
        dsh: { client: true },
        dependencies: { "@deepseek-ai/dsh-client-ordinary": "*" },
        peerDependencies: {
            "@deepseek-ai/dsh-client-absent": "*",
            "@deepseek-ai/dsh-client-unused": "*",
            "@deepseek-ai/dsh-client-ordinary": "*",
            "@deepseek-ai/dsh-host": "*",
            [CORDIS]: "*"
        }
    });
    await f.pkg("@deepseek-ai/dsh-client-unused");
    await f.pkg("@deepseek-ai/dsh-client-ordinary");
    await f.pkg("@deepseek-ai/dsh-host");
    await f.pkg(CORDIS);
    const report = await pruneRuntime({ root: f.root });
    assert.deepEqual(report.removed.map((item) => item.name), ["@deepseek-ai/dsh-client-unused"]);
    assert.equal(report.retained.packages, 5);
});

test("private client peers without the client manifest marker are required", async (t) => {
    const f = await fixture(t);
    await f.pkg(CLI, { peerDependencies: { "@deepseek-ai/dsh-client-required": "*" } });
    await assert.rejects(pruneRuntime({ root: f.root }), /Missing required dependency\/peer @deepseek-ai\/dsh-client-required/);
});

test("retains supported optional native packages and prunes foreign OS/CPU packages and their trees", async (t) => {
    const f = await fixture(t);
    await f.pkg(CLI, {
        dependencies: { override: "*" },
        optionalDependencies: { supported: "*", foreignOS: "*", foreignCPU: "*", absent: "*", override: "*" }
    });
    await f.pkg("supported", { os: [process.platform], cpu: [process.arch], dependencies: { nativeHelper: "*" } });
    await f.pkg("nativeHelper");
    const foreign = await f.pkg("foreignOS", { os: [`!${process.platform}`], dependencies: { foreignChild: "*" } });
    await f.pkg("foreignChild", {}, path.join(foreign, "node_modules"));
    await f.pkg("foreignCPU", { cpu: [`!${process.arch}`] });
    await f.pkg("override", { os: ["not-a-real-platform"] });
    const report = await pruneRuntime({ root: f.root });
    assert.equal(report.retained.packages, 3);
    assert.deepEqual(report.removed.map((item) => item.name).sort(), ["foreignCPU", "foreignChild", "foreignOS", "override"]);
    assert.deepEqual(report.skippedOptional.map((item) => [item.name, item.reason]), [
        ["absent", "not-installed"], ["foreignCPU", "unsupported-os-cpu"], ["foreignOS", "unsupported-os-cpu"], ["override", "unsupported-os-cpu"]
    ]);
});

test("Node nested resolution preserves distinct installed versions, removes unused duplicates, and keeps one Cordis path", async (t) => {
    const f = await fixture(t);
    const cli = await f.pkg(CLI, { dependencies: { a: "*", b: "*" }, peerDependencies: { [CORDIS]: "*" } });
    const a = await f.pkg("a", { dependencies: { shared: "1" }, peerDependencies: { [CORDIS]: "*" } });
    const b = await f.pkg("b", { dependencies: { shared: "2" }, peerDependencies: { [CORDIS]: "*" } });
    const first = await f.pkg("shared", { version: "1.0.7", exports: "./index.cjs" });
    const second = await f.pkg("shared", { version: "2.0.9", exports: "./index.cjs" }, path.join(b, "node_modules"));
    await f.pkg(CORDIS);
    const unused = await f.pkg("unused");
    await f.pkg("shared", { version: "3.0.2" }, path.join(unused, "node_modules"));
    await f.pkg(CORDIS, { version: "0.0.1" }, path.join(unused, "node_modules"));
    const report = await pruneRuntime({ root: f.root });
    assert.equal(installedRequire(a).resolve("shared"), path.join(first, "index.cjs"));
    assert.equal(installedRequire(b).resolve("shared"), path.join(second, "index.cjs"));
    assert.deepEqual(report.retainedPackages.filter((item) => item.name === "shared").map((item) => item.version).sort(), ["1.0.7", "2.0.9"]);
    assert.deepEqual(report.removed.filter((item) => item.name === "shared").map((item) => item.version), ["3.0.2"]);
    assert.equal(report.cordisPaths.length, 1);
    assert.equal(installedRequire(cli).resolve(CORDIS), installedRequire(a).resolve(CORDIS));
    assert.equal(installedRequire(cli).resolve(CORDIS), installedRequire(b).resolve(CORDIS));
    assert.equal(await f.exists(unused), false);
});

test("npm aliases retain actual manifest identity and dependency-folder keys despite exports restrictions", async (t) => {
    const f = await fixture(t, {
        dependencies: { [CLI]: "workspace:*", alias: "npm:@actual/scoped@8.4.2", unused: "1.0.0" },
        optionalDependencies: { alias: "npm:@actual/scoped@8.4.2", unused: "1.0.0" },
        peerDependencies: { alias: "*", unused: "*" },
        peerDependenciesMeta: { alias: { optional: true }, unused: { optional: true } },
        devDependencies: { alias: "npm:@actual/scoped@8.4.2", unused: "1.0.0" }
    });
    const cli = await f.pkg(CLI, { dependencies: { alias: "npm:@actual/scoped@8.4.2" } });
    const alias = await f.pkg("alias", {
        name: "@actual/scoped",
        version: "8.4.2",
        exports: { ".": "./index.cjs" },
        dependencies: { sub: "*" }
    });
    await f.pkg("sub");
    await f.pkg("unused");
    const report = await pruneRuntime({ root: f.root });
    assert.equal(installedRequire(cli).resolve("alias"), path.join(alias, "index.cjs"));
    assert.throws(() => installedRequire(cli).resolve("alias/package.json"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    assert(report.retainedPackages.some((item) => item.name === "@actual/scoped" && item.path === "node_modules/alias" && item.version === "8.4.2"));
    const metadata = await f.manifestAt(f.root);
    assert.deepEqual(metadata.dependencies, { [CLI]: "workspace:*", alias: "npm:@actual/scoped@8.4.2" });
    assert.deepEqual(metadata.optionalDependencies, { alias: "npm:@actual/scoped@8.4.2" });
    assert.deepEqual(metadata.peerDependencies, { alias: "*" });
    assert.deepEqual(metadata.peerDependenciesMeta, { alias: { optional: true } });
    assert.deepEqual(metadata.devDependencies, { alias: "npm:@actual/scoped@8.4.2" });
});

test("a retained nested version does not preserve unused root assembly dependency metadata", async (t) => {
    const f = await fixture(t, { dependencies: { [CLI]: "workspace:*", shared: "1.0.0" } });
    const cli = await f.pkg(CLI, { dependencies: { shared: "2" } });
    await f.pkg("shared", { version: "1.0.0" });
    await f.pkg("shared", { version: "2.0.0" }, path.join(cli, "node_modules"));
    const report = await pruneRuntime({ root: f.root });
    assert.deepEqual(report.removed.map((item) => [item.name, item.version]), [["shared", "1.0.0"]]);
    assert.deepEqual((await f.manifestAt(f.root)).dependencies, { [CLI]: "workspace:*" });
});

test("rejects escaping/internal package links and scoped/nested node_modules links before removals", async (t) => {
    for (const kind of ["external", "internal", "scope", "nested", "root", "manifest", "provenance"]) {
        const f = await fixture(t);
        const cli = await f.pkg(CLI);
        const unused = await f.pkg("unused");
        const outside = path.join(f.home, "outside");
        await mkdir(outside);
        await writeFile(path.join(outside, "sentinel"), "preserved");
        let root = f.root;
        if (kind === "external" || kind === "internal") {
            await symlink(kind === "external" ? outside : unused, path.join(f.modules, "linked"), "dir");
        } else if (kind === "scope") {
            await symlink(outside, path.join(f.modules, "@escape"), "dir");
        } else if (kind === "nested") {
            await symlink(outside, path.join(cli, "node_modules"), "dir");
        } else if (kind === "root") {
            root = path.join(f.home, "linked-deployment");
            await symlink(f.root, root, "dir");
        } else if (kind === "manifest") {
            const manifest = path.join(unused, "package.json");
            // Verified literal package manifest under this test's temporary root.
            assert(manifest.startsWith(f.root + path.sep));
            await rm(manifest);
            const externalManifest = path.join(outside, "package.json");
            await json(externalManifest, { name: "unused", version: "1.2.3" });
            await symlink(externalManifest, manifest);
        } else {
            await symlink(outside, path.join(f.root, "provenance"), "dir");
        }
        const before = await readFile(path.join(f.root, "package.json"), "utf8");
        await assert.rejects(pruneRuntime({ root }), /Unmaterialized symlink/);
        assert.equal(await f.exists(unused), true, kind);
        assert.equal(await readFile(path.join(outside, "sentinel"), "utf8"), "preserved");
        assert.equal(await readFile(path.join(f.root, "package.json"), "utf8"), before);
    }
});

test("rejects unsafe roots, source checkouts, traversal entry/dependency keys, and unmaterialized stores", async (t) => {
    await assert.rejects(pruneRuntime(), /explicit deployment root/);
    await assert.rejects(pruneRuntime({ root: process.cwd() }), /Refusing source\/current\/home/);
    await assert.rejects(pruneRuntime({ root: "/" }), /Refusing source\/current\/home/);
    for (const kind of ["marker", "checkout", "workspaces", "entry", "dependency", "store"]) {
        const f = await fixture(t);
        const cli = await f.pkg(CLI, kind === "dependency" ? { dependencies: { "../escape": "*" } } : {});
        const unused = await f.pkg("unused");
        if (kind === "marker") await json(path.join(f.root, "package.json"), { name: "ordinary-project" });
        if (kind === "checkout") await mkdir(path.join(f.home, ".git"));
        if (kind === "workspaces") await json(path.join(f.root, "package.json"), { ...f.manifest, workspaces: ["packages/*"] });
        if (kind === "store") await mkdir(path.join(f.modules, ".pnpm/unaccounted-package"), { recursive: true });
        const options = { root: f.root, ...(kind === "entry" ? { entry: "../escape" } : {}) };
        await assert.rejects(pruneRuntime(options), /Deployment package.json|source checkout|source workspace|Unsafe package name|Unmaterialized package-manager/);
        assert.equal(await f.exists(unused), true);
        assert.equal(await f.exists(cli), true);
    }
});

test("removes only recognized inert pnpm build metadata, not an uninventoried store", async (t) => {
    const f = await fixture(t);
    await f.pkg(CLI);
    await mkdir(path.join(f.modules, ".pnpm"));
    for (const name of [".modules.yaml", ".pnpm-workspace-state-v1.json", ".pnpm/lock.yaml", ".package-lock.json"]) {
        await writeFile(path.join(f.modules, name), "synthetic source-graph metadata\n");
    }
    const report = await pruneRuntime({ root: f.root });
    assert.equal(report.before.packages, 1);
    assert.equal(report.removed.length, 0);
    assert.deepEqual(report.buildMetadataRemoved, [
        "node_modules/.modules.yaml", "node_modules/.package-lock.json", "node_modules/.pnpm", "node_modules/.pnpm-workspace-state-v1.json"
    ]);
    for (const file of report.buildMetadataRemoved) assert.equal(await f.exists(path.join(f.root, file)), false);
});

test("removes empty top-level and nested .tmp metadata directories", async (t) => {
    const f = await fixture(t);
    const cli = await f.pkg(CLI, { dependencies: { "@deepseek-ai/dsh-subprocess-local": "*" } });
    const subprocess = await f.pkg("@deepseek-ai/dsh-subprocess-local");
    const scratch = [
        path.join(f.modules, ".tmp"),
        path.join(cli, "node_modules/.tmp"),
        path.join(subprocess, "node_modules/.tmp")
    ];
    for (const directory of scratch) await mkdir(directory, { recursive: true });
    const report = await pruneRuntime({ root: f.root });
    assert.equal(report.retained.packages, 2);
    assert.deepEqual(report.buildMetadataRemoved,
        scratch.map((directory) => path.relative(f.root, directory)).sort());
    for (const directory of scratch) assert.equal(await f.exists(directory), false);
});

test("nonempty .tmp scratch directories fail before any package or metadata mutation", async (t) => {
    for (const nested of [false, true]) {
        const f = await fixture(t);
        const cli = await f.pkg(CLI);
        const unused = await f.pkg("unused");
        const scratch = path.join(nested ? path.join(cli, "node_modules") : f.modules, ".tmp");
        await mkdir(scratch, { recursive: true });
        await writeFile(path.join(scratch, "sentinel"), "unexpected payload preserved");
        const empty = path.join(unused, "node_modules/.tmp");
        await mkdir(empty, { recursive: true });
        const before = await readFile(path.join(f.root, "package.json"), "utf8");
        await assert.rejects(pruneRuntime({ root: f.root }), /Nonempty package-manager scratch directory/);
        assert.equal(await f.exists(unused), true);
        assert.equal(await f.exists(empty), true);
        assert.equal(await readFile(path.join(scratch, "sentinel"), "utf8"), "unexpected payload preserved");
        assert.equal(await readFile(path.join(f.root, "package.json"), "utf8"), before);
        assert.equal(await f.exists(path.join(f.root, "provenance")), false);
    }
});

test("explicit fixture marker permits a synthetic assembly, and harmless .bin links are removed safely", async (t) => {
    const f = await fixture(t, { name: "synthetic-fixture", dshPruneFixture: true });
    await f.pkg(CLI);
    await f.pkg("unused");
    const outside = path.join(f.home, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "sentinel"), "preserved");
    await mkdir(path.join(f.modules, ".bin"));
    await symlink(path.join(outside, "sentinel"), path.join(f.modules, ".bin/unused"));
    await pruneRuntime({ root: f.root });
    assert.equal(await f.exists(path.join(f.modules, ".bin")), false);
    assert.equal(await readFile(path.join(outside, "sentinel"), "utf8"), "preserved");
});

test("CLI writes audit report and a second prune cannot resurrect removed root dependencies", async (t) => {
    const f = await fixture(t, { dependencies: { [CLI]: "workspace:*", unused: "1.2.3" } });
    await f.pkg(CLI);
    await f.pkg("unused");
    const run = () => spawnSync(process.execPath, [helper, f.root], {
        cwd: f.home,
        encoding: "utf8",
        timeout: 30_000
    });
    const first = run();
    assert.ifError(first.error);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Pruned 1 package instances; retained 1 instances/);
    assert.equal(JSON.parse(await readFile(path.join(f.root, "provenance/dsh-prune.json"), "utf8")).removed.length, 1);
    const second = run();
    assert.ifError(second.error);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /Pruned 0 package instances; retained 1 instances/);
    assert.deepEqual((await f.manifestAt(f.root)).dependencies, { [CLI]: "workspace:*" });
    assert.equal(await f.exists(path.join(f.modules, "unused")), false);
});
