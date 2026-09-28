import pg, { PoolConfig } from "pg";
import fs from "fs";

export interface PoolCreationOptions {
    dbHost: string;
    dbPort: number;
    dbUser?: string; // if not specified, env var will be used
    dbPassword?: string; // if not specified, env var will be used
    database?: string;
}

// >>> BEGIN shared:pg-ssl — keep in sync with magda-typescript-common/src/createPgPool.ts (drift enforced by @magda/typescript-common createPgPool.spec.ts, comments excluded) >>>
/**
 * The `ssl` option value handed to node-postgres.
 * `false` means "connect in plaintext".
 */
export type PgSslConfig =
    | false
    | {
          rejectUnauthorized: boolean;
          ca?: string;
          checkServerIdentity?: () => undefined;
      };

const SUPPORTED_SSL_MODES = ["disable", "require", "verify-ca", "verify-full"];

/**
 * Translate libpq's `PGSSLMODE` into node-postgres' `ssl` option.
 *
 * This mirrors `getPgSslConfigFromEnv` in `@magda/typescript-common`
 * (`src/createPgPool.ts`), which is the canonical implementation. It is
 * duplicated rather than imported because this SDK is published as a
 * self-contained bundle for third-party authentication plugins and
 * deliberately depends only on `pg`; pulling in the whole of
 * `@magda/typescript-common` for ~30 lines would bloat every plugin using it.
 * Keep the two in sync — together they define the `sslmode` vocabulary Magda
 * accepts.
 *
 * Why this must exist at all: node-postgres reads `PGSSLMODE` itself, but only
 * when `ssl` is `undefined`, and its interpretation is wrong for Magda. It maps
 * `require` to `ssl: true`, which leaves `rejectUnauthorized` at Node's default
 * of `true` — and Magda's in-cluster PostgreSQL serves a self-signed
 * certificate, so the handshake would fail with `SELF_SIGNED_CERT_IN_CHAIN` and
 * take authentication down entirely. Callers must therefore always pass the
 * result of this function explicitly as `ssl`, so node-postgres' own handling
 * never runs.
 */
export function getPgSslConfigFromEnv(
    env: NodeJS.ProcessEnv = process.env
): PgSslConfig {
    const sslMode = (env.PGSSLMODE ?? "").trim().toLowerCase();

    if (sslMode === "" || sslMode === "disable") {
        // No PGSSLMODE means local development, docker-compose, a test run, or
        // a chart that predates TLS support. Keep the plaintext behaviour.
        return false;
    }

    // Read lazily: only the `verify-*` modes consult the CA. Reading eagerly
    // would let a stale or not-yet-mounted PGSSLROOTCERT abort startup under
    // `require`, which verifies nothing and never looks at the file.
    const readCa = (): string | undefined => {
        const caFilePath = env.PGSSLROOTCERT;
        if (!caFilePath) {
            // Fall back to Node's built-in trust store.
            return undefined;
        }
        try {
            return fs.readFileSync(caFilePath, "utf-8");
        } catch (e) {
            throw new Error(
                `Failed to read the CA file specified by PGSSLROOTCERT ` +
                    `("${caFilePath}") required by PGSSLMODE=${sslMode}: ` +
                    `${e instanceof Error ? e.message : String(e)}`,
                { cause: e }
            );
        }
    };

    switch (sslMode) {
        case "require":
            // libpq semantics: encrypt, but verify neither the chain nor the
            // hostname. No CA distribution required.
            return { rejectUnauthorized: false };
        case "verify-ca":
            // Verify the certificate chain but not the hostname.
            return {
                rejectUnauthorized: true,
                ca: readCa(),
                checkServerIdentity: () => undefined
            };
        case "verify-full":
            // Node's TLS stack verifies the hostname by default.
            return { rejectUnauthorized: true, ca: readCa() };
        default:
            throw new Error(
                `Unsupported PGSSLMODE value: "${env.PGSSLMODE}". ` +
                    `Supported values are: ${SUPPORTED_SSL_MODES.join(", ")}.`
            );
    }
}
// <<< END shared:pg-ssl >>>

function createPool(options: PoolCreationOptions) {
    const { dbUser, dbPassword } = options;
    const dbConfig = {
        database: options?.database ? options.database : "session", //env var: PGDATABASE
        host: options.dbHost, // Server hosting the postgres database
        port: options.dbPort, //env var: PGPORT
        max: 10, // max number of clients in the pool
        idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
        // Always explicit — see getPgSslConfigFromEnv() above.
        ssl: getPgSslConfigFromEnv()
    } as PoolConfig;

    if (dbUser) {
        dbConfig.user = dbUser;
    }

    if (dbPassword) {
        dbConfig.password = dbPassword;
    }

    const pool = new pg.Pool(dbConfig);

    pool.on("error", function (err, client) {
        // if an error is encountered by a client while it sits idle in the pool
        // the pool itself will emit an error event with both the error and
        // the client which emitted the original error
        // this is a rare occurrence but can happen if there is a network partition
        // between your application and the database, the database restarts, etc.
        // and so you might want to handle it and at least log it out
        console.error("idle client error", err.message, err.stack);
    });

    return pool;
}

export default createPool;
