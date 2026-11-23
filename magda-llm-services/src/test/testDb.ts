import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATION_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../magda-migrator-llm-services-db/sql"
);

/**
 * Connection settings for the test PostgreSQL, from the same variables as the
 * other services' DB tests (POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD;
 * port via PGPORT).
 */
export function testDbConfig(): pg.PoolConfig {
    return {
        host: process.env.POSTGRES_HOST || "localhost",
        user: process.env.POSTGRES_USER || "postgres",
        password: process.env.POSTGRES_PASSWORD || "",
        database: process.env.POSTGRES_DB || "postgres"
    };
}

function versionOf(file: string) {
    const match = file.match(/^V(\d+(?:_\d+)*)__/);
    return match ? match[1].split("_").map(Number) : [];
}

function compareVersions(a: number[], b: number[]) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0);
        if (d) return d;
    }
    return 0;
}

/**
 * Create a throwaway database with the `magda-migrator-llm-services-db`
 * migrations applied, and return a pool for it plus a cleanup function.
 */
export async function createTestDatabase(prefix: string) {
    const config = testDbConfig();
    const name = `test_llm_${prefix}_${Date.now()}_${Math.floor(
        Math.random() * 1e6
    )}`;
    const admin = new pg.Pool(config);
    await admin.query(`CREATE DATABASE "${name}"`);
    await admin.end();

    const pool = new pg.Pool({ ...config, database: name });
    const files = (await fs.readdir(MIGRATION_DIR))
        .filter((f) => f.endsWith(".sql"))
        .sort((a, b) => compareVersions(versionOf(a), versionOf(b)));
    for (const file of files) {
        const sql = (await fs.readFile(path.join(MIGRATION_DIR, file), "utf8"))
            .replace(/\$\{clientUserName\}/g, config.user as string)
            .replace(
                /\$\{clientPassword\}/g,
                (config.password as string) || ""
            );
        await pool.query(sql);
    }

    async function drop() {
        await pool.end();
        const cleanup = new pg.Pool(config);
        try {
            await cleanup.query(`DROP DATABASE IF EXISTS "${name}"`);
        } finally {
            await cleanup.end();
        }
    }

    return { pool, drop };
}
