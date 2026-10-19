import "mocha";
import pg from "pg";
import { expect } from "chai";
import getTestDBConfig from "./getTestDBConfig.js";
import runMigrationSql from "./runMigrationSql.js";

const WORKSPACE_ROLE_ID = "00000000-3854-4200-8000-000000000001";
const ADMIN_ROLE_ID = "00000000-3854-4200-8000-000000000002";
const AUTHENTICATED_ROLE_ID = "00000000-0000-0002-0000-000000000000";

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
        // Stage-1 (#3854) state only; V2_5 (#3858) is covered by
        // AgentWorkspaceAccessMigration.spec.ts.
        await runMigrationSql(pool, false, 2.4);
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

    it("registers system, user and future installation CRUD without a wildcard", async () => {
        const resources = await pool.query(
            `SELECT uri FROM resources WHERE uri LIKE 'object/agentSkill/%' ORDER BY uri`
        );
        expect(resources.rows.map((row) => row.uri)).to.deep.equal([
            "object/agentSkill/install",
            "object/agentSkill/system",
            "object/agentSkill/user"
        ]);

        const operations = await pool.query(
            `SELECT uri FROM operations WHERE uri LIKE 'object/agentSkill/%' ORDER BY uri`
        );
        expect(operations.rows.map((row) => row.uri)).to.deep.equal(
            ["install", "system", "user"].flatMap((type) =>
                ["create", "delete", "read", "update"].map(
                    (operation) => `object/agentSkill/${type}/${operation}`
                )
            )
        );
        expect(
            operations.rows.some(
                (row) =>
                    row.uri === "object/agentSkill/*/read" ||
                    row.uri === "object/agentSkill/read"
            )
        ).to.equal(false);
    });

    it("seeds constrained reads, owner CRUD and trusted system CRUD", async () => {
        const permissions = await pool.query(
            `SELECT p.name, p.user_ownership_constraint,
                    p.org_unit_ownership_constraint,
                    p.pre_authorised_constraint, p.allow_exemption,
                    array_agg(o.uri ORDER BY o.uri) AS operations
               FROM permissions p
               JOIN permission_operations po ON po.permission_id = p.id
               JOIN operations o ON o.id = po.operation_id
              WHERE o.uri LIKE 'object/agentSkill/%'
              GROUP BY p.id, p.name
              ORDER BY p.name`
        );
        expect(permissions.rows).to.have.lengthOf(7);
        for (const name of [
            "Read System Agent Skills by Organisation",
            "Read Pre-authorised System Agent Skills",
            "Read User Agent Skills by Organisation",
            "Read Pre-authorised User Agent Skills"
        ]) {
            const permission = permissions.rows.find(
                (row) => row.name === name
            );
            expect(permission).to.exist;
            expect(permission.allow_exemption).to.equal(true);
        }
        const systemAdmin = permissions.rows.find(
            (row) => row.name === "Manage System Agent Skills"
        );
        expect(systemAdmin).to.include({
            user_ownership_constraint: false,
            org_unit_ownership_constraint: false,
            pre_authorised_constraint: false
        });
        expect(systemAdmin.operations).to.have.lengthOf(4);
    });

    it("creates unassigned stock roles without prematurely referencing workspace access", async () => {
        const roles = await pool.query(
            `SELECT id, name FROM roles WHERE id = ANY($1::uuid[]) ORDER BY name`,
            [[WORKSPACE_ROLE_ID, ADMIN_ROLE_ID]]
        );
        expect(roles.rows.map((row) => row.name)).to.deep.equal([
            "Agent Skills Admins",
            "Agent Workspace Users"
        ]);

        const grants = await pool.query(
            `SELECT rp.role_id, p.name
               FROM role_permissions rp
               JOIN permissions p ON p.id = rp.permission_id
              WHERE rp.role_id = ANY($1::uuid[])
              ORDER BY rp.role_id, p.name`,
            [[WORKSPACE_ROLE_ID, ADMIN_ROLE_ID]]
        );
        expect(
            grants.rows.filter((row) => row.role_id === WORKSPACE_ROLE_ID)
        ).to.have.lengthOf(6);
        expect(
            grants.rows.filter((row) => row.role_id === ADMIN_ROLE_ID)
        ).to.deep.equal([
            { role_id: ADMIN_ROLE_ID, name: "Manage System Agent Skills" }
        ]);
        const authenticatedGrants = await pool.query(
            `SELECT rp.permission_id
               FROM role_permissions rp
               JOIN permission_operations po ON po.permission_id = rp.permission_id
               JOIN operations o ON o.id = po.operation_id
              WHERE rp.role_id = $1
                AND o.uri LIKE 'object/agentSkill/%'`,
            [AUTHENTICATED_ROLE_ID]
        );
        expect(authenticatedGrants.rows).to.deep.equal([]);

        const assignments = await pool.query(
            `SELECT role_id FROM user_roles WHERE role_id = ANY($1::uuid[])`,
            [[WORKSPACE_ROLE_ID, ADMIN_ROLE_ID]]
        );
        expect(assignments.rows).to.deep.equal([]);
        const workspaceOperation = await pool.query(
            `SELECT 1 FROM operations WHERE uri = 'agentWorkspace/access'`
        );
        expect(workspaceOperation.rows).to.deep.equal([]);
    });
});
