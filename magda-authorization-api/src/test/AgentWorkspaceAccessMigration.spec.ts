import "mocha";
import pg from "pg";
import { expect } from "chai";
import fse from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import getTestDBConfig from "./getTestDBConfig.js";
import runMigrationSql from "./runMigrationSql.js";

const WORKSPACE_ROLE_ID = "00000000-3854-4200-8000-000000000001";
const SKILLS_ADMIN_ROLE_ID = "00000000-3854-4200-8000-000000000002";
const ANONYMOUS_ROLE_ID = "00000000-0000-0001-0000-000000000000";
const AUTHENTICATED_ROLE_ID = "00000000-0000-0002-0000-000000000000";

describe("Agent Workspace access migration", function (this: Mocha.Suite) {
    this.timeout(30000);
    const dbConfig = getTestDBConfig();
    const testDbName = `test_agent_workspace_auth_${Date.now()}_${Math.floor(
        Math.random() * 1e6
    )}`;
    let pool: pg.Pool;

    before(async () => {
        const adminPool = new pg.Pool({ ...dbConfig });
        await adminPool.query(`CREATE DATABASE "${testDbName}"`);
        await adminPool.end();
        pool = new pg.Pool({ ...dbConfig, database: testDbName });
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

    async function workspaceOperations() {
        return (
            await pool.query(
                `SELECT o.uri, r.uri AS resource_uri
                   FROM operations o
                   JOIN resources r ON r.id = o.resource_id
                  WHERE o.uri LIKE 'agentWorkspace%'
                     OR r.uri LIKE 'agentWorkspace%'
                  ORDER BY o.uri`
            )
        ).rows;
    }

    it("is absent after the Stage-1 skill migration", async () => {
        await runMigrationSql(pool, false, 2.4);
        expect(await workspaceOperations()).to.deep.equal([]);
    });

    it("registers exactly one self-only operation incrementally", async () => {
        // Apply V2_5 alone on top of the Stage-1 database.
        await pool.query(
            await fse.readFile(
                path.resolve(
                    path.dirname(fileURLToPath(import.meta.url)),
                    "../../../magda-migrator-authorization-db/sql/V2_5__agent_workspace_access.sql"
                ),
                { encoding: "utf-8" }
            )
        );
        expect(await workspaceOperations()).to.deep.equal([
            { uri: "agentWorkspace/access", resource_uri: "agentWorkspace" }
        ]);

        const permissions = await pool.query(
            `SELECT p.user_ownership_constraint,
                    p.org_unit_ownership_constraint,
                    p.pre_authorised_constraint,
                    p.allow_exemption,
                    array_agg(o.uri ORDER BY o.uri) AS operations
               FROM permissions p
               JOIN permission_operations po ON po.permission_id = p.id
               JOIN operations o ON o.id = po.operation_id
              WHERE o.uri LIKE 'agentWorkspace%'
              GROUP BY p.id`
        );
        expect(permissions.rows).to.deep.equal([
            {
                user_ownership_constraint: false,
                org_unit_ownership_constraint: false,
                pre_authorised_constraint: false,
                allow_exemption: false,
                operations: ["agentWorkspace/access"]
            }
        ]);
    });

    it("grants the operation only through the unassigned Agent Workspace Users role", async () => {
        const grants = await pool.query(
            `SELECT DISTINCT rp.role_id
               FROM role_permissions rp
               JOIN permission_operations po ON po.permission_id = rp.permission_id
               JOIN operations o ON o.id = po.operation_id
              WHERE o.uri = 'agentWorkspace/access'`
        );
        expect(grants.rows.map((row) => row.role_id)).to.deep.equal([
            WORKSPACE_ROLE_ID
        ]);
        expect(grants.rows.map((row) => row.role_id)).to.not.include.members([
            ANONYMOUS_ROLE_ID,
            AUTHENTICATED_ROLE_ID,
            SKILLS_ADMIN_ROLE_ID
        ]);

        const workspaceRoleGrants = await pool.query(
            `SELECT count(*)::int AS count FROM role_permissions WHERE role_id = $1`,
            [WORKSPACE_ROLE_ID]
        );
        // Six Stage-1 skill permissions plus Workspace access.
        expect(workspaceRoleGrants.rows[0].count).to.equal(7);

        const assignments = await pool.query(
            `SELECT role_id FROM user_roles WHERE role_id = $1`,
            [WORKSPACE_ROLE_ID]
        );
        expect(assignments.rows).to.deep.equal([]);
    });
});
