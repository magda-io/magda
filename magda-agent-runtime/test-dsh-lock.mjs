// Run with Node 22+: node --test magda-agent-runtime/test-dsh-lock.mjs
// Synthetic lockfiles are JSON (valid YAML). Only the verifier loads js-yaml,
// via a fixture-local link to the already-installed root dependency. No network,
// Docker, upstream checkout, real pnpm, or caller credentials are needed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmod,
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
import { fileURLToPath, pathToFileURL } from "node:url";

const verifier = fileURLToPath(new URL("verify-dsh-lock.mjs", import.meta.url));
const preparer = fileURLToPath(
    new URL("prepare-dsh-deploy.mjs", import.meta.url)
);
const installedYaml = fileURLToPath(
    new URL("../node_modules/js-yaml", import.meta.url)
);
const originalApproval =
    "@deepseek-ai/dsh-subprocess-local@file:packages/subprocess/subprocess-local";

async function json(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

async function temporaryHome(t) {
    // process.cwd() resolves macOS /var -> /private/var; use the same canonical
    // prefix when constructing the deployment's absolute file references.
    const home = await realpath(
        await mkdtemp(path.join(tmpdir(), "magda-dsh-lock-"))
    );
    t.after(() => rm(home, { recursive: true, force: true }));
    return home;
}

async function fixture(t) {
    const home = await temporaryHome(t);
    const source = path.join(home, "source");
    const target = path.join(home, "deployment");
    const local = path.join(source, "apps/cli");
    const localKey = `local@file:${local}`;
    await json(path.join(source, "package.json"), {
        name: "fixture-checkout",
        private: true
    });
    await json(path.join(local, "package.json"), {
        name: "local",
        version: "1.0.0"
    });
    await mkdir(path.join(source, "node_modules"), { recursive: true });
    await symlink(
        installedYaml,
        path.join(source, "node_modules/js-yaml"),
        "dir"
    );
    const locked = {
        lockfileVersion: "9.0",
        importers: {
            ".": {
                dependencies: {
                    local: {
                        specifier: "workspace:*",
                        version: "link:apps/cli"
                    },
                    ext: { specifier: "1.0.0", version: "1.0.0" }
                }
            },
            "apps/cli": {
                dependencies: { ext: { specifier: "1.0.0", version: "1.0.0" } }
            }
        },
        packages: {
            "ext@1.0.0": {
                resolution: { integrity: "sha512-fixture-ext" },
                engines: { node: ">=22" }
            },
            "transitive@2.0.0": {
                resolution: { integrity: "sha512-fixture-transitive" }
            },
            "@fixture/optional@3.0.0": {
                resolution: { integrity: "sha512-fixture-optional" }
            }
        },
        snapshots: {
            "ext@1.0.0": {
                dependencies: { transitive: "2.0.0" },
                optionalDependencies: { "@fixture/optional": "3.0.0" }
            },
            // A cycle and duplicate root references must count each snapshot once.
            "transitive@2.0.0": { dependencies: { ext: "1.0.0" } },
            "@fixture/optional@3.0.0": {}
        }
    };
    const deployed = {
        lockfileVersion: "9.0",
        importers: {
            ".": {
                dependencies: {
                    local: { specifier: `file:${local}`, version: localKey },
                    ext: { specifier: "1.0.0", version: "1.0.0" }
                },
                optionalDependencies: {
                    "@fixture/optional": {
                        specifier: "3.0.0",
                        version: "3.0.0"
                    }
                }
            }
        },
        packages: {
            [localKey]: {
                resolution: {
                    type: "directory",
                    directory: path.relative(target, local)
                }
            },
            ...structuredClone(locked.packages)
        },
        snapshots: {
            [localKey]: { dependencies: { ext: "1.0.0" } },
            ...structuredClone(locked.snapshots)
        }
    };
    const f = { source, target, local, localKey, locked, deployed };
    await saveLocks(f);
    return f;
}

async function saveLocks(f) {
    await json(path.join(f.source, "pnpm-lock.yaml"), f.locked);
    await json(path.join(f.target, "pnpm-lock.yaml"), f.deployed);
}

function run(helper, cwd, args = [], env = {}) {
    return spawnSync(process.execPath, [helper, ...args], {
        cwd,
        encoding: "utf8",
        // Do not inherit HOME, tokens, DSH settings, NODE_OPTIONS, or real pnpm.
        env,
        timeout: 30_000,
        maxBuffer: 1024 * 1024
    });
}

function assertProcess(result, status) {
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    if (status === 0) assert.equal(result.status, 0, result.stderr);
    else
        assert.notEqual(
            result.status,
            0,
            "invalid fixture unexpectedly succeeded"
        );
}

async function rejectsLock(f, expected) {
    await saveLocks(f);
    const result = run(verifier, f.source, [f.target]);
    assertProcess(result, 1);
    assert.match(result.stderr, expected);
    await assert.rejects(
        readFile(path.join(f.target, "provenance/dsh-lock.json")),
        { code: "ENOENT" }
    );
}

test("verifies retained resolutions and records the exact source lock hash and graph counters", async (t) => {
    const f = await fixture(t);
    const sourceBytes = await readFile(path.join(f.source, "pnpm-lock.yaml"));
    const result = run(verifier, f.source, [f.target]);
    assertProcess(result, 0);
    const report = {
        sourceLockSha256: createHash("sha256")
            .update(sourceBytes)
            .digest("hex"),
        externalPackages: 3,
        localPackages: 1,
        reachableSnapshots: 4,
        registryWorkspaceArtifacts: 0
    };
    assert.equal(
        await readFile(path.join(f.target, "provenance/dsh-lock.json"), "utf8"),
        JSON.stringify(report, null, 2) + "\n"
    );
    assert.equal(
        result.stdout,
        `Locked deployment verified: ${JSON.stringify(report)}\n`
    );
    assert.deepEqual(
        await readFile(path.join(f.source, "pnpm-lock.yaml")),
        sourceBytes
    );
});

const invalidLocks = [
    [
        "external integrity drift",
        (f) => {
            f.deployed.packages["ext@1.0.0"].resolution.integrity =
                "sha512-tampered";
        },
        /External package drift: ext@1\.0\.0/
    ],
    [
        "external version entry drift",
        (f) => {
            f.deployed.packages["ext@9.0.0"] = f.deployed.packages["ext@1.0.0"];
            delete f.deployed.packages["ext@1.0.0"];
            f.deployed.importers["."].dependencies.ext.version = "9.0.0";
        },
        /External package drift: ext@9\.0\.0/
    ],
    [
        "external snapshot graph drift",
        (f) => {
            f.deployed.snapshots["ext@1.0.0"].dependencies.transitive = "9.0.0";
        },
        /External dependency graph drift: ext@1\.0\.0/
    ],
    [
        "a registry artifact using a workspace name",
        (f) => {
            f.deployed.packages["local@1.0.0"] = {
                resolution: { integrity: "sha512-registry-workspace" }
            };
        },
        /Registry workspace artifact: local@1\.0\.0/
    ],
    [
        "a local resolution pointing to the wrong source directory",
        (f) => {
            f.deployed.packages[
                f.localKey
            ].resolution.directory = path.relative(f.target, f.source);
        },
        /Workspace source resolution changed: local@file:/
    ],
    [
        "a missing reachable transitive snapshot",
        (f) => {
            delete f.deployed.snapshots["transitive@2.0.0"];
        },
        /Missing deployed dependency snapshot: transitive@2\.0\.0/
    ],
    [
        "a missing reachable optional snapshot",
        (f) => {
            delete f.deployed.snapshots["@fixture/optional@3.0.0"];
        },
        /Missing deployed dependency snapshot: @fixture\/optional@3\.0\.0/
    ],
    [
        "a missing deployment root importer",
        (f) => {
            delete f.deployed.importers["."];
        },
        /Deployment lockfile lacks root importer/
    ],
    [
        "an empty deployed graph",
        (f) => {
            f.deployed.packages = {};
            f.deployed.snapshots = {};
            f.deployed.importers["."] = {};
        },
        /Empty deployed dependency graph/
    ],
    [
        "an empty reachable graph despite retained package entries",
        (f) => {
            f.deployed.importers["."] = {};
        },
        /Empty deployed dependency graph/
    ],
    [
        "a graph without local packages",
        (f) => {
            delete f.deployed.packages[f.localKey];
            delete f.deployed.snapshots[f.localKey];
            delete f.deployed.importers["."].dependencies.local;
        },
        /Empty deployed dependency graph/
    ],
    [
        "a graph without external packages",
        (f) => {
            f.deployed.packages = {
                [f.localKey]: f.deployed.packages[f.localKey]
            };
            f.deployed.snapshots = { [f.localKey]: {} };
            f.deployed.importers["."] = {
                dependencies: {
                    local: f.deployed.importers["."].dependencies.local
                }
            };
        },
        /Empty deployed dependency graph/
    ]
];

for (const [name, mutate, expected] of invalidLocks) {
    test(`rejects ${name} without writing provenance`, async (t) => {
        const f = await fixture(t);
        mutate(f);
        await rejectsLock(f, expected);
    });
}

async function policyFixture(t, builds) {
    const home = await temporaryHome(t);
    const source = path.join(home, "source");
    const bin = path.join(home, "bin");
    const local = path.join(source, "packages/subprocess/subprocess-local");
    const config = path.join(home, "config.json");
    const log = path.join(home, "calls.jsonl");
    await mkdir(local, { recursive: true });
    await mkdir(bin, { recursive: true });
    await json(config, builds);
    // An absolute Node shebang keeps PATH limited to this fake pnpm directory.
    const pnpm = path.join(bin, "pnpm");
    await writeFile(
        pnpm,
        `#!${process.execPath}
const assert = require("node:assert/strict");
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(args) + "\\n");
if (args[1] === "get") {
    assert.deepEqual(args, ["config", "get", "allowBuilds", "--json", "--location=project"]);
    process.stdout.write(fs.readFileSync(process.env.FIXTURE_CONFIG));
} else {
    assert.deepEqual(args.slice(0, 3), ["config", "set", "allowBuilds"]);
    assert.deepEqual(args.slice(4), ["--json", "--location=project"]);
    fs.writeFileSync(process.env.FIXTURE_CONFIG, JSON.stringify(JSON.parse(args[3])));
}
`
    );
    await chmod(pnpm, 0o755);
    return {
        source,
        local,
        config,
        log,
        env: { PATH: bin, FIXTURE_CONFIG: config, FIXTURE_LOG: log }
    };
}

async function calls(f) {
    return (await readFile(f.log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
}

test("prepare preserves all allow/deny entries and adds only the approved absolute file identity", async (t) => {
    const builds = {
        [originalApproval]: true,
        "approved-native@1.0.0": true,
        "denied-native@2.0.0": false,
        "other-local@file:packages/other": false
    };
    const f = await policyFixture(t, builds);
    const result = run(preparer, f.source, [], f.env);
    assertProcess(result, 0);
    const absolute = `@deepseek-ai/dsh-subprocess-local@${
        pathToFileURL(await realpath(f.local)).href
    }`;
    const expected = { ...builds, [absolute]: true };
    assert.deepEqual(JSON.parse(await readFile(f.config, "utf8")), expected);
    assert.deepEqual(await calls(f), [
        ["config", "get", "allowBuilds", "--json", "--location=project"],
        [
            "config",
            "set",
            "allowBuilds",
            JSON.stringify(expected),
            "--json",
            "--location=project"
        ]
    ]);
});

for (const approval of [false, undefined]) {
    test(`prepare rejects an original approval that is ${String(
        approval
    )}`, async (t) => {
        const builds = { "denied-native@2.0.0": false };
        if (approval !== undefined) builds[originalApproval] = approval;
        const f = await policyFixture(t, builds);
        const before = await readFile(f.config, "utf8");
        const result = run(preparer, f.source, [], f.env);
        assertProcess(result, 1);
        assert.match(
            result.stderr,
            /Upstream must explicitly approve this lifecycle script/
        );
        assert.equal(await readFile(f.config, "utf8"), before);
        assert.deepEqual(await calls(f), [
            ["config", "get", "allowBuilds", "--json", "--location=project"]
        ]);
    });
}
