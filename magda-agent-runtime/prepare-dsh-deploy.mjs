// pnpm's modern deploy converts workspace links to absolute file: references.
// Preserve upstream's reviewed script policy, approving only the same workspace
// postinstall under its converted identity (the script repairs node-pty modes).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const get = ["config", "get", "allowBuilds", "--json", "--location=project"];
const builds = JSON.parse(execFileSync("pnpm", get, { encoding: "utf8" }));
const relative = "packages/subprocess/subprocess-local";
const original = `@deepseek-ai/dsh-subprocess-local@file:${relative}`;
assert.equal(
    builds[original],
    true,
    "Upstream must explicitly approve this lifecycle script"
);
const absolute = `@deepseek-ai/dsh-subprocess-local@${
    pathToFileURL(realpathSync(relative)).href
}`;
execFileSync(
    "pnpm",
    [
        "config",
        "set",
        "allowBuilds",
        JSON.stringify({ ...builds, [absolute]: true }),
        "--json",
        "--location=project"
    ],
    { stdio: "inherit" }
);
