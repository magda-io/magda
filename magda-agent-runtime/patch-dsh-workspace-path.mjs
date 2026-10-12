#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const packageRoot =
    process.argv[2] ||
    "/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-api-workspace-controller";
const replacements = [
    {
        file: "lib/index.js",
        from:
            'paths.join(directory, "deepseek-harness", DEFAULT_WORKSPACE_DIRECTORY)',
        to:
            'paths.join(directory, "agent-harness", DEFAULT_WORKSPACE_DIRECTORY)'
    },
    {
        file: "lib/types/default-directory.js",
        from:
            "paths.join(directory, 'deepseek-harness', DEFAULT_WORKSPACE_DIRECTORY)",
        to:
            "paths.join(directory, 'agent-harness', DEFAULT_WORKSPACE_DIRECTORY)"
    }
];

for (const replacement of replacements) {
    const file = path.join(packageRoot, replacement.file);
    const source = fs.readFileSync(file, "utf8");
    const matches = source.split(replacement.from).length - 1;
    if (matches !== 1) {
        throw new Error(
            `Expected one pinned DSH workspace path in ${file}, found ${matches}`
        );
    }
    fs.writeFileSync(file, source.replace(replacement.from, replacement.to));
}

console.log("magda-agent: patched DSH default workspace to agent-harness");
