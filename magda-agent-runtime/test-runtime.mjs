import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
    "../magda-agent-runtime/dsh-launch.mjs"
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
