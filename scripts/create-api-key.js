#!/usr/bin/env node
const pkg = require("./package.json");
const program = require("commander");
const chalk = require("chalk");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const getDBPool = require("./db/getDBPool");
const isUuid = require("isuuid");
const { table } = require("table");

program
    .version(pkg.version)
    .usage("[options]")
    .description(
        `A tool for creating API keys for a user. Version: ${pkg.version}\n` +
            `The database connection to auth DB is required, the following environment variables will be used to create a connection:\n` +
            `  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.\n` +
            `  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.\n` +
            `  POSTGRES_PORT: database port; If not available in env var, 5432 will be used.\n` +
            `  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.\n` +
            `  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.`
    )
    .option(
        "-u, --userId [User ID]",
        "Specify the user id whose api key will be created."
    )
    .option("-c, --create", "set this switch to create a new api key")
    .option(
        "-l, --list",
        "When -u switch presents, this switch will list all api keys (id & create time) of the user. Otherwise, all users will be listed."
    )
    .parse(process.argv);

/**
 * Salting round. Default is 10. means 2^10 rounds
 * When 10, approx. ~10 hashes can be generated per sec (on a 2GHz core) roughly
 * We set to 10 here so API key access will have reasonable performance
 */
const SALT_ROUNDS = 10;
const API_KEY_LENGTH = 32;

/**
 * Generates cryptographically strong pseudo-random data as API key
 * https://nodejs.org/api/crypto.html#crypto_crypto_randombytes_size_callback
 *
 * @param {number} size
 * @returns {Promise<string>}
 */
const generateAPIKey = (size) =>
    new Promise((resolve, reject) => {
        crypto.randomBytes(size, (err, buf) => {
            if (err) {
                reject(err);
                return;
            } else {
                resolve(buf.toString("base64"));
            }
        });
    });

function printResult(result) {
    console.log(
        table(
            [Object.keys(result.rows[0])].concat(
                result.rows.map((item) => Object.values(item))
            )
        )
    );
}

(async () => {
    const options = program.opts();

    if (!options || (!options.userId && !options.list)) {
        program.help();
        return;
    }

    const pool = getDBPool();
    const dbClient = await pool.connect();

    try {
        if (options.userId) {
            if (!isUuid(options.userId)) {
                throw new Error("Invalid user id: should be in UUID format.");
            }

            const users = await dbClient.query(
                'SELECT id, "displayName" FROM users WHERE id=$1 LIMIT 1',
                [options.userId]
            );

            if (!users || !users.rows || !users.rows.length) {
                throw new Error(
                    `Cannot locate user record with user id: ${options.userId}`
                );
            }

            if (options.list) {
                // --- list all api keys
                const keys = await dbClient.query(
                    "SELECT id, created_timestamp FROM api_keys WHERE user_id=$1",
                    [options.userId]
                );

                if (!keys || !keys.rows || !keys.rows.length) {
                    throw new Error(
                        `Cannot any api keys for user id: ${options.userId}`
                    );
                }

                printResult(keys);
            } else {
                // --- create a new API key
                const newKey = await generateAPIKey(API_KEY_LENGTH);
                const keyHash = await bcrypt.hash(newKey, SALT_ROUNDS);

                const result = await dbClient.query(
                    `INSERT INTO "api_keys" ("id", "user_id", "created_timestamp", "hash") VALUES(uuid_generate_v4(), $1, CURRENT_TIMESTAMP, $2) RETURNING id`,
                    [options.userId, keyHash]
                );
                const apiKeyId = result.rows[0].id;

                console.log(
                    chalk.green(
                        `Successfully create a new API for user ${users.rows["displayName"]}:`
                    )
                );
                console.log(`   API key: ${newKey}`);
                console.log(`API key ID: ${apiKeyId}`);
            }
        } else {
            // --- list all users
            const users = await dbClient.query(
                'SELECT "id", "displayName", "email", "source", "sourceId", "isAdmin" FROM "users"'
            );
            if (!users || !users.rows || !users.rows.length) {
                console.log(chalk.yellow("No user found!"));
            } else {
                printResult(users);
            }
        }
    } catch (e) {
        throw e;
    } finally {
        dbClient.release();
    }
    process.exit();
})().catch((e) => {
    console.error(chalk.red(`${e}`));
    process.exit(1);
});
