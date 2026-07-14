import "mocha";
import pg from "pg";
import { expect } from "chai";
import getTestDBConfig from "./getTestDBConfig.js";
import runMigrationSql from "./runMigrationSql.js";
import Database from "../Database.js";

describe("Database.deleteUser (integration)", function (this: Mocha.Suite) {
    this.timeout(30000);
    let pool: pg.Pool = null;
    let database: Database;
    const dbConfig = getTestDBConfig();

    before(async function () {
        // --- connect to the default db first so we can (re)create the test db
        pool = new pg.Pool({ ...dbConfig });
        try {
            await pool.query("CREATE database test");
        } catch (e) {
            // --- ignore the error if database `test` already exists
            if ((e as any)?.code !== "42P04") {
                throw e;
            }
        }
        await pool.end();

        // --- reconnect to the test db & rebuild a clean auth schema in it
        pool = new pg.Pool({ ...dbConfig, database: "test" });
        await runMigrationSql(pool, true);

        // --- `Database` builds its own pool (pointing at the `auth` db) in the
        // --- constructor. Swap in our test-db pool so we exercise the real SQL
        // --- against the migrated schema.
        database = new Database({ dbHost: dbConfig.host, dbPort: 5432 });
        const throwawayPool = database.getPool();
        (database as any).pool = pool;
        await throwawayPool.end();
    });

    after(async function () {
        if (pool) {
            await pool.end();
            pool = null;
        }
    });

    it("deletes the user record and cascades to its role associations", async () => {
        const created = await database.createUser({
            displayName: "delete-me",
            email: "delete-me@example.com",
            photoURL: "",
            source: "test-source",
            sourceId: "delete-me-source-id"
        });
        expect(created.id).to.be.a("string");

        // --- sanity check: the user & its auto-assigned role association exist
        const userBefore = await pool.query(
            `SELECT id FROM users WHERE id = $1`,
            [created.id]
        );
        expect(userBefore.rows).to.have.lengthOf(1);
        const rolesBefore = await pool.query(
            `SELECT 1 FROM user_roles WHERE user_id = $1`,
            [created.id]
        );
        expect(rolesBefore.rows).to.have.lengthOf(1);

        // --- the behaviour under test. Before the fix this threw
        // --- `syntax error at or near "users"` because the DELETE statement
        // --- was missing the `FROM` keyword (see issue #3677).
        await database.deleteUser(created.id);

        const userAfter = await pool.query(
            `SELECT id FROM users WHERE id = $1`,
            [created.id]
        );
        expect(userAfter.rows).to.have.lengthOf(0);

        // --- the documented cascade removes the user's role associations too
        const rolesAfter = await pool.query(
            `SELECT 1 FROM user_roles WHERE user_id = $1`,
            [created.id]
        );
        expect(rolesAfter.rows).to.have.lengthOf(0);
    });
});
