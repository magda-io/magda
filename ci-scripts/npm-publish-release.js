#!/usr/bin/env node
// Publishes the npm package in the current working directory, deriving the
// npm dist-tag from the version's prerelease identifier (e.g. "pr", "alpha",
// "beta", "rc"), or "latest" for stable versions. npm refuses to publish a
// prerelease version without an explicit --tag.
//
// Treats "version already published" as a non-fatal outcome, since release
// pipelines may be re-run against a version that was already published.
const { execSync } = require("child_process");
const path = require("path");

const pkg = require(path.join(process.cwd(), "package.json"));
const match = pkg.version.match(/-([a-zA-Z]+)/);
const tag = match ? match[1] : "latest";

try {
    execSync(`npm publish --tag ${tag}`, {
        stdio: ["ignore", "inherit", "pipe"]
    });
} catch (e) {
    const output = e.stderr ? e.stderr.toString() : "";
    if (
        /EPUBLISHCONFLICT|previously published|cannot publish over/.test(output)
    ) {
        process.exit(0);
    }
    process.stderr.write(output);
    process.exit(1);
}
