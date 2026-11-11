// Run AFTER deploy-dsh.mjs has materialized the deployment, then refresh its
// provenance. This is an installed-graph pruner: it never installs, upgrades,
// imports, or executes a deployed package. Node 22+, no third-party dependencies.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
    lstat,
    mkdir,
    readFile,
    readdir,
    realpath,
    rm,
    writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSEMBLY = "magda-dsh-cli-peer-closure";
const ASSEMBLIES = new Set(["dsh-python-runtime-closure", ASSEMBLY]);
const CORDIS = "@deepseek-ai/cordis";

function inside(parent, child) {
    const relative = path.relative(parent, child);
    return relative !== "" && relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function packageName(name) {
    assert(
        typeof name === "string" &&
            /^(?:@[a-zA-Z0-9_~-][a-zA-Z0-9_.~-]*\/)?[a-zA-Z0-9_~-][a-zA-Z0-9_.~-]*$/.test(name),
        `Unsafe package name: ${String(name)}`
    );
    return name;
}

async function statOrMissing(file) {
    try {
        return await lstat(file);
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

// Check every component rather than just the final realpath: even an internal
// symlink needs materializing first, so resolution and deletion use one layout.
async function noLinks(file) {
    const absolute = path.resolve(file);
    let current = path.parse(absolute).root;
    for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        const stat = await statOrMissing(current);
        if (!stat) break;
        assert(!stat.isSymbolicLink(), `Unmaterialized symlink: ${current}`);
    }
}

async function readJson(file) {
    await noLinks(file);
    return JSON.parse(await readFile(file, "utf8"));
}

function applicable(values, current) {
    if (values === undefined) return true;
    const list = typeof values === "string" ? [values] : values;
    assert(Array.isArray(list) && list.every((value) => typeof value === "string"),
        "Invalid os/cpu package constraint");
    if (list.includes(`!${current}`) || list.includes("!any")) return false;
    const positive = list.filter((value) => !value.startsWith("!"));
    return positive.length === 0 || positive.includes("any") || positive.includes(current);
}

function supported(manifest) {
    return applicable(manifest.os, process.platform) && applicable(manifest.cpu, process.arch);
}

function declarations(manifest, field) {
    const value = manifest[field] ?? {};
    assert(value && typeof value === "object" && !Array.isArray(value),
        `Invalid ${field} in ${manifest.name}`);
    for (const [name, range] of Object.entries(value)) {
        packageName(name);
        assert(typeof range === "string", `Invalid ${field} range for ${name}`);
    }
    return value;
}

function edges(manifest) {
    const optional = declarations(manifest, "optionalDependencies");
    const result = new Map();
    for (const name of Object.keys(declarations(manifest, "dependencies"))) {
        result.set(name, { name, optional: Object.hasOwn(optional, name) });
    }
    for (const name of Object.keys(optional)) result.set(name, { name, optional: true });
    for (const name of Object.keys(declarations(manifest, "peerDependencies"))) {
        if (manifest.peerDependenciesMeta?.[name]?.optional === true) continue;
        // Client-private peers are injected into the compiled browser module
        // table, not loaded by Node. Do not extend this exception to host/Cordis.
        if (manifest.dsh?.client && name.startsWith("@deepseek-ai/dsh-client-")) continue;
        result.set(name, { name, optional: false });
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function guardRoot(input) {
    assert(typeof input === "string" && input.length > 0, "An explicit deployment root is required");
    const root = path.resolve(input);
    await noLinks(root);
    assert((await lstat(root)).isDirectory(), "Deployment root is not a directory");
    // realpath also normalizes harmless platform aliases (e.g. macOS /var).
    assert.equal(await realpath(root), root, "Use the canonical deployment root path");
    const cwd = await realpath(process.cwd());
    const home = await realpath(homedir());
    assert(root !== path.parse(root).root && root !== cwd && !inside(root, cwd) && root !== home,
        "Refusing source/current/home directory as deployment root");
    assert(!["/usr", "/usr/local", "/usr/lib", "/usr/local/lib", "/opt", "/tmp", "/var/tmp"]
        .some((directory) => root === directory), "Refusing a global directory as deployment root");
    assert(!inside(home, root) || ![".npm", ".local", ".nvm", ".volta", ".config"]
        .some((directory) => root === path.join(home, directory) || inside(path.join(home, directory), root)),
        "Refusing a global user package directory");
    for (let directory = root; ; directory = path.dirname(directory)) {
        assert(!(await statOrMissing(path.join(directory, ".git"))),
            `Refusing source checkout deployment root: ${root}`);
        if (path.dirname(directory) === directory) break;
    }
    const manifest = await readJson(path.join(root, "package.json"));
    assert(ASSEMBLIES.has(manifest.name) || manifest.dshPruneFixture === true,
        "Deployment package.json must name dsh-python-runtime-closure or magda-dsh-cli-peer-closure (synthetic tests may set dshPruneFixture: true)");
    assert(!manifest.workspaces, "Refusing a source workspace assembly");
    return { root, manifest };
}

/**
 * Prune a materialized deployment to the CLI's installed dependency/required-peer
 * closure. All inventory, resolution and safety validation completes before the
 * first mutation. Optional peers alone never make an installed package reachable.
 * Synthetic fixtures opt in with root package.json { dshPruneFixture: true }.
 */
export async function pruneRuntime({ root: input, entry = "@deepseek-ai/dsh" } = {}) {
    packageName(entry);
    const { root, manifest: assembly } = await guardRoot(input);
    const modules = path.join(root, "node_modules");
    await noLinks(modules);
    assert((await lstat(modules)).isDirectory(), "Deployment node_modules is not a directory");
    const inventory = new Map();
    const binDirectories = [];
    const buildMetadata = [];

    async function inventoryPackage(directory) {
        await noLinks(directory);
        assert((await lstat(directory)).isDirectory(), `Invalid package directory: ${directory}`);
        const manifest = await readJson(path.join(directory, "package.json"));
        packageName(manifest.name);
        assert(typeof manifest.version === "string", `Missing package version: ${directory}`);
        inventory.set(directory, { directory, manifest });
        await scanModules(path.join(directory, "node_modules"));
    }

    async function scanModules(directory) {
        await noLinks(directory);
        const stat = await statOrMissing(directory);
        if (!stat) return;
        assert(stat.isDirectory(), `Invalid node_modules directory: ${directory}`);
        for (const item of (await readdir(directory)).sort()) {
            const file = path.join(directory, item);
            // .bin can be removed as a unit: it is never a dependency target.
            if (item === ".bin") {
                await noLinks(file);
                assert((await lstat(file)).isDirectory(), `Invalid .bin directory: ${file}`);
                binDirectories.push(file);
                continue;
            }
            // pnpm can leave an empty scratch directory in nested node_modules.
            // Never treat unexpected scratch payload as disposable metadata.
            if (item === ".tmp") {
                await noLinks(file);
                assert((await lstat(file)).isDirectory(), `Invalid package-manager scratch directory: ${file}`);
                assert((await readdir(file)).length === 0,
                    `Nonempty package-manager scratch directory: ${file}`);
                buildMetadata.push(file);
                continue;
            }
            // The deployed pnpm store must be inert (lock.yaml only), not an
            // unaccounted package payload. Discard stale build-only metadata so
            // its source graph cannot be confused with the shipped CLI closure.
            if (item === ".pnpm") {
                await noLinks(file);
                assert((await lstat(file)).isDirectory(), `Invalid pnpm metadata directory: ${file}`);
                const children = await readdir(file);
                assert(children.every((child) => child === "lock.yaml"),
                    `Unmaterialized package-manager store: ${file}`);
                for (const child of children) {
                    const lock = path.join(file, child);
                    await noLinks(lock);
                    assert((await lstat(lock)).isFile(), `Invalid pnpm lock metadata: ${lock}`);
                }
                buildMetadata.push(file);
                continue;
            }
            if ([".package-lock.json", ".modules.yaml", ".pnpm-workspace-state-v1.json"].includes(item)) {
                await noLinks(file);
                assert((await lstat(file)).isFile(), `Invalid package-manager metadata: ${file}`);
                buildMetadata.push(file);
                continue;
            }
            assert(!item.startsWith("."), `Unmaterialized package-manager entry: ${file}`);
            if (item.startsWith("@")) {
                await noLinks(file);
                assert((await lstat(file)).isDirectory(), `Invalid package scope: ${file}`);
                for (const child of (await readdir(file)).sort()) {
                    packageName(`${item}/${child}`);
                    await inventoryPackage(path.join(file, child));
                }
            } else {
                packageName(item);
                await inventoryPackage(file);
            }
        }
    }
    await scanModules(modules);

    function resolveInstalled(from, name) {
        packageName(name);
        const require = createRequire(path.join(from, "package.json"));
        // Do not resolve "name/package.json": exports can hide it. Node's search
        // directories plus direct manifest reads also support npm: folder aliases.
        for (const directory of require.resolve.paths(name) ?? []) {
            const candidate = path.join(directory, name);
            if (!inside(modules, candidate)) continue; // Never use host/global packages.
            const installed = inventory.get(candidate);
            if (installed) return installed;
        }
        return null;
    }

    const initial = resolveInstalled(root, entry);
    assert(initial, `Missing required entry package: ${entry}`);
    assert(supported(initial.manifest), `Unsupported entry package: ${entry}`);
    const retained = new Set();
    const skippedOptional = [];
    const pending = [initial];
    while (pending.length) {
        const current = pending.pop();
        if (retained.has(current.directory)) continue;
        retained.add(current.directory);
        for (const edge of edges(current.manifest)) {
            const dependency = resolveInstalled(current.directory, edge.name);
            if (!dependency || !supported(dependency.manifest)) {
                const reason = dependency ? "unsupported-os-cpu" : "not-installed";
                if (edge.optional) {
                    skippedOptional.push({
                        from: path.relative(root, current.directory),
                        name: edge.name,
                        reason
                    });
                    continue;
                }
                assert.fail(`Missing required dependency/peer ${edge.name} from ${current.manifest.name} (${reason})`);
            }
            pending.push(dependency);
        }
    }

    // Protect structural parents if a selected nested package needs them. This
    // normally cannot occur in a fully materialized ordinary Node layout, but a
    // future custom entry must not make deleting a parent destroy selected data.
    const containers = new Set([...inventory.keys()].filter((directory) =>
        !retained.has(directory) && [...retained].some((selected) => inside(directory, selected))));
    const removed = [...inventory.values()].filter((item) =>
        !retained.has(item.directory) && !containers.has(item.directory));
    const relativeRecord = ({ directory, manifest }) => ({
        name: manifest.name,
        version: manifest.version,
        path: path.relative(root, directory).split(path.sep).join("/")
    });
    const sortedRecords = (items) => items.map(relativeRecord).sort((a, b) => a.path.localeCompare(b.path));
    const kept = [...inventory.values()].filter((item) => retained.has(item.directory));
    const counts = (items) => ({
        packages: items.length,
        names: new Set(items.map((item) => item.manifest.name)).size
    });
    const filteredAssembly = { ...assembly, name: ASSEMBLY };
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
        if (assembly[field] === undefined) continue;
        filteredAssembly[field] = Object.fromEntries(Object.entries(declarations(assembly, field))
            .filter(([name]) => retained.has(path.join(modules, name))));
    }
    if (assembly.peerDependenciesMeta) {
        filteredAssembly.peerDependenciesMeta = Object.fromEntries(Object.entries(assembly.peerDependenciesMeta)
            .filter(([name]) => Object.hasOwn(filteredAssembly.peerDependencies ?? {}, name)));
    }
    const report = {
        schemaVersion: 1,
        entry,
        platform: process.platform,
        arch: process.arch,
        assemblyBefore: assembly.name,
        assemblyAfter: ASSEMBLY,
        before: counts([...inventory.values()]),
        retained: counts(kept),
        removed: sortedRecords(removed),
        retainedPackages: sortedRecords(kept),
        containerPaths: [...containers].map((directory) => path.relative(root, directory)).sort(),
        buildMetadataRemoved: buildMetadata.map((file) => path.relative(root, file).split(path.sep).join("/")).sort(),
        cordisPaths: sortedRecords(kept.filter((item) => item.manifest.name === CORDIS)).map((item) => item.path),
        skippedOptional: skippedOptional.sort((a, b) => `${a.from}/${a.name}`.localeCompare(`${b.from}/${b.name}`))
    };

    // Preflight all mutation destinations before touching the deployment. Refuse
    // pre-existing provenance links too; writing reports must never escape root.
    const reportDirectory = path.join(root, "provenance");
    const reportFile = path.join(reportDirectory, "dsh-prune.json");
    await noLinks(reportFile);
    const reportStat = await statOrMissing(reportDirectory);
    assert(!reportStat || reportStat.isDirectory(), "Invalid provenance directory");
    const existingReport = await statOrMissing(reportFile);
    assert(!existingReport || existingReport.isFile(), "Invalid prune report file");
    async function deletionGuard(directory) {
        assert(path.isAbsolute(directory) && inside(modules, directory),
            `Refusing deletion outside deployment node_modules: ${directory}`);
        await noLinks(directory);
        const resolved = await realpath(directory);
        assert(resolved === directory && inside(modules, resolved),
            `Refusing escaping deletion: ${directory}`);
        if (buildMetadata.includes(directory) && path.basename(directory) === ".tmp") {
            assert((await readdir(directory)).length === 0,
                `Nonempty package-manager scratch directory: ${directory}`);
        }
    }
    // Delete only highest unselected package roots (their nested unselected
    // instances are still individually listed in the audit report).
    const deleteRoots = removed.map((item) => item.directory).filter((directory, _, all) =>
        !all.some((parent) => inside(parent, directory)));
    const ancillary = [...binDirectories, ...buildMetadata].filter((directory) =>
        !deleteRoots.some((parent) => inside(parent, directory)));
    for (const directory of [...deleteRoots, ...ancillary]) await deletionGuard(directory);
    for (const directory of [...deleteRoots, ...ancillary]) {
        await deletionGuard(directory); // Revalidate absolute containment before EVERY removal.
        await rm(directory, { recursive: true });
    }
    await noLinks(path.join(root, "package.json"));
    await writeFile(path.join(root, "package.json"), JSON.stringify(filteredAssembly, null, 2) + "\n");
    await noLinks(reportFile);
    await mkdir(reportDirectory, { recursive: true });
    await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
    return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        assert(process.argv.length === 3, "Usage: node prune-dsh-runtime.mjs /opt/dsh-release");
        const report = await pruneRuntime({ root: process.argv[2] });
        console.log(`Pruned ${report.removed.length} package instances; retained ${report.retained.packages} instances (${report.retained.names} names)`);
    } catch (error) {
        console.error(error.stack ?? error.message);
        process.exitCode = 1;
    }
}
