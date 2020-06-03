#!/usr/bin/env node
const pkg = require("./package.json");
const program = require("commander");
const chalk = require("chalk");
const bcrypt = require("bcrypt");
const pwgen = require("pwgen/lib/pwgen_module");
const getDBPool = require("./db/getDBPool");
const isUuid = require("isuuid");
const isEmail = require("isemail").validate;

program
    .version(pkg.version)
    .usage("[options]")
    .description(
        `A tool for setting magda users' password. Version: ${pkg.version}\n` +
            "By Default, a random password will be auto generate if -p or --password option does not present.\n" +
            `The database connection to auth DB is required, the following environment variables will be used to create a connection:\n` +
            `  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.\n` +
            `  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.\n` +
            `  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.\n` +
            `  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.`
    )
    .option(
        "-u, --user [User ID or email]",
        "Specify the user id or email of the user whose password will be reset. If -c switch not present, this switch must be used."
    )
    .option(
        "-c, --create [user email]",
        "Create the user record before set the password rather than set password for an existing user. If -u switch not present, this switch must be used."
    )
    .option(
        "-p, --password [password string]",
        "Optional. Specify the password that reset the user account to."
    )
    .option(
        "-n, --displayName [user display name]",
        "Optional, valid when -c is specified. If not present, default display will be same as the email address. Use double quote if the name contains space."
    )
    .option(
        "-a, --isAdmin",
        "Optional, valid when -c is specified. If present, the user will be created as admin user."
    )
    .parse(process.argv);

/**
 * Salting round. Default is 10. means 2^10 rounds
 * When 10, approx. ~10 hashes can be generated per sec (on a 2GHz core) roughly
 * We set to 12 here (based on OWASP). Roughly 2-3 hashes/sec
 */
const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 6;
const AUTO_PASSWORD_LENGTH = 8;

async function createUser(dbClient, options) {
    const email = options.create;
    if (!isEmail(email)) {
        throw new Error(
            "Failed to create user: supplied email address is invalid."
        );
    }
    const displayName = options.displayName ? options.displayName : email;
    const isAdmin = options.isAdmin ? true : false;

    let result;

    result = await dbClient.query(
        `SELECT "id" FROM "users" WHERE "email"=$1 AND "source"='internal' LIMIT 1`,
        [email]
    );

    if (result && result.rows && result.rows.length) {
        throw new Error(
            `Failed to create user: an user with email: ${email} already exists.`
        );
    }

    result = await dbClient.query(
        `INSERT INTO "users" ("id", "displayName", "email", "source", "sourceId", "isAdmin") VALUES(uuid_generate_v4(), $1, $2, 'internal', $3, $4) RETURNING id`,
        [displayName, email, email, isAdmin]
    );

    const userInfo = result.rows[0];
    const userId = userInfo.id;

    if (isAdmin) {
        await dbClient.query(
            `INSERT INTO "user_roles" ("id", "user_id", "role_id") VALUES(uuid_generate_v4(), $1, '00000000-0000-0003-0000-000000000000') RETURNING id`,
            [userId]
        );
    }

    return userId;
}

async function getUserIdFromEmailOrUid(dbClient, user) {
    user = user.trim();
    let userId;
    if (isEmail(user)) {
        const result = await dbClient.query(
            `SELECT "id" FROM "users" WHERE "email"=$1 AND "source"='internal' LIMIT 1`,
            [user]
        );

        if (!result || !result.rows || !result.rows.length) {
            throw new Error(`Cannot locate internal user by email: ${user}`);
        }

        userId = result.rows[0]["id"];
    } else if (isUuid(user)) {
        const result = await dbClient.query(
            `SELECT "id", "source" FROM "users" WHERE "id"=$1 LIMIT 1`,
            [user]
        );

        if (!result || !result.rows || !result.rows.length) {
            throw new Error(`Cannot locate user record by id: ${user}`);
        }

        const userRecord = result.rows[0];
        if (userRecord.source !== "internal") {
            throw new Error(
                `The user record (id: ${user}) is not an internal user record.`
            );
        }
        userId = userRecord.id;
    } else {
        throw new Error(
            "-u / --user switch requires either valid uuid or email address."
        );
    }
    return userId;
}

(async () => {
    const options = program.opts();

    if (!options || (!options.user && !options.create)) {
        program.help();
        return;
    }

    const pool = getDBPool();
    const dbClient = await pool.connect();

    try {
        await dbClient.query("BEGIN");
        const userId = options.user
            ? await getUserIdFromEmailOrUid(dbClient, options.user)
            : await createUser(dbClient, options);

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

        const hash = await bcrypt.hash(password, SALT_ROUNDS);

        const credentials = await dbClient.query(
            `SELECT * FROM "credentials" WHERE "user_id"=$1 LIMIT 1`,
            [userId]
        );
        if (!credentials || !credentials.rows || !credentials.rows.length) {
            await dbClient.query(
                `INSERT INTO "credentials" ("id", "user_id", "timestamp", "hash") VALUES(uuid_generate_v4(), $1, CURRENT_TIMESTAMP, $2)`,
                [userId, hash]
            );
        } else {
            const cid = credentials.rows[0].id;
            await dbClient.query(
                `UPDATE "credentials" SET "hash"=$1, "timestamp"=CURRENT_TIMESTAMP WHERE "id"=$2`,
                [hash, cid]
            );
        }
        await dbClient.query("COMMIT");

        console.log(
            chalk.green(
                `Password for user (id: ${userId}) has been set to: ${password}`
            )
        );
    } catch (e) {
        await dbClient.query("ROLLBACK");
        throw e;
    } finally {
        dbClient.release();
    }

    process.exit();
})().catch(e => {
    console.error(chalk.red(`Failed to reset user password: ${e}`));
    process.exit(1);
});
