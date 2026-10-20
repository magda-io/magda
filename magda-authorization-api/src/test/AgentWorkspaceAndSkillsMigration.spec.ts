import "mocha";
import pg from "pg";
import { expect } from "chai";
import getTestDBConfig from "./getTestDBConfig.js";
import runMigrationSql from "./runMigrationSql.js";

const WORKSPACE_ROLE_ID = "00000000-3854-4200-8000-000000000001";
const SKILLS_ADMIN_ROLE_ID = "00000000-3854-4200-8000-000000000002";
const ANONYMOUS_ROLE_ID = "00000000-0000-0001-0000-000000000000";
const AUTHENTICATED_ROLE_ID = "00000000-0000-0002-0000-000000000000";

// The last migration released before this feature.
const BASELINE_VERSION = 2.2;

const AUTH_TABLES = [
    "resources",
    "operations",
    "permissions",
    "permission_operations",
    "roles",
    "role_permissions",
    "user_roles"
];

describe("Agent Workspace and Skills authorization migration (V2_4)", function (this: Mocha.Suite) {
    this.timeout(30000);
    const dbConfig = getTestDBConfig();
    const testDbName = `test_agent_workspace_skills_auth_${Date.now()}_${Math.floor(
        Math.random() * 1e6
    )}`;
    let pool: pg.Pool;
    const baselineCounts: Record<string, number> = {};
    let baselineDefaultRoleGrants: { role_id: string; permission_id: string }[];

    async function countRows(table: string) {
        return (
            await pool.query(`SELECT count(*)::int AS count FROM "${table}"`)
        ).rows[0].count as number;
    }

    async function defaultRoleGrants() {
        return (
            await pool.query(
                `SELECT role_id, permission_id
                   FROM role_permissions
                  WHERE role_id = ANY($1::uuid[])
                  ORDER BY role_id, permission_id`,
                [[ANONYMOUS_ROLE_ID, AUTHENTICATED_ROLE_ID]]
            )
        ).rows;
    }

    before(async () => {
        const adminPool = new pg.Pool({ ...dbConfig });
        await adminPool.query(`CREATE DATABASE "${testDbName}"`);
        await adminPool.end();
        pool = new pg.Pool({ ...dbConfig, database: testDbName });

        await runMigrationSql(pool, false, BASELINE_VERSION);
        for (const table of AUTH_TABLES) {
            baselineCounts[table] = await countRows(table);
        }
        baselineDefaultRoleGrants = await defaultRoleGrants();
        const agentRows = await pool.query(
            `SELECT uri FROM operations
              WHERE uri LIKE 'object/agentSkill/%' OR uri LIKE 'agentWorkspace%'`
        );
        expect(agentRows.rows).to.deep.equal([]);

        // Upgrade the released baseline to the final state.
        await runMigrationSql(pool, false, Infinity, BASELINE_VERSION);
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

    it("adds exactly the intended rows on top of the baseline", async () => {
        const added: Record<string, number> = {};
        for (const table of AUTH_TABLES) {
            added[table] = (await countRows(table)) - baselineCounts[table];
        }
        expect(added).to.deep.equal({
            // 3 Agent Skill resources + agentWorkspace
            resources: 4,
            // 12 typed Agent Skill operations + agentWorkspace/access
            operations: 13,
            // 7 Agent Skill permissions + Access Own Agent Workspace
            permissions: 8,
            permission_operations: 17,
            roles: 2,
            // Agent Workspace Users: 6 skill + Workspace access; Skills Admins: 1
            role_permissions: 8,
            user_roles: 0
        });
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

    it("registers exactly one unconstrained self-only Workspace operation", async () => {
        const operations = await pool.query(
            `SELECT o.uri, r.uri AS resource_uri
               FROM operations o
               JOIN resources r ON r.id = o.resource_id
              WHERE o.uri LIKE 'agentWorkspace%'
                 OR r.uri LIKE 'agentWorkspace%'
              ORDER BY o.uri`
        );
        expect(operations.rows).to.deep.equal([
            { uri: "agentWorkspace/access", resource_uri: "agentWorkspace" }
        ]);

        const permissions = await pool.query(
            `SELECT p.name, p.user_ownership_constraint,
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
                name: "Access Own Agent Workspace",
                user_ownership_constraint: false,
                org_unit_ownership_constraint: false,
                pre_authorised_constraint: false,
                allow_exemption: false,
                operations: ["agentWorkspace/access"]
            }
        ]);
    });

    it("grants the stock roles exactly their intended permissions", async () => {
        const grants = await pool.query(
            `SELECT rp.role_id, p.name
               FROM role_permissions rp
               JOIN permissions p ON p.id = rp.permission_id
              WHERE rp.role_id = ANY($1::uuid[])
              ORDER BY rp.role_id, p.name`,
            [[WORKSPACE_ROLE_ID, SKILLS_ADMIN_ROLE_ID]]
        );
        expect(
            grants.rows
                .filter((row) => row.role_id === WORKSPACE_ROLE_ID)
                .map((row) => row.name)
        ).to.deep.equal([
            "Access Own Agent Workspace",
            "Manage Own Installed Agent Skills",
            "Manage Own User Agent Skills",
            "Read Pre-authorised System Agent Skills",
            "Read Pre-authorised User Agent Skills",
            "Read System Agent Skills by Organisation",
            "Read User Agent Skills by Organisation"
        ]);
        // Skills Admins does not imply Workspace access.
        expect(
            grants.rows
                .filter((row) => row.role_id === SKILLS_ADMIN_ROLE_ID)
                .map((row) => row.name)
        ).to.deep.equal(["Manage System Agent Skills"]);

        const workspaceGrants = await pool.query(
            `SELECT DISTINCT rp.role_id
               FROM role_permissions rp
               JOIN permission_operations po ON po.permission_id = rp.permission_id
               JOIN operations o ON o.id = po.operation_id
              WHERE o.uri = 'agentWorkspace/access'`
        );
        expect(workspaceGrants.rows.map((row) => row.role_id)).to.deep.equal([
            WORKSPACE_ROLE_ID
        ]);
    });

    it("leaves the stock roles unassigned and Anonymous/Authenticated Users unchanged", async () => {
        const assignments = await pool.query(
            `SELECT role_id FROM user_roles WHERE role_id = ANY($1::uuid[])`,
            [[WORKSPACE_ROLE_ID, SKILLS_ADMIN_ROLE_ID]]
        );
        expect(assignments.rows).to.deep.equal([]);
        expect(await defaultRoleGrants()).to.deep.equal(
            baselineDefaultRoleGrants
        );

        const agentGrants = await pool.query(
            `SELECT rp.role_id, o.uri
               FROM role_permissions rp
               JOIN permission_operations po ON po.permission_id = rp.permission_id
               JOIN operations o ON o.id = po.operation_id
              WHERE rp.role_id = ANY($1::uuid[])
                AND (o.uri LIKE 'object/agentSkill/%'
                     OR o.uri LIKE 'agentWorkspace%')`,
            [[ANONYMOUS_ROLE_ID, AUTHENTICATED_ROLE_ID]]
        );
        expect(agentGrants.rows).to.deep.equal([]);
    });

    it("has no duplicate or dangling references", async () => {
        const duplicateOperationUris = await pool.query(
            `SELECT uri FROM operations GROUP BY uri HAVING count(*) > 1`
        );
        expect(duplicateOperationUris.rows).to.deep.equal([]);
        const duplicateResourceUris = await pool.query(
            `SELECT uri FROM resources GROUP BY uri HAVING count(*) > 1`
        );
        expect(duplicateResourceUris.rows).to.deep.equal([]);
        const duplicatePermissionOperations = await pool.query(
            `SELECT permission_id, operation_id FROM permission_operations
              GROUP BY permission_id, operation_id HAVING count(*) > 1`
        );
        expect(duplicatePermissionOperations.rows).to.deep.equal([]);
        const duplicateRolePermissions = await pool.query(
            `SELECT role_id, permission_id FROM role_permissions
              GROUP BY role_id, permission_id HAVING count(*) > 1`
        );
        expect(duplicateRolePermissions.rows).to.deep.equal([]);

        // Every new permission's operations belong to its own resource.
        const crossResource = await pool.query(
            `SELECT p.name, o.uri
               FROM permissions p
               JOIN permission_operations po ON po.permission_id = p.id
               JOIN operations o ON o.id = po.operation_id
              WHERE (o.uri LIKE 'object/agentSkill/%'
                     OR o.uri LIKE 'agentWorkspace%')
                AND o.resource_id <> p.resource_id`
        );
        expect(crossResource.rows).to.deep.equal([]);

        // Every new permission is attached to at least one operation.
        const unusedPermissions = await pool.query(
            `SELECT p.name
               FROM permissions p
               JOIN resources r ON r.id = p.resource_id
              WHERE (r.uri LIKE 'object/agentSkill/%'
                     OR r.uri = 'agentWorkspace')
                AND NOT EXISTS (
                    SELECT 1 FROM permission_operations po
                     WHERE po.permission_id = p.id
                )`
        );
        expect(unusedPermissions.rows).to.deep.equal([]);
    });
});
