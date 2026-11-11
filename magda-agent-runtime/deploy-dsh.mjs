// Package the pinned upstream runtime assembly, not the CLI-only dependency
// graph: required workspace peers and preset plugins are explicit in this root.
// The legacy-hoist repair follows upstream scripts/build-exe-for-python-sdk.ts.
import assert from "node:assert/strict";
import { existsSync, globSync } from "node:fs";
import {
    cp,
    lstat,
    mkdir,
    readFile,
    readdir,
    realpath,
    rm,
    writeFile
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const source = process.cwd();
const target = path.resolve(process.argv[2]);
assert(target !== source && !source.startsWith(target + path.sep));
const manifest = JSON.parse(
    await readFile(path.join(target, "package.json"), "utf8")
);
const modules = path.join(target, "node_modules");
const sourceModules = path.join(source, "python/sdk-runtime/node_modules");
async function copyPackage(from, to) {
    const nested = path.join(from, "node_modules");
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, {
        recursive: true,
        dereference: true,
        filter: (file) => file !== nested && !file.startsWith(nested + path.sep)
    });
}
for (const name of Object.keys(manifest.dependencies)) {
    const destination = path.join(modules, name);
    if (existsSync(destination)) continue;
    const from = path.join(sourceModules, name);
    assert(existsSync(from), `Missing runtime assembly dependency: ${name}`);
    await copyPackage(await realpath(from), destination);
}
async function materialize(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.name === ".bin") {
            await rm(file, { recursive: true, force: true });
        } else if ((await lstat(file)).isSymbolicLink()) {
            const from = await realpath(file);
            await rm(file);
            await copyPackage(from, file);
            if ((await lstat(file)).isDirectory()) await materialize(file);
        } else if (entry.isDirectory()) {
            await materialize(file);
        }
    }
}
await materialize(modules);

const workspace = new Map();
const root = JSON.parse(await readFile("package.json", "utf8"));
for (const pattern of root.workspaces) {
    for (const file of globSync(`${pattern}/package.json`)) {
        const data = JSON.parse(await readFile(file, "utf8"));
        workspace.set(data.name, {
            data,
            directory: path.resolve(path.dirname(file))
        });
    }
}
assert(
    workspace.has("@deepseek-ai/dsh"),
    "Pinned source workspace discovery failed"
);
for (const [name, version] of Object.entries(manifest.dependencies)) {
    if (version.startsWith("workspace:"))
        assert(
            workspace.has(name),
            `Runtime workspace missing from pinned source: ${name}`
        );
}
// Verify each shipped workspace artifact against this checkout. Scope alone is
// not provenance: e.g. libreoffice-kit is legitimately an external dependency.
const packages = [];
const dependencies = [];
async function checkPackage(directory) {
    const data = JSON.parse(
        await readFile(path.join(directory, "package.json"), "utf8")
    );
    const local = workspace.get(data.name);
    dependencies.push({
        name: data.name,
        version: data.version,
        license: data.license ?? null
    });
    if (local) {
        assert.equal(
            data.version,
            local.data.version,
            `Wrong workspace version: ${data.name}`
        );
        const hash = createHash("sha256");
        let files = 0;
        async function compare(folder, relative = "") {
            for (const entry of (
                await readdir(folder, { withFileTypes: true })
            ).sort((a, b) => a.name.localeCompare(b.name))) {
                if (
                    entry.name === "node_modules" ||
                    entry.name === "package.json"
                )
                    continue;
                const name = path.join(relative, entry.name);
                const file = path.join(folder, entry.name);
                assert(
                    !(await lstat(file)).isSymbolicLink(),
                    `Unmaterialized link: ${file}`
                );
                if (entry.isDirectory()) await compare(file, name);
                else {
                    const bytes = await readFile(file);
                    assert.deepEqual(
                        bytes,
                        await readFile(path.join(local.directory, name)),
                        `Not a source-built artifact: ${data.name}/${name}`
                    );
                    hash.update(name).update("\0").update(bytes);
                    files++;
                }
            }
        }
        await compare(directory);
        assert(files > 0, `Empty workspace package: ${data.name}`);
        packages.push({
            name: data.name,
            version: data.version,
            files,
            sha256: hash.digest("hex")
        });
    }
    await scanModules(path.join(directory, "node_modules"));
}
async function scanModules(directory) {
    if (!existsSync(directory)) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const file = path.join(directory, entry.name);
        if (entry.name.startsWith("@")) {
            for (const name of await readdir(file))
                await checkPackage(path.join(file, name));
        } else await checkPackage(file);
    }
}
await scanModules(modules);
for (const name of Object.keys(manifest.dependencies)) {
    if (workspace.has(name))
        assert(
            packages.some((p) => p.name === name),
            `Workspace omitted from deployment: ${name}`
        );
}
await mkdir(path.join(target, "provenance"), { recursive: true });
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    await cp(path.join(source, name), path.join(target, "provenance", name));
}
await writeFile(
    path.join(target, "provenance/dsh-source.json"),
    JSON.stringify(
        {
            repository: process.env.DSH_SOURCE_REPO,
            branch: process.env.DSH_SOURCE_BRANCH,
            sha: process.env.DSH_SOURCE_SHA,
            version: root.version,
            assembly: manifest.name,
            packages: packages.sort((a, b) => a.name.localeCompare(b.name)),
            dependencies: dependencies.sort((a, b) =>
                a.name.localeCompare(b.name)
            )
        },
        null,
        2
    ) + "\n"
);
console.log(
    `Verified ${packages.length} source-built workspace packages, ${dependencies.length} total package instances`
);
