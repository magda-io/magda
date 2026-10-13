import "mocha";
import pg from "pg";
import { expect } from "chai";
import getTestDBConfig from "./getTestDBConfig.js";
import runMigrationSql from "./runMigrationSql.js";

const RESOURCE_ID = "078c459f-6fa6-46be-a47d-e657854ebf95";
const SYSTEM_READ_PERMISSION_ID = "108d9223-e0f1-4591-bdca-03c94bcb6a89";
const OWNER_PERMISSION_ID = "af8b612c-c849-4324-852f-665adafdeb0d";
const AUTHENTICATED_ROLE_ID = "00000000-0000-0002-0000-000000000000";
const ANONYMOUS_ROLE_ID = "00000000-0000-0001-0000-000000000000";

describe("Agent Skill authorization migration", function (this: Mocha.Suite) {
    this.timeout(30000);
    const dbConfig = getTestDBConfig();
    const testDbName = `test_agent_skill_auth_${Date.now()}_${Math.floor(
        Math.random() * 1e6
    )}`;
    let pool: pg.Pool;

    before(async () => {
        const adminPool = new pg.Pool({ ...dbConfig });
        await adminPool.query(`CREATE DATABASE "${testDbName}"`);
        await adminPool.end();
        pool = new pg.Pool({ ...dbConfig, database: testDbName });
        await runMigrationSql(pool);
    });

    after(async () => {
        if (pool) await pool.end();
        const adminPool = new pg.Pool({ ...dbConfig });
        try {
            await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
        } finally {
            await adminPool.end();
        }
    });

    it("seeds fixed Agent Skill resource and CRUD operation identities", async () => {
        const resource = await pool.query(
            `SELECT id, uri FROM resources WHERE id = $1`,
            [RESOURCE_ID]
        );
        expect(resource.rows).to.deep.equal([
            { id: RESOURCE_ID, uri: "object/agentSkill" }
        ]);

        const operations = await pool.query(
            `SELECT uri FROM operations WHERE resource_id = $1 ORDER BY uri`,
            [RESOURCE_ID]
        );
        expect(operations.rows.map((row) => row.uri)).to.deep.equal([
            "object/agentSkill/create",
            "object/agentSkill/delete",
            "object/agentSkill/read",
            "object/agentSkill/update"
        ]);
    });

    it("grants system-read and owner CRUD permissions only to authenticated users", async () => {
        const permissions = await pool.query(
            `SELECT id, user_ownership_constraint, org_unit_ownership_constraint,
                    pre_authorised_constraint
               FROM permissions
              WHERE id = ANY($1::uuid[])
              ORDER BY id`,
            [[SYSTEM_READ_PERMISSION_ID, OWNER_PERMISSION_ID]]
        );
        expect(permissions.rows).to.have.lengthOf(2);
        const systemRead = permissions.rows.find(
            (row) => row.id === SYSTEM_READ_PERMISSION_ID
        );
        const owner = permissions.rows.find(
            (row) => row.id === OWNER_PERMISSION_ID
        );
        expect(systemRead).to.include({
            user_ownership_constraint: false,
            org_unit_ownership_constraint: false,
            pre_authorised_constraint: false
        });
        expect(owner).to.include({
            user_ownership_constraint: true,
            org_unit_ownership_constraint: false,
            pre_authorised_constraint: false
        });

        const operationCounts = await pool.query(
            `SELECT permission_id, COUNT(*)::int AS count
               FROM permission_operations
              WHERE permission_id = ANY($1::uuid[])
              GROUP BY permission_id`,
            [[SYSTEM_READ_PERMISSION_ID, OWNER_PERMISSION_ID]]
        );
        expect(
            operationCounts.rows.find(
                (row) => row.permission_id === SYSTEM_READ_PERMISSION_ID
            ).count
        ).to.equal(1);
        expect(
            operationCounts.rows.find(
                (row) => row.permission_id === OWNER_PERMISSION_ID
            ).count
        ).to.equal(4);

        const grants = await pool.query(
            `SELECT role_id, permission_id
               FROM role_permissions
              WHERE permission_id = ANY($1::uuid[])
              ORDER BY permission_id`,
            [[SYSTEM_READ_PERMISSION_ID, OWNER_PERMISSION_ID]]
        );
        expect(grants.rows).to.have.lengthOf(2);
        expect(
            grants.rows.every((row) => row.role_id === AUTHENTICATED_ROLE_ID)
        ).to.equal(true);
        expect(
            grants.rows.some((row) => row.role_id === ANONYMOUS_ROLE_ID)
        ).to.equal(false);
    });
});
