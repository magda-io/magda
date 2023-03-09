#!/usr/bin/env node
const pkg = require("./package.json");
const program = require("commander");
const chalk = require("chalk");
const isUuid = require("isuuid");
const buildJwt = require("@magda/typescript-common/dist/session/buildJwt")
    .default;

program
    .version(pkg.version)
    .usage("[options]")
    .description(
        `A tool for creating Magda internal JWT token. Version: ${pkg.version}\n` +
            `Please note: this tool is for debug & testing purpose only.`
    )
    .option(
        "-s, --secret [JWT Token Secret]",
        "Specify JWT token secret that used to create the JWT token"
    )
    .option(
        "-u, --userId [User ID]",
        "set the user id that the JWT token carries"
    )
    .parse(process.argv);

(async () => {
    const options = program.opts();

    if (!options || (!options.userId && !options.secret)) {
        program.help();
        return;
    }

    if (options.userId) {
        if (!isUuid(options.userId)) {
            throw new Error("Invalid user id: should be in UUID format.");
        }
    }
    const jwt = buildJwt(options.secret, options.userId);
    console.log(chalk.green(`JWT Token: `));
    console.log(jwt);
    process.exit();
})().catch((e) => {
    console.error(chalk.red(`${e}`));
    process.exit(1);
});
