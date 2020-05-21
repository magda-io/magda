#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const bcrypt = require("bcrypt");
const pwgen = require("pwgen/lib/pwgen_module");
const getDBPool = require("./db/getDBPool");

program
    .version(pkg.version)
    .usage("[options]")
    .description(
        `A tool for setting magda users' password. Version: ${pkg.version}\n\n` +
            "By Default, a random password will be auto generate if -p or --password option does not present.\n" +
            `The database connection to auth DB is required, the following environment variables will be used to create a connection:\n` +
            `  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.\n` +
            `  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.\n` +
            `  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.\n` +
            `  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.`
    )
    .option(
        "-u, --uid [User ID]",
        "Specify the user id of the user whose password will be reset."
    )
    .option(
        "-p, --password [password string]",
        "Optional. Specify the password that reset the user account to."
    )
    .parse(process.argv);

const MIN_PASSWORD_LENGTH = 6;
const AUTO_PASSWORD_LENGTH = 8;

(async () => {
    const options = program.opts();
    if (!options || !options.uid) {
        program.help();
        return;
    }

    if (
        typeof options.password === "string" &&
        options.password.length < MIN_PASSWORD_LENGTH
    ) {
        throw new Error(
            `Password length cannot be smaller than ${MIN_PASSWORD_LENGTH}.`
        );
    }

    let password = options.password;

    if (!options.password) {
        const pwgenGenerator = new pwgen();
        pwgenGenerator.includeCapitalLetter = true;
        pwgenGenerator.includeNumber = true;
        pwgenGenerator.maxLength = AUTO_PASSWORD_LENGTH;
        password = pwgenGenerator.generate();
    }

    const hash = await bcrypt.hash(password, await bcrypt.genSalt());

    const pool = getDBPool();
    const users = await pool.query(
        `SELECT * FROM "users" WHERE "id"=$1 LIMIT 1`,
        [options.uid]
    );
    if (!users || !users.rows || !users.rows.length) {
        throw new Error(`Cannot locate user record by id: ${options.uid}`);
    }
    const uid = users.rows[0].id;

    const credentials = await pool.query(
        `SELECT * FROM "credentials" WHERE "user_id"=$1 LIMIT 1`,
        [uid]
    );
    if (!credentials || !credentials.rows || !credentials.rows.length) {
        await pool.query(
            `INSERT INTO "credentials" ("id", "user_id", "timestamp", "hash") VALUES(uuid_generate_v4(), $1, CURRENT_TIMESTAMP, $2)`,
            [uid, hash]
        );
    } else {
        const cid = credentials.rows[0].id;
        await pool.query(
            `UPDATE "credentials" SET "hash"=$1, "timestamp"=CURRENT_TIMESTAMP WHERE "id"=$2`,
            [hash, cid]
        );
    }

    console.log(
        chalk.green(
            `Password for user (id: ${uid}) has been set to: ${password}`
        )
    );
    process.exit();
})().catch(e => {
    console.error(chalk.red(`Failed to reset user password: ${e}`));
    process.exit(1);
});
