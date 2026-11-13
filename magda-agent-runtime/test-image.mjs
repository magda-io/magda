#!/usr/bin/env node
// Run INSIDE the finished image, without its bootstrap entrypoint or credentials:
// docker run --rm --network none --entrypoint node \
//   --mount type=bind,src="$PWD/magda-agent-runtime/test-image.mjs",dst=/tmp/test-image.mjs,readonly \
//   IMAGE /tmp/test-image.mjs
// Host-only regression checks for this test's fail-closed helpers:
// node magda-agent-runtime/test-image.mjs --self-test
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
    access,
    lstat,
    mkdtemp,
    open,
    readFile,
    readdir,
    realpath,
    rm,
    writeFile
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED = Object.freeze({
    repository: "https://github.com/magda-io/dsh-fork.git",
    ref: "magda/0.2.1-alpha.1/1.0.1",
    sha: "c929e29667e6ccac97c1575e18fb56b1c9ead6c6",
    upstream: {
        ref: "upstream/0.2.1-alpha.1",
        sha: "5badb15009ae1756c3afe0ae0cef1faafc290ccc"
    },
    version: "0.2.1-alpha.1",
    assembly: "magda-dsh-cli-peer-closure"
});
const CLI = "/usr/local/lib/node_modules/@deepseek-ai/dsh";
const PROVENANCE = "/usr/local/share/magda-agent/dsh-source.json";
const WORKSPACE = "@deepseek-ai/dsh-api-workspace-controller";
const CORDIS = "@deepseek-ai/cordis";
const WRAPPER = "/usr/local/lib/magda-agent/libreoffice-kit-cli.mjs";
const MANAGED = [
    "@magda/dsh-client-managed-profile",
    "@magda/dsh-workflow-capture-guidance",
    "@magda/dsh-agent-skill-tools"
];
const RENAMES = new Map([
    [
        "lib/index.js",
        'paths.join(directory, "agent-harness", DEFAULT_WORKSPACE_DIRECTORY)'
    ],
    [
        "lib/types/default-directory.js",
        "paths.join(directory, 'agent-harness', DEFAULT_WORKSPACE_DIRECTORY)"
    ]
]);
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const load = async (require, name) =>
    import(pathToFileURL(require.resolve(name)).href);
let checks = 0;
async function check(name, body) {
    try {
        await body();
        console.log(`ok ${++checks} - ${name}`);
    } catch (cause) {
        throw new Error(`FAIL - ${name}`, { cause });
    }
}

// Reverse ONLY the two explicitly permitted downstream edits when comparing the
// upstream digest. Missing, repeated or still-unbranded expressions are failures.
function sourceBytes(name, relative, bytes) {
    const branded = name === WORKSPACE && RENAMES.get(relative);
    if (!branded) return bytes;
    const upstream = branded.replace("agent-harness", "deepseek-harness");
    const text = bytes.toString("utf8");
    assert.equal(
        text.split(branded).length - 1,
        1,
        `Expected exactly one branded expression in ${name}/${relative}`
    );
    assert.equal(
        text.split(upstream).length - 1,
        0,
        `Unpatched workspace expression in ${name}/${relative}`
    );
    return Buffer.from(text.replace(branded, upstream));
}

// Same traversal and byte framing as deploy-dsh.mjs. package.json is intentionally
// excluded upstream because pnpm rewrites workspace ranges during deployment.
async function artifactDigest(directory, name) {
    const hash = createHash("sha256");
    let files = 0;
    const seen = new Set();
    async function walk(folder, relative = "") {
        for (const entry of (
            await readdir(folder, { withFileTypes: true })
        ).sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name === "node_modules" || entry.name === "package.json")
                continue;
            const nameInPackage = path.join(relative, entry.name);
            const file = path.join(folder, entry.name);
            const info = await lstat(file);
            assert(
                !info.isSymbolicLink(),
                `Unmaterialized source artifact: ${file}`
            );
            if (info.isDirectory()) await walk(file, nameInPackage);
            else {
                assert(info.isFile(), `Not a regular artifact: ${file}`);
                hash.update(nameInPackage)
                    .update("\0")
                    .update(
                        sourceBytes(name, nameInPackage, await readFile(file))
                    );
                seen.add(nameInPackage);
                files++;
            }
        }
    }
    await walk(directory);
    if (name === WORKSPACE)
        for (const file of RENAMES.keys())
            assert(seen.has(file), `Missing workspace entry point: ${file}`);
    return { files, sha256: hash.digest("hex") };
}

// Resolve from each consumer's real install location, never from this mounted
// script or NODE_PATH. This also works for packages hiding package.json exports.
function packageDirectory(require, name) {
    for (const search of require.resolve.paths(name) ?? []) {
        const directory = path.join(search, name);
        if (existsSync(path.join(directory, "package.json"))) return directory;
    }
    throw new Error(`Unresolvable runtime dependency: ${name}`);
}

async function scanPackages(modules, result = []) {
    if (!existsSync(modules)) return result;
    async function visit(directory) {
        const manifest = await json(path.join(directory, "package.json"));
        result.push({ directory, manifest });
        await scanPackages(path.join(directory, "node_modules"), result);
    }
    for (const entry of await readdir(modules, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const directory = path.join(modules, entry.name);
        if (entry.name.startsWith("@")) {
            for (const child of await readdir(directory))
                await visit(path.join(directory, child));
        } else await visit(directory);
    }
    return result;
}

function successful(result, label) {
    assert.ifError(result.error);
    assert.equal(result.signal, null, `${label} killed by ${result.signal}`);
    assert.equal(
        result.status,
        0,
        `${label}: exit ${result.status}\n${result.stderr ?? ""}\n${
            result.stdout ?? ""
        }`
    );
}

// Do not use probe() alone: upstream deliberately returns 'unusable' for BOTH
// missing binaries and unsupported kernels. Spawn/load errors remain failures.
function landlockVerdict(result) {
    assert.ifError(result.error);
    assert.equal(result.signal, null, "landlock-run probe was killed");
    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();
    if (result.status === 0) {
        assert.equal(stderr, "", "Unexpected landlock probe diagnostic");
        if (stdout === "landlock: fully enforced") return "full";
        assert.equal(
            stdout,
            "landlock: partially enforced (older ABI)",
            "Unknown landlock probe report"
        );
        return "partial";
    }
    assert.equal(result.status, 125, "Unexpected landlock probe exit code");
    assert.equal(stdout, "", "Unexpected failed landlock probe output");
    assert.match(
        stderr,
        /^landlock-run: (?:landlock is not enforced by this kernel \(ABI unsupported or disabled\)|landlock ruleset error: (?:Operation not permitted|Permission denied|Function not implemented|Operation not supported))$/,
        "Unknown launcher failure is not an unsupported-kernel skip"
    );
    return "kernel-or-container-policy-unavailable";
}

async function withLockFiles(directory, body) {
    const file = path.join(directory, "flock");
    const first = await open(file, "a+");
    const second = await open(file, "a+");
    try {
        await body(first, second);
    } finally {
        await first.close();
        await second.close();
    }
}

async function ptySmoke(pty, directory) {
    const terminal = pty.spawn("/bin/sh", ["-c", 'printf "MAGDA_PTY_OK\\n"'], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: directory,
        env: { PATH: "/usr/bin:/bin", TERM: "xterm-256color", LANG: "C.UTF-8" }
    });
    let output = "";
    let data, exit, timeout;
    try {
        await new Promise((resolve, reject) => {
            timeout = setTimeout(
                () => reject(new Error("node-pty spawn timed out")),
                10000
            );
            data = terminal.onData((chunk) => {
                output += chunk;
            });
            exit = terminal.onExit((event) => {
                try {
                    assert.equal(event.exitCode, 0, "PTY child exit");
                    assert.match(
                        output,
                        /MAGDA_PTY_OK/,
                        "PTY must deliver real child output"
                    );
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    } finally {
        clearTimeout(timeout);
        data?.dispose();
        exit?.dispose();
        try {
            terminal.kill();
        } catch {
            /* already reaped */
        }
    }
}

async function runImageChecks() {
    assert.equal(
        process.platform,
        "linux",
        "Run this script inside the built Linux runtime image (or use --self-test)"
    );
    assert.equal(
        Number(process.versions.node.split(".")[0]),
        22,
        "Qualify the runtime's pinned Node 22 ABI"
    );
    assert.equal(process.getuid(), 10001, "Qualify the non-root runtime user");
    // A global CLI symlink may point at an isolated flat assembly, keeping mgd's
    // dependencies from overwriting DSH's. Resolve it before anchoring imports.
    const cliDirectory = await realpath(CLI);
    const modules = path.dirname(path.dirname(cliDirectory));
    const requireCLI = createRequire(path.join(cliDirectory, "package.json"));
    const provenance = await json(PROVENANCE);
    const installed = await scanPackages(modules);
    const sourceNames = new Set(provenance.packages?.map((p) => p.name));
    const sourceInstances = installed.filter((p) =>
        sourceNames.has(p.manifest.name)
    );
    const temporary = await mkdtemp(path.join(tmpdir(), "magda-image-test-"));
    try {
        await check(
            "pinned source provenance and artifact hashes",
            async () => {
                for (const [key, value] of Object.entries(EXPECTED))
                    assert.deepEqual(
                        provenance[key],
                        value,
                        `Provenance ${key}`
                    );
                const lock = await json(
                    "/usr/local/share/magda-agent/dsh-lock.json"
                );
                assert.equal(
                    lock.sourceLockSha256,
                    "2893d71a9ef07d2d72d47b2199e581b9e8d90638a15ee151908eebf69dfc637c"
                );
                assert.equal(lock.registryWorkspaceArtifacts, 0);
                assert(
                    lock.externalPackages > 0 &&
                        lock.localPackages > 0 &&
                        lock.reachableSnapshots > 0,
                    "Missing locked closure audit"
                );
                assert(
                    Array.isArray(provenance.packages) &&
                        provenance.packages.length > 0,
                    "No source packages recorded"
                );
                assert(
                    Array.isArray(provenance.dependencies) &&
                        provenance.dependencies.length > 0,
                    "No dependency inventory recorded"
                );
                for (const name of [
                    "@deepseek-ai/dsh",
                    CORDIS,
                    WORKSPACE,
                    "@deepseek-ai/dsh-web-app",
                    "@deepseek-ai/dsh-web-frontend",
                    "@deepseek-ai/node-addon-system"
                ]) {
                    assert(
                        sourceNames.has(name),
                        `Required source package absent from provenance: ${name}`
                    );
                }
                const observed = new Set();
                for (const { directory, manifest } of sourceInstances) {
                    const record = provenance.packages.find(
                        (p) =>
                            p.name === manifest.name &&
                            p.version === manifest.version
                    );
                    assert(
                        record,
                        `Unrecorded workspace package version: ${manifest.name}@${manifest.version}`
                    );
                    if (/^@deepseek-ai\/dsh(?:-|$)/.test(manifest.name))
                        assert.equal(
                            manifest.version,
                            EXPECTED.version,
                            `Pinned DSH workspace version: ${manifest.name}`
                        );
                    assert(
                        Number.isSafeInteger(record.files) && record.files > 0,
                        `Invalid artifact count: ${manifest.name}`
                    );
                    assert.match(
                        record.sha256,
                        /^[a-f0-9]{64}$/,
                        `Invalid artifact hash: ${manifest.name}`
                    );
                    const digest = await artifactDigest(
                        directory,
                        manifest.name
                    );
                    assert.equal(
                        digest.files,
                        record.files,
                        `Artifact count: ${manifest.name}`
                    );
                    assert.equal(
                        digest.sha256,
                        record.sha256,
                        `Source artifact drift: ${manifest.name}`
                    );
                    observed.add(JSON.stringify(record));
                }
                for (const record of provenance.packages)
                    assert(
                        observed.has(JSON.stringify(record)),
                        `Recorded source package missing: ${record.name}`
                    );
                for (const record of provenance.dependencies) {
                    assert.equal(typeof record.name, "string");
                    assert.equal(typeof record.version, "string");
                    assert(
                        Object.hasOwn(record, "license"),
                        `Dependency license metadata missing: ${record.name}`
                    );
                    const matching = installed.filter(
                        ({ manifest }) =>
                            manifest.name === record.name &&
                            manifest.version === record.version
                    );
                    assert(
                        matching.length > 0,
                        `Dependency missing or replaced: ${record.name}@${record.version}`
                    );
                    assert(
                        matching.some(
                            ({ manifest }) =>
                                JSON.stringify(manifest.license ?? null) ===
                                JSON.stringify(record.license)
                        ),
                        `Dependency license metadata changed: ${record.name}`
                    );
                }
                for (const { manifest } of installed) {
                    if (
                        /^@deepseek-ai\/(?:dsh(?:-|$)|cordis(?:-|$)|cosmokit$|schemastery$|node-addon-system(?:-|$))/.test(
                            manifest.name
                        )
                    ) {
                        assert(
                            sourceNames.has(manifest.name),
                            `Possible registry workspace substitution: ${manifest.name}`
                        );
                    }
                }
                console.log(
                    `# verified ${sourceInstances.length} source-built package instances; ${provenance.dependencies.length} dependencies`
                );
            }
        );

        await check("dsh --version through installed executable", async () => {
            const manifest = await json(
                path.join(cliDirectory, "package.json")
            );
            assert.equal(manifest.name, "@deepseek-ai/dsh");
            assert.equal(manifest.version, EXPECTED.version);
            const result = spawnSync("/usr/local/bin/dsh", ["--version"], {
                timeout: 20000,
                encoding: "utf8",
                cwd: temporary,
                env: {
                    PATH: "/usr/local/bin:/usr/bin:/bin",
                    HOME: temporary,
                    DSH_HOME: path.join(temporary, "dsh"),
                    XDG_CONFIG_HOME: path.join(temporary, "config"),
                    XDG_DATA_HOME: path.join(temporary, "data"),
                    LANG: "C.UTF-8",
                    DSH_TELEMETRY_DISABLED: "1",
                    DSH_TELEMETRY_MODE: "DISABLED"
                }
            });
            successful(result, "dsh --version");
            assert.equal(result.stdout.trim(), EXPECTED.version);
        });

        await check(
            "required dependency/peer closure and one Cordis instance",
            async () => {
                const cordisEntry = await realpath(requireCLI.resolve(CORDIS));
                const cordis = await load(requireCLI, CORDIS);
                assert.equal(typeof cordis.Context, "function");
                for (const { directory, manifest } of sourceInstances) {
                    const require = createRequire(
                        path.join(directory, "package.json")
                    );
                    const required = new Set([
                        ...Object.keys(manifest.dependencies ?? {}),
                        ...Object.keys(manifest.peerDependencies ?? {}).filter(
                            (name) =>
                                !manifest.peerDependenciesMeta?.[name]
                                    ?.optional &&
                                // Browser peers are injected from the compiled module
                                // table, not Node packages (some are private/build-only).
                                // The live Web test validates their served boot graph.
                                !(
                                    manifest.dsh?.client &&
                                    name.startsWith("@deepseek-ai/dsh-client-")
                                )
                        )
                    ]);
                    for (const name of required) {
                        const dependency = await json(
                            path.join(
                                packageDirectory(require, name),
                                "package.json"
                            )
                        );
                        assert.equal(
                            dependency.name,
                            name,
                            `${manifest.name} -> ${name}`
                        );
                        if (sourceNames.has(name))
                            assert(
                                provenance.packages.some(
                                    (p) =>
                                        p.name === name &&
                                        p.version === dependency.version
                                ),
                                `Wrong workspace peer: ${manifest.name} -> ${name}`
                            );
                    }
                    if (required.has(CORDIS)) {
                        assert.equal(
                            await realpath(require.resolve(CORDIS)),
                            cordisEntry,
                            `Duplicate Cordis: ${manifest.name}`
                        );
                        assert.equal(
                            (await load(require, CORDIS)).Context,
                            cordis.Context,
                            `Cordis identity: ${manifest.name}`
                        );
                    }
                }
            }
        );

        await check(
            "MAGDA managed plugins resolve/import with runtime peers",
            async () => {
                const cordis = await load(requireCLI, CORDIS);
                for (const name of MANAGED) {
                    const expected = await realpath(
                        path.join(
                            cliDirectory,
                            "node_modules",
                            name,
                            "lib/index.js"
                        )
                    );
                    assert.equal(
                        await realpath(requireCLI.resolve(name)),
                        expected,
                        `Managed plugin location: ${name}`
                    );
                    const plugin = await load(requireCLI, name);
                    assert.equal(
                        typeof plugin.apply,
                        "function",
                        `Managed plugin import: ${name}`
                    );
                    const require = createRequire(expected);
                    assert.equal(
                        (await load(require, CORDIS)).Context,
                        cordis.Context,
                        `Managed Cordis identity: ${name}`
                    );
                    for (const peer of [
                        "@deepseek-ai/dsh-tools",
                        "@deepseek-ai/dsh-system-prompt",
                        "@deepseek-ai/dsh-user-questions"
                    ]) {
                        assert.equal(
                            await realpath(require.resolve(peer)),
                            await realpath(requireCLI.resolve(peer)),
                            `Managed peer identity: ${name} -> ${peer}`
                        );
                        await load(require, peer);
                    }
                }
                // Browser-only client.js touches document and must not execute in Node.
                await access(
                    requireCLI.resolve(`${MANAGED[0]}/client`),
                    constants.R_OK
                );
                const tools = await load(requireCLI, "@deepseek-ai/dsh-tools");
                assert.equal(typeof tools.defineTool, "function");
            }
        );

        await check(
            "DSH Office skills over MAGDA's payload and installed LibreOffice Kit",
            async () => {
                const payload = "/usr/local/lib/magda-agent/primary-runtime";
                // The same code load_workspace_dependencies runs on its first call.
                const dependencies = await load(
                    requireCLI,
                    "@deepseek-ai/dsh-tool-workspace-dependencies"
                );
                const paths = await dependencies.resolvePrimaryRuntime(payload);
                assert.equal(
                    paths.python,
                    `${payload}/dependencies/python/bin/python3`
                );
                assert.equal(
                    await realpath(paths.python),
                    "/usr/bin/python3.11"
                );
                for (const name of ["python-docx", "python-pptx", "openpyxl"])
                    assert.ok(
                        Object.keys(paths.pythonDistributions).some(
                            (key) => key.toLowerCase() === name
                        ),
                        `payload manifest lacks ${name}`
                    );
                // skill-office with the managed profile's (default) config.
                const office = await load(
                    requireCLI,
                    "@deepseek-ai/dsh-skill-office"
                );
                let factory;
                office.apply(
                    {
                        skills: {
                            registerProvider: (value) => (factory = value)
                        }
                    },
                    { cli: WRAPPER }
                );
                const provider = factory();
                const candidates = await provider.list();
                assert.deepEqual(
                    candidates.map((candidate) => candidate.name),
                    ["office-docx", "office-pptx", "office-xlsx"]
                );
                const kit = await realpath(
                    path.join(
                        packageDirectory(
                            requireCLI,
                            "@deepseek-ai/libreoffice-kit"
                        ),
                        "lib/cli.js"
                    )
                );
                for (const candidate of candidates) {
                    const loaded = await provider.get(candidate, {
                        signal: new AbortController().signal
                    });
                    const runtime = JSON.parse(
                        loaded.content
                            .split("## Installed LibreOffice Kit")[1]
                            .match(/\{[\s\S]*\}/)[0]
                    ).libreofficeKit;
                    assert.equal(runtime.cli, WRAPPER);
                    assert.equal(runtime.node, process.execPath);
                    assert.match(loaded.content, /load_workspace_dependencies/);
                }
                // The wrapper delegates to the installed Kit CLI unchanged.
                const capabilities = JSON.parse(
                    spawnSync(
                        process.execPath,
                        [WRAPPER, "capabilities", "--json"],
                        { encoding: "utf8" }
                    ).stdout
                );
                assert.equal(capabilities.runtime.backend, "wasm");
                assert.equal(await realpath(capabilities.runtime.cliPath), kit);
            }
        );

        await check(
            "strict bundled and typed workspace-directory branding",
            async () => {
                const directory = packageDirectory(requireCLI, WORKSPACE);
                for (const relative of RENAMES.keys())
                    sourceBytes(
                        WORKSPACE,
                        relative,
                        await readFile(path.join(directory, relative))
                    );
                const typed = await import(
                    pathToFileURL(
                        path.join(directory, "lib/types/default-directory.js")
                    ).href
                );
                assert.equal(
                    await typed.defaultWorkspaceDirectory(
                        "/tmp/magda-documents",
                        new AbortController().signal
                    ),
                    "/tmp/magda-documents/agent-harness/default-workspace"
                );
            }
        );

        await check(
            "built web assets, bundle patches and all shipped presets",
            async () => {
                const frontend = packageDirectory(
                    requireCLI,
                    "@deepseek-ai/dsh-web-frontend"
                );
                const dist = path.join(frontend, "dist");
                const html = await readFile(
                    path.join(dist, "index.html"),
                    "utf8"
                );
                assert.match(html, /<script\b[^>]*type="module"/);
                const assets = [
                    ...html.matchAll(
                        /(?:src|href)=["'](?:\.\/|\/)?(assets\/[^"'?#]+)(?:[?#][^"']*)?["']/g
                    )
                ].map((m) => m[1]);
                assert(
                    assets.some((name) => name.endsWith(".js")),
                    "Web entry JavaScript missing"
                );
                assert(
                    assets.some((name) => name.endsWith(".css")),
                    "Web stylesheet missing"
                );
                for (const asset of assets)
                    assert(
                        (await readFile(path.join(dist, asset))).length > 0,
                        `Empty web asset: ${asset}`
                    );
                for (const name of [
                    "@deepseek-ai/dsh-base",
                    "@deepseek-ai/dsh-web-app"
                ]) {
                    const directory = packageDirectory(requireCLI, name);
                    const manifest = await json(
                        path.join(directory, "package.json")
                    );
                    const patches = [manifest.dsh.bundle.patch].flat();
                    for (const patch of patches)
                        assert(
                            (
                                await readFile(
                                    path.join(directory, patch),
                                    "utf8"
                                )
                            ).trim(),
                            `Empty bundle patch: ${name}/${patch}`
                        );
                }
                const web = packageDirectory(
                    requireCLI,
                    "@deepseek-ai/dsh-web-app"
                );
                const requireWeb = createRequire(
                    path.join(web, "package.json")
                );
                for (const preset of ["standard", "ptc", "minimal", "cordis"]) {
                    const text = await readFile(
                        path.join(web, "presets", `${preset}.patch.yml`),
                        "utf8"
                    );
                    assert.match(text, new RegExp(`^\\s+id: ${preset}$`, "m"));
                    const names = [
                        ...text.matchAll(
                            /^\s+name:\s*['"](@deepseek-ai\/[^'"\s]+)['"]\s*$/gm
                        )
                    ].map((m) => m[1]);
                    assert(
                        names.length > 1,
                        `Preset plugin declarations missing: ${preset}`
                    );
                    // Resolve subpath exports too; don't execute browser or Windows plugins.
                    for (const name of names)
                        await access(requireWeb.resolve(name), constants.R_OK);
                }
            }
        );

        const requireSubprocess = createRequire(
            path.join(
                packageDirectory(
                    requireCLI,
                    "@deepseek-ai/dsh-subprocess-local"
                ),
                "package.json"
            )
        );
        await check(
            "native node-pty spawns and reads a real PTY child",
            async () => {
                await ptySmoke(requireSubprocess("node-pty"), temporary);
            }
        );
        await check(
            "koffi native load, libc call and real flock contention",
            async () => {
                const requireFS = createRequire(
                    path.join(
                        packageDirectory(
                            requireCLI,
                            "@deepseek-ai/dsh-fs-local"
                        ),
                        "package.json"
                    )
                );
                const koffi = requireFS("koffi");
                const libc = koffi.load("libc.so.6");
                try {
                    assert.equal(libc.func("int getpid(void)")(), process.pid);
                    const flock = libc.func("int flock(int fd, int operation)");
                    await withLockFiles(temporary, async (first, second) => {
                        assert.equal(
                            flock(first.fd, 2 | 4),
                            0,
                            "koffi flock acquisition"
                        );
                        assert.equal(
                            flock(second.fd, 2 | 4),
                            -1,
                            "koffi flock contention must fail"
                        );
                        assert.equal(
                            flock(first.fd, 8),
                            0,
                            "koffi flock unlock"
                        );
                        assert.equal(
                            flock(second.fd, 2 | 4),
                            0,
                            "koffi flock after release"
                        );
                    });
                } finally {
                    libc.unload();
                }
            }
        );
        await check(
            "system native addon performs asynchronous flock",
            async () => {
                const { tryLockExclusive } = await load(
                    requireCLI,
                    "@deepseek-ai/node-addon-system/flock"
                );
                await withLockFiles(temporary, async (first, second) => {
                    await tryLockExclusive(first.fd);
                    await assert.rejects(
                        tryLockExclusive(second.fd),
                        (error) =>
                            error.syscall === "flock" &&
                            ["EAGAIN", "EWOULDBLOCK"].includes(error.code)
                    );
                });
                await withLockFiles(temporary, async (first) => {
                    await tryLockExclusive(first.fd);
                });
            }
        );
        await check(
            "Linux landlock-run binary and kernel enforcement probe",
            async () => {
                const native = await load(
                    requireCLI,
                    "@deepseek-ai/node-addon-system/landlock-run"
                );
                const launcher = native.launcherPath();
                await access(launcher, constants.R_OK | constants.X_OK);
                assert(
                    (await lstat(launcher)).isFile(),
                    "landlock-run must be a materialized binary"
                );
                assert.equal(
                    (await readFile(launcher)).subarray(0, 4).toString("hex"),
                    "7f454c46",
                    "landlock-run must be a Linux ELF binary"
                );
                const result = spawnSync(launcher, ["--probe"], {
                    timeout: 5000,
                    encoding: "utf8",
                    env: { LANG: "C", LC_ALL: "C" }
                });
                const verdict = landlockVerdict(result);
                console.log(
                    `# landlock enforcement: ${verdict}${
                        result.stderr.trim() ? ` (${result.stderr.trim()})` : ""
                    }`
                );
                assert.equal(
                    native.probe(launcher),
                    verdict === "kernel-or-container-policy-unavailable"
                        ? "unusable"
                        : verdict
                );
                if (verdict !== "kernel-or-container-policy-unavailable") {
                    const child = spawnSync(
                        launcher,
                        [
                            ...native.grantArgs({ readOnly: ["/"] }),
                            "--",
                            "/bin/echo",
                            "MAGDA_LANDLOCK_OK"
                        ],
                        { timeout: 5000, encoding: "utf8" }
                    );
                    successful(child, "landlock-run confined child");
                    assert.equal(child.stdout.trim(), "MAGDA_LANDLOCK_OK");
                }
            }
        );
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

async function selfTest() {
    await check(
        "branding normalization rejects missing, old and repeated replacements",
        () => {
            for (const [relative, branded] of RENAMES) {
                const upstream = branded.replace(
                    "agent-harness",
                    "deepseek-harness"
                );
                assert.equal(
                    sourceBytes(
                        WORKSPACE,
                        relative,
                        Buffer.from(branded)
                    ).toString(),
                    upstream
                );
                for (const invalid of [
                    "",
                    upstream,
                    branded + branded,
                    branded + upstream
                ])
                    assert.throws(() =>
                        sourceBytes(WORKSPACE, relative, Buffer.from(invalid))
                    );
            }
        }
    );
    await check(
        "landlock classifications reject missing/corrupt binaries and unknown failures",
        () => {
            const result = {
                status: 0,
                signal: null,
                stdout: "landlock: fully enforced\n",
                stderr: ""
            };
            assert.equal(landlockVerdict(result), "full");
            assert.equal(
                landlockVerdict({
                    ...result,
                    stdout: "landlock: partially enforced (older ABI)\n"
                }),
                "partial"
            );
            assert.equal(
                landlockVerdict({
                    ...result,
                    status: 125,
                    stdout: "",
                    stderr:
                        "landlock-run: landlock is not enforced by this kernel (ABI unsupported or disabled)\n"
                }),
                "kernel-or-container-policy-unavailable"
            );
            assert.equal(
                landlockVerdict({
                    ...result,
                    status: 125,
                    stdout: "",
                    stderr:
                        "landlock-run: landlock ruleset error: Operation not permitted\n"
                }),
                "kernel-or-container-policy-unavailable"
            );
            for (const invalid of [
                {
                    error: Object.assign(new Error("missing binary"), {
                        code: "ENOENT"
                    }),
                    status: null
                },
                { status: 126, stdout: "", stderr: "Exec format error" },
                { status: null, signal: "SIGSEGV" },
                {
                    status: 125,
                    stdout: "",
                    stderr:
                        "landlock-run: landlock ruleset error: Invalid argument"
                },
                { stdout: "", stderr: "" }
            ])
                assert.throws(() => landlockVerdict({ ...result, ...invalid }));
        }
    );
    await check(
        "artifact digest detects content/count drift, excluding deployment metadata",
        async () => {
            const directory = await mkdtemp(
                path.join(tmpdir(), "magda-image-fixture-")
            );
            try {
                await writeFile(path.join(directory, "package.json"), "{}");
                await writeFile(
                    path.join(directory, "index.js"),
                    "export const value = 1;\n"
                );
                const expected = createHash("sha256")
                    .update("index.js\0")
                    .update("export const value = 1;\n")
                    .digest("hex");
                assert.deepEqual(await artifactDigest(directory, "fixture"), {
                    files: 1,
                    sha256: expected
                });
                await writeFile(
                    path.join(directory, "package.json"),
                    '{"rewritten":true}'
                );
                assert.equal(
                    (await artifactDigest(directory, "fixture")).sha256,
                    expected
                );
                await writeFile(path.join(directory, "index.js"), "tampered");
                assert.notEqual(
                    (await artifactDigest(directory, "fixture")).sha256,
                    expected
                );
                await writeFile(path.join(directory, "extra.js"), "extra");
                assert.equal(
                    (await artifactDigest(directory, "fixture")).files,
                    2
                );
            } finally {
                await rm(directory, { recursive: true, force: true });
            }
        }
    );
}

const watchdog = setTimeout(() => {
    console.error("Image test exceeded 120 seconds");
    process.exit(1);
}, 120000);
try {
    assert(
        process.argv.length === 2 ||
            (process.argv.length === 3 && process.argv[2] === "--self-test"),
        "Usage: node test-image.mjs [--self-test]"
    );
    if (process.argv[2] === "--self-test") await selfTest();
    else await runImageChecks();
    console.log(
        `Passed ${checks} ${
            process.argv[2] === "--self-test" ? "self-tests" : "image checks"
        }.`
    );
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    clearTimeout(watchdog);
}
