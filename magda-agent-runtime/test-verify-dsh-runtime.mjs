// Run with Node 22+: node --test magda-agent-runtime/test-verify-dsh-runtime.mjs
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyRuntime } from "./verify-dsh-runtime.mjs";

const expected = Object.freeze({
    repository: "https://github.com/magda-io/dsh-fork.git",
    tag: "magda/0.2.1-alpha.1/1.0.3",
    sha: "a".repeat(40),
    upstreamRef: "upstream/0.2.1-alpha.1",
    upstreamSha: "b".repeat(40)
});

async function archive(t, change = {}) {
    const dir = await mkdtemp(path.join(tmpdir(), "magda-dsh-runtime-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const source = {
        repository: expected.repository,
        ref: expected.tag,
        sha: expected.sha,
        upstream: { ref: expected.upstreamRef, sha: expected.upstreamSha },
        ...change.source
    };
    const build = {
        tag: expected.tag,
        sha: expected.sha,
        arch: "arm64",
        node: "v22.22.0",
        ...change.build
    };
    await mkdir(path.join(dir, "build-info"));
    await writeFile(
        path.join(dir, "build-info/dsh-source.json"),
        JSON.stringify(source)
    );
    await writeFile(
        path.join(dir, "build-info/build.json"),
        JSON.stringify(build)
    );
    if (!change.noCli) {
        const cli = path.join(dir, "node_modules/@deepseek-ai/dsh/lib");
        await mkdir(cli, { recursive: true });
        await writeFile(path.join(cli, "bin.js"), "");
    }
    return dir;
}

const run = (dir) =>
    verifyRuntime({ dir, expected, arch: "arm64", node: "v22.22.0" });

test("accepts an archive built from the pinned release for this Node and architecture", async (t) => {
    await run(await archive(t));
});

for (const [name, change, message] of [
    ["another tag", { source: { ref: "magda/0.2.1-alpha.1/1.0.2" } }, /ref/],
    ["another commit", { source: { sha: "c".repeat(40) } }, /sha/],
    [
        "another repository",
        { source: { repository: "https://example.invalid/dsh.git" } },
        /repository/
    ],
    [
        "another upstream baseline",
        {
            source: {
                upstream: { ref: expected.upstreamRef, sha: "d".repeat(40) }
            }
        },
        /upstream/
    ],
    ["another architecture", { build: { arch: "amd64" } }, /arch/],
    ["another Node version", { build: { node: "v24.0.0" } }, /Node/],
    [
        "a build record for another tag",
        { build: { tag: "magda/0.2.1-alpha.1/1.0.2" } },
        /tag/
    ],
    ["no DSH CLI", { noCli: true }, /CLI/]
]) {
    test(`rejects an archive with ${name}`, async (t) => {
        await assert.rejects(run(await archive(t, change)), message);
    });
}

test("rejects an archive without its build records", async (t) => {
    const dir = await archive(t);
    await rm(path.join(dir, "build-info/build.json"));
    await assert.rejects(run(dir), /build\.json/);
});
