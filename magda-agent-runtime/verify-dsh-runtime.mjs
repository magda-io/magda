// Check an unpacked DSH runtime archive from magda-io/dsh-fork's release before
// it enters the image: it must record exactly the release this Dockerfile pins,
// and have been built for this image's Node version and architecture (its
// native addons are compiled for both). The archive's checksum is already
// verified by the Dockerfile's ADD --checksum.
//
//   node verify-dsh-runtime.mjs /opt/dsh-release
//
// Reads DSH_SOURCE_REPO, DSH_RELEASE_TAG, DSH_RELEASE_SHA, DSH_UPSTREAM_REF,
// DSH_UPSTREAM_SHA and TARGETARCH. Node 22+, no third-party dependencies.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function record(dir, name) {
    const file = path.join(dir, "build-info", name);
    try {
        return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
        throw new Error(`Unreadable build record ${file}: ${error.message}`);
    }
}

/**
 * @param {{ dir: string, expected: { repository: string, tag: string, sha: string,
 *   upstreamRef: string, upstreamSha: string }, arch: string, node: string }} options
 */
export async function verifyRuntime({ dir, expected, arch, node }) {
    const source = await record(dir, "dsh-source.json");
    const build = await record(dir, "build.json");
    assert.equal(
        source.repository,
        expected.repository,
        "Archive records another repository"
    );
    assert.equal(
        source.ref,
        expected.tag,
        "Archive records another release ref"
    );
    assert.equal(
        source.sha,
        expected.sha,
        "Archive records another release sha"
    );
    assert.deepEqual(
        source.upstream,
        { ref: expected.upstreamRef, sha: expected.upstreamSha },
        "Archive records another upstream baseline"
    );
    assert.equal(build.tag, expected.tag, "Build record names another tag");
    assert.equal(build.sha, expected.sha, "Build record names another sha");
    assert.equal(
        build.arch,
        arch,
        `Archive was built for arch ${build.arch}, not ${arch}`
    );
    assert.equal(
        build.node,
        node,
        `Archive was built with Node ${build.node}, not this image's ${node}`
    );
    await access(
        path.join(dir, "node_modules/@deepseek-ai/dsh/lib/bin.js")
    ).catch(() => {
        throw new Error("Archive has no DSH CLI");
    });
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const env = (name) => {
        assert(process.env[name], `${name} must be set`);
        return process.env[name];
    };
    assert.equal(
        process.argv.length,
        3,
        "Usage: node verify-dsh-runtime.mjs /opt/dsh-release"
    );
    await verifyRuntime({
        dir: process.argv[2],
        expected: {
            repository: env("DSH_SOURCE_REPO"),
            tag: env("DSH_RELEASE_TAG"),
            sha: env("DSH_RELEASE_SHA"),
            upstreamRef: env("DSH_UPSTREAM_REF"),
            upstreamSha: env("DSH_UPSTREAM_SHA")
        },
        arch: env("TARGETARCH"),
        node: process.version
    });
    console.log(
        `DSH runtime archive matches ${process.env.DSH_RELEASE_TAG} for ${process.env.TARGETARCH}, Node ${process.version}`
    );
}
