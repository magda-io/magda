import pg from "pg";
import fs from "fs";

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

/**
 * The sslmode values Magda's Helm chart is allowed to inject.
 * `verify-ca` / `verify-full` are implemented here but currently rejected by
 * the chart, which has no way to deliver a CA file to the pod yet.
 */
const SUPPORTED_SSL_MODES = ["disable", "require", "verify-ca", "verify-full"];

/**
 * Translate libpq's `PGSSLMODE` into node-postgres' `ssl` option.
 *
 * node-postgres reads `PGSSLMODE` itself, but only when `ssl` is `undefined`,
 * and its interpretation differs from libpq's: it maps `prefer` to `ssl: true`
 * (which hard-fails against a server that doesn't offer TLS instead of falling
 * back) and defaults to `rejectUnauthorized: true` (which rejects the
 * self-signed certificate the in-cluster database uses). Callers must therefore
 * always pass the result of this function explicitly as `ssl`, so that
 * node-postgres' own handling never runs.
 */
export function getPgSslConfigFromEnv(
    env: NodeJS.ProcessEnv = process.env
): PgSslConfig {
    const sslMode = (env.PGSSLMODE ?? "").trim().toLowerCase();

    if (sslMode === "" || sslMode === "disable") {
        // No PGSSLMODE means local development, docker-compose or a test run.
        // Keep the historical plaintext behaviour.
        return false;
    }

    const caFilePath = env.PGSSLROOTCERT;
    const ca = caFilePath ? fs.readFileSync(caFilePath, "utf-8") : undefined;

    switch (sslMode) {
        case "require":
            // libpq semantics: encrypt, but verify neither the chain nor the
            // hostname. No CA distribution required.
            return { rejectUnauthorized: false };
        case "verify-ca":
            // Verify the certificate chain but not the hostname.
            return {
                rejectUnauthorized: true,
                ca,
                checkServerIdentity: () => undefined
            };
        case "verify-full":
            // Node's TLS stack verifies the hostname by default.
            return { rejectUnauthorized: true, ca };
        default:
            throw new Error(
                `Unsupported PGSSLMODE value: "${env.PGSSLMODE}". ` +
                    `Supported values are: ${SUPPORTED_SSL_MODES.join(", ")}.`
            );
    }
}

export interface PgPoolCreationOptions {
    dbHost: string;
    dbPort: number;
    database: string;
    maxClients?: number;
    idleTimeoutMillis?: number;
}

/**
 * Create the `pg.Pool` used by every Magda Node service that talks to
 * PostgreSQL. Centralised so the TLS decision has exactly one home.
 */
export default function createPgPool(options: PgPoolCreationOptions): pg.Pool {
    const pool = new pg.Pool({
        database: options.database,
        host: options.dbHost,
        port: options.dbPort,
        max: options.maxClients ?? 10,
        idleTimeoutMillis: options.idleTimeoutMillis ?? 30000,
        // Always explicit — see getPgSslConfigFromEnv().
        ssl: getPgSslConfigFromEnv()
    });

    pool.on("error", function (err) {
        // A client can fail while sitting idle in the pool, e.g. on a network
        // partition or a database restart. Rare, but worth logging.
        console.error("idle client error", err.message, err.stack);
    });

    return pool;
}
