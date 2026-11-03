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

// The last migration released before this feature.
const BASELINE_VERSION = 2.2;

const MIGRATION_FILE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../magda-migrator-authorization-db/sql/V2_4__agent_workspace_and_skills.sql"
);

// Permission and role IDs are fixed, administrator-referenced contracts.
// Resource and operation IDs are generated and identified by their URI.
const EXPECTED_PERMISSIONS: Record<
    string,
    { name: string; resource: string }
> = {
    "00000000-3854-4100-8000-000000000001": {
        name: "Read System Agent Skills by Organisation",
        resource: "object/agentSkill/system"
    },
    "00000000-3854-4100-8000-000000000002": {
        name: "Read Pre-authorised System Agent Skills",
        resource: "object/agentSkill/system"
    },
    "00000000-3854-4100-8000-000000000003": {
        name: "Manage Own User Agent Skills",
        resource: "object/agentSkill/user"
    },
    "00000000-3854-4100-8000-000000000004": {
        name: "Read User Agent Skills by Organisation",
        resource: "object/agentSkill/user"
    },
    "00000000-3854-4100-8000-000000000005": {
        name: "Read Pre-authorised User Agent Skills",
        resource: "object/agentSkill/user"
    },
    "00000000-3854-4100-8000-000000000006": {
        name: "Manage Own Installed Agent Skills",
        resource: "object/agentSkill/install"
    },
    "00000000-3854-4100-8000-000000000007": {
        name: "Manage System Agent Skills",
        resource: "object/agentSkill/system"
    },
    "00000000-3858-4100-8000-000000000001": {
        name: "Access Own Agent Workspace",
        resource: "agentWorkspace"
    }
};

const EXPECTED_PERMISSION_OPERATIONS: [string, string][] = [
    ["00000000-3854-4100-8000-000000000001", "object/agentSkill/system/read"],
    ["00000000-3854-4100-8000-000000000002", "object/agentSkill/system/read"],
    ...["create", "read", "update", "delete"].map((op): [string, string] => [
        "00000000-3854-4100-8000-000000000003",
        `object/agentSkill/user/${op}`
    ]),
    ["00000000-3854-4100-8000-000000000004", "object/agentSkill/user/read"],
    ["00000000-3854-4100-8000-000000000005", "object/agentSkill/user/read"],
    ...["create", "read", "update", "delete"].map((op): [string, string] => [
        "00000000-3854-4100-8000-000000000006",
        `object/agentSkill/install/${op}`
    ]),
    ...["create", "read", "update", "delete"].map((op): [string, string] => [
        "00000000-3854-4100-8000-000000000007",
        `object/agentSkill/system/${op}`
    ]),
    ["00000000-3858-4100-8000-000000000001", "agentWorkspace/access"]
];

const EXPECTED_ROLE_PERMISSIONS: [string, string][] = [
    ...Object.keys(EXPECTED_PERMISSIONS)
        .filter((id) => id !== "00000000-3854-4100-8000-000000000007")
        .map((id): [string, string] => [WORKSPACE_ROLE_ID, id]),
    [SKILLS_ADMIN_ROLE_ID, "00000000-3854-4100-8000-000000000007"]
];

const AGENT_RESOURCE_FILTER = `(r.uri LIKE 'object/agentSkill/%' OR r.uri = 'agentWorkspace')`;

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

    it("links every operation to the resource named by its URI", async () => {
        const rows = (
            await pool.query(
                `SELECT o.uri, r.uri AS resource_uri
                   FROM operations o
                   JOIN resources r ON r.id = o.resource_id
                  WHERE ${AGENT_RESOURCE_FILTER}
                  ORDER BY o.uri`
            )
        ).rows;
        expect(rows).to.have.lengthOf(13);
        for (const row of rows) {
            expect(row.resource_uri, row.uri).to.equal(
                row.uri.slice(0, row.uri.lastIndexOf("/"))
            );
        }
    });

    it("keeps the fixed permission IDs on their intended resources", async () => {
        const rows = (
            await pool.query(
                `SELECT p.id, p.name, r.uri AS resource
                   FROM permissions p
                   JOIN resources r ON r.id = p.resource_id
                  WHERE ${AGENT_RESOURCE_FILTER}`
            )
        ).rows;
        expect(
            Object.fromEntries(
                rows.map((row) => [
                    row.id,
                    { name: row.name, resource: row.resource }
                ])
            )
        ).to.deep.equal(EXPECTED_PERMISSIONS);
    });

    it("associates each permission with exactly its expected operation URIs", async () => {
        const rows = (
            await pool.query(
                `SELECT po.permission_id, o.uri
                   FROM permission_operations po
                   JOIN operations o ON o.id = po.operation_id
                   JOIN resources r ON r.id = o.resource_id
                  WHERE ${AGENT_RESOURCE_FILTER}
                     OR po.permission_id = ANY($1::uuid[])`,
                [Object.keys(EXPECTED_PERMISSIONS)]
            )
        ).rows;
        const actual = rows
            .map((row) => `${row.permission_id} ${row.uri}`)
            .sort();
        const expected = EXPECTED_PERMISSION_OPERATIONS.map(
            ([permission, operation]) => `${permission} ${operation}`
        ).sort();
        expect(actual).to.deep.equal(expected);
    });

    it("keeps the fixed stock role IDs and their permission grants", async () => {
        const roles = (
            await pool.query(
                `SELECT id, name FROM roles WHERE id = ANY($1::uuid[]) ORDER BY id`,
                [[WORKSPACE_ROLE_ID, SKILLS_ADMIN_ROLE_ID]]
            )
        ).rows;
        expect(roles).to.deep.equal([
            { id: WORKSPACE_ROLE_ID, name: "Agent Workspace Users" },
            { id: SKILLS_ADMIN_ROLE_ID, name: "Agent Skills Admins" }
        ]);
        const grants = (
            await pool.query(
                `SELECT role_id, permission_id FROM role_permissions
                  WHERE role_id = ANY($1::uuid[])
                     OR permission_id = ANY($2::uuid[])`,
                [
                    [WORKSPACE_ROLE_ID, SKILLS_ADMIN_ROLE_ID],
                    Object.keys(EXPECTED_PERMISSIONS)
                ]
            )
        ).rows;
        expect(
            grants.map((row) => `${row.role_id} ${row.permission_id}`).sort()
        ).to.deep.equal(
            EXPECTED_ROLE_PERMISSIONS.map(
                ([role, permission]) => `${role} ${permission}`
            ).sort()
        );
    });

    it("hardcodes only permission and role IDs; resource and operation IDs are generated", async () => {
        const sql = await fse.readFile(MIGRATION_FILE, "utf-8");
        const literals = new Set(
            sql.match(
                /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
            ) ?? []
        );
        expect([...literals].sort()).to.deep.equal(
            [
                ...Object.keys(EXPECTED_PERMISSIONS),
                WORKSPACE_ROLE_ID,
                SKILLS_ADMIN_ROLE_ID
            ].sort()
        );
        const generated = (
            await pool.query(
                `SELECT r.id FROM resources r WHERE ${AGENT_RESOURCE_FILTER}
                 UNION ALL
                 SELECT o.id FROM operations o
                   JOIN resources r ON r.id = o.resource_id
                  WHERE ${AGENT_RESOURCE_FILTER}`
            )
        ).rows.map((row) => row.id);
        expect(generated).to.have.lengthOf(17);
        for (const id of generated) {
            expect(literals.has(id), id).to.equal(false);
        }
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
