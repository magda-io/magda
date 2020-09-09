#!/usr/bin/env node
const path = require("path");
const fse = require("fs-extra");
const chalk = require("chalk");

const cwdPath = process.cwd();
const pkg = fse.readJsonSync(path.join(cwdPath, "scripts", "package.json"));
if (!pkg || !pkg["version"]) {
    console.error(chalk.red("Cannot find package.json at: " + cwdPath));
    process.exit(-1);
}

const ciAttemptReleaseVersion = process.env["CI_COMMIT_TAG"]
    ? process.env["CI_COMMIT_TAG"].trim()
    : "";

if (!ciAttemptReleaseVersion) {
    console.error(
        chalk.red(
            "Failed to check CI release version: `CI_COMMIT_TAG` version doesn't exist or empty!"
        )
    );
    process.exit(-1);
}

if (
    ciAttemptReleaseVersion.toLowerCase() !==
    ("v" + pkg["version"]).toLowerCase()
) {
    console.error(
        chalk.red(
            `Failed to check CI release version: \n CI tagging version \`${ciAttemptReleaseVersion}\` \npackage version: ${
                "v" + pkg["version"]
            }\n `
        )
    );
    process.exit(-1);
}

console.log(
    chalk.green(
        `Successfully verified CI release version: ${ciAttemptReleaseVersion}`
    )
);
