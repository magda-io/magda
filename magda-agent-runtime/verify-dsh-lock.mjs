// Modern pnpm deploy must retain the committed external resolution graph and
// use source directories (never registry tarballs) for workspace packages.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

const source = process.cwd();
const target = path.resolve(process.argv[2]);
const require = createRequire(path.join(source, "package.json"));
const yaml = require("js-yaml");
const sourceBytes = await readFile(path.join(source, "pnpm-lock.yaml"));
const locked = yaml.load(sourceBytes.toString());
const deployed = yaml.load(
    await readFile(path.join(target, "pnpm-lock.yaml"), "utf8")
);
const workspace = new Map();
for (const importer of Object.keys(locked.importers)) {
    const directory = path.resolve(source, importer);
    const manifest = JSON.parse(
        await readFile(path.join(directory, "package.json"), "utf8")
    );
    workspace.set(manifest.name, directory);
}
let externalPackages = 0;
let localPackages = 0;
for (const [key, entry] of Object.entries(deployed.packages)) {
    const name = key.slice(0, key.indexOf("@", 1));
    if (entry.resolution.type === "directory") {
        assert.equal(
            path.resolve(target, entry.resolution.directory),
            workspace.get(name),
            `Workspace source resolution changed: ${key}`
        );
        localPackages++;
    } else {
        assert(!workspace.has(name), `Registry workspace artifact: ${key}`);
        assert.deepEqual(
            entry,
            locked.packages[key],
            `External package drift: ${key}`
        );
        externalPackages++;
    }
}
for (const [key, snapshot] of Object.entries(deployed.snapshots)) {
    if (!key.includes("@file:"))
        assert.deepEqual(
            snapshot,
            locked.snapshots[key],
            `External dependency graph drift: ${key}`
        );
}
const visited = new Set();
function walk(name, reference) {
    const key = reference.includes("@file:")
        ? reference
        : `${name}@${reference}`;
    if (visited.has(key)) return;
    visited.add(key);
    const snapshot = deployed.snapshots[key];
    assert(snapshot, `Missing deployed dependency snapshot: ${key}`);
    for (const [dependency, version] of Object.entries({
        ...snapshot.dependencies,
        ...snapshot.optionalDependencies
    }))
        walk(dependency, version);
}
const root = deployed.importers["."];
assert(root, "Deployment lockfile lacks root importer");
for (const [name, entry] of Object.entries({
    ...root.dependencies,
    ...root.optionalDependencies
}))
    walk(name, entry.version);
assert(
    visited.size > 0 && localPackages > 0 && externalPackages > 0,
    "Empty deployed dependency graph"
);
const report = {
    sourceLockSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    externalPackages,
    localPackages,
    reachableSnapshots: visited.size,
    registryWorkspaceArtifacts: 0
};
await mkdir(path.join(target, "provenance"), { recursive: true });
await writeFile(
    path.join(target, "provenance/dsh-lock.json"),
    JSON.stringify(report, null, 2) + "\n"
);
console.log(`Locked deployment verified: ${JSON.stringify(report)}`);
