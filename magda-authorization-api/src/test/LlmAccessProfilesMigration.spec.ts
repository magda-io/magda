import "mocha";
import pg from "pg";
import { expect } from "chai";
import getTestDBConfig from "./getTestDBConfig.js";
import runMigrationSql from "./runMigrationSql.js";

const MANAGERS_ROLE_ID = "00000000-3838-4200-8000-000000000001";
const WORKSPACE_USERS_ROLE_ID = "00000000-3854-4200-8000-000000000001";
const ANONYMOUS_ROLE_ID = "00000000-0000-0001-0000-000000000000";
const AUTHENTICATED_ROLE_ID = "00000000-0000-0002-0000-000000000000";

const BASELINE_VERSION = 2.5;

// Permission and role IDs are fixed, administrator-referenced contracts.
const EXPECTED_PERMISSIONS: Record<
    string,
    {
        resource: string;
        operations: string[];
        orgUnit: boolean;
        allowExemption: boolean;
    }
> = {
    "00000000-3838-4100-8000-000000000001": {
        resource: "llm/access",
        operations: [
            "llm/access/create",
            "llm/access/delete",
            "llm/access/read",
            "llm/access/update"
        ],
        orgUnit: false,
        allowExemption: false
    },
    "00000000-3838-4100-8000-000000000002": {
        resource: "llm/access",
        operations: ["llm/access/invoke"],
        orgUnit: false,
        allowExemption: false
    },
    "00000000-3838-4100-8000-000000000003": {
        resource: "llm/usage",
        operations: ["llm/usage/read"],
        orgUnit: false,
        allowExemption: false
    },
    "00000000-3838-4100-8000-000000000004": {
        resource: "llm/access",
        operations: ["llm/access/invoke"],
        orgUnit: true,
        allowExemption: true
    }
};

describe("LLM access profiles authorization migration (V2_6)", function (this: Mocha.Suite) {
    this.timeout(30000);
    const dbConfig = getTestDBConfig();
    const testDbName = `test_llm_access_auth_${Date.now()}_${Math.floor(
        Math.random() * 1e6
    )}`;
    let pool: pg.Pool;
    let baselineDefaultRoleGrants: any[];

    async function defaultRoleGrants() {
        return (
            await pool.query(
                `SELECT role_id, permission_id FROM role_permissions
                  WHERE role_id = ANY($1::uuid[]) ORDER BY role_id, permission_id`,
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
        baselineDefaultRoleGrants = await defaultRoleGrants();
        await runMigrationSql(pool, false, 2.6, BASELINE_VERSION);
    });

    after(async () => {
        await pool.end();
        const adminPool = new pg.Pool({ ...dbConfig });
        try {
            await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
        } finally {
            await adminPool.end();
        }
    });

    it("registers the llm/access and llm/usage operations on their resources", async () => {
        const rows = (
            await pool.query(
                `SELECT o.uri AS operation, r.uri AS resource
                   FROM operations o JOIN resources r ON r.id = o.resource_id
                  WHERE r.uri LIKE 'llm/%' ORDER BY o.uri`
            )
        ).rows;
        expect(rows).to.deep.equal([
            { operation: "llm/access/create", resource: "llm/access" },
            { operation: "llm/access/delete", resource: "llm/access" },
            { operation: "llm/access/invoke", resource: "llm/access" },
            { operation: "llm/access/read", resource: "llm/access" },
            { operation: "llm/access/update", resource: "llm/access" },
            { operation: "llm/usage/read", resource: "llm/usage" }
        ]);
    });

    it("seeds the stock permissions with the expected resource, operations and constraints", async () => {
        for (const [id, expected] of Object.entries(EXPECTED_PERMISSIONS)) {
            const permission = (
                await pool.query(
                    `SELECT p.*, r.uri AS resource FROM permissions p
                       JOIN resources r ON r.id = p.resource_id WHERE p.id = $1`,
                    [id]
                )
            ).rows[0];
            expect(permission, id).to.be.an("object");
            expect(permission.resource).to.equal(expected.resource);
            expect(permission.user_ownership_constraint).to.equal(false);
            expect(permission.pre_authorised_constraint).to.equal(false);
            expect(permission.org_unit_ownership_constraint).to.equal(
                expected.orgUnit
            );
            expect(permission.allow_exemption).to.equal(
                expected.allowExemption
            );
            const operations = (
                await pool.query(
                    `SELECT o.uri FROM permission_operations po
                       JOIN operations o ON o.id = po.operation_id
                      WHERE po.permission_id = $1 ORDER BY o.uri`,
                    [id]
                )
            ).rows.map((r) => r.uri);
            expect(operations).to.deep.equal(expected.operations);
        }
    });

    it("grants the unassigned LLM Profile Managers role management, invoke and usage read, and nothing in authObject", async () => {
        const role = (
            await pool.query(`SELECT * FROM roles WHERE id = $1`, [
                MANAGERS_ROLE_ID
            ])
        ).rows[0];
        expect(role.name).to.equal("LLM Profile Managers");
        const grants = (
            await pool.query(
                `SELECT permission_id FROM role_permissions WHERE role_id = $1 ORDER BY permission_id`,
                [MANAGERS_ROLE_ID]
            )
        ).rows.map((r) => r.permission_id);
        expect(grants).to.deep.equal([
            "00000000-3838-4100-8000-000000000001",
            "00000000-3838-4100-8000-000000000002",
            "00000000-3838-4100-8000-000000000003"
        ]);
        const users = await pool.query(
            `SELECT 1 FROM user_roles WHERE role_id = $1`,
            [MANAGERS_ROLE_ID]
        );
        expect(users.rows).to.have.lengthOf(0);
    });

    it("adds the org unit / public invoke permission to Agent Workspace Users", async () => {
        const grants = (
            await pool.query(
                `SELECT permission_id FROM role_permissions
                  WHERE role_id = $1 AND permission_id::text LIKE '00000000-3838-%'`,
                [WORKSPACE_USERS_ROLE_ID]
            )
        ).rows.map((r) => r.permission_id);
        expect(grants).to.deep.equal(["00000000-3838-4100-8000-000000000004"]);
    });

    it("leaves Anonymous and Authenticated Users unchanged", async () => {
        expect(await defaultRoleGrants()).to.deep.equal(
            baselineDefaultRoleGrants
        );
    });
});

describe("LLM access profiles authorization migration (V2_6) when Agent Workspace Users was deleted", function (this: Mocha.Suite) {
    this.timeout(30000);
    const dbConfig = getTestDBConfig();
    const testDbName = `test_llm_access_auth_norole_${Date.now()}_${Math.floor(
        Math.random() * 1e6
    )}`;
    let pool: pg.Pool;

    before(async () => {
        const adminPool = new pg.Pool({ ...dbConfig });
        await adminPool.query(`CREATE DATABASE "${testDbName}"`);
        await adminPool.end();
        pool = new pg.Pool({ ...dbConfig, database: testDbName });
        await runMigrationSql(pool, false, BASELINE_VERSION);
        // An administrator may delete this non-system stock role before upgrading.
        await pool.query(`DELETE FROM role_permissions WHERE role_id = $1`, [
            WORKSPACE_USERS_ROLE_ID
        ]);
        await pool.query(`DELETE FROM roles WHERE id = $1`, [
            WORKSPACE_USERS_ROLE_ID
        ]);
    });

    after(async () => {
        await pool.end();
        const adminPool = new pg.Pool({ ...dbConfig });
        try {
            await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
        } finally {
            await adminPool.end();
        }
    });

    it("applies, seeds the permission without granting it, and doesn't recreate the role", async () => {
        await runMigrationSql(pool, false, 2.6, BASELINE_VERSION);
        const permission = await pool.query(
            `SELECT id FROM permissions WHERE id = $1`,
            ["00000000-3838-4100-8000-000000000004"]
        );
        expect(permission.rows).to.have.lengthOf(1);
        const grants = await pool.query(
            `SELECT 1 FROM role_permissions WHERE permission_id = $1`,
            ["00000000-3838-4100-8000-000000000004"]
        );
        expect(grants.rows).to.have.lengthOf(0);
        const role = await pool.query(`SELECT 1 FROM roles WHERE id = $1`, [
            WORKSPACE_USERS_ROLE_ID
        ]);
        expect(role.rows).to.have.lengthOf(0);
        // the managers role is still created and granted
        const managers = await pool.query(
            `SELECT count(*)::int AS n FROM role_permissions WHERE role_id = $1`,
            [MANAGERS_ROLE_ID]
        );
        expect(managers.rows[0].n).to.equal(3);
    });
});

const ORG_UNIT_READ_PERMISSION_ID = "00000000-3838-4100-8000-000000000005";

async function createTestDb(prefix: string) {
    const dbConfig = getTestDBConfig();
    const name = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const adminPool = new pg.Pool({ ...dbConfig });
    await adminPool.query(`CREATE DATABASE "${name}"`);
    await adminPool.end();
    return { name, pool: new pg.Pool({ ...dbConfig, database: name }) };
}

async function dropTestDb(name: string, pool: pg.Pool) {
    await pool.end();
    const adminPool = new pg.Pool({ ...getTestDBConfig() });
    try {
        await adminPool.query(`DROP DATABASE IF EXISTS "${name}"`);
    } finally {
        await adminPool.end();
    }
}

describe("LLM Profile Managers org unit read migration (V2_7)", function (this: Mocha.Suite) {
    this.timeout(30000);
    let db: { name: string; pool: pg.Pool };
    let before26: any[];

    before(async () => {
        db = await createTestDb("test_llm_org_unit_read");
        await runMigrationSql(db.pool, false, 2.6);
        before26 = (
            await db.pool.query(
                `SELECT role_id, permission_id FROM role_permissions
                  WHERE role_id <> $1 ORDER BY role_id, permission_id`,
                [MANAGERS_ROLE_ID]
            )
        ).rows;
        await runMigrationSql(db.pool, false, 2.7, 2.6);
    });

    after(async () => dropTestDb(db.name, db.pool));

    it("seeds an unconstrained, read-only org unit permission", async () => {
        const permission = (
            await db.pool.query(
                `SELECT p.*, r.uri AS resource FROM permissions p
                   JOIN resources r ON r.id = p.resource_id WHERE p.id = $1`,
                [ORG_UNIT_READ_PERMISSION_ID]
            )
        ).rows[0];
        expect(permission.resource).to.equal("authObject/orgUnit");
        expect(permission.user_ownership_constraint).to.equal(false);
        expect(permission.org_unit_ownership_constraint).to.equal(false);
        expect(permission.pre_authorised_constraint).to.equal(false);
        expect(permission.allow_exemption).to.equal(false);
        const operations = (
            await db.pool.query(
                `SELECT o.uri FROM permission_operations po
                   JOIN operations o ON o.id = po.operation_id
                  WHERE po.permission_id = $1`,
                [ORG_UNIT_READ_PERMISSION_ID]
            )
        ).rows.map((r) => r.uri);
        expect(operations).to.deep.equal(["authObject/orgUnit/read"]);
    });

    it("grants it to LLM Profile Managers, whose only authObject operation is org unit read", async () => {
        const grants = (
            await db.pool.query(
                `SELECT permission_id FROM role_permissions WHERE role_id = $1 ORDER BY permission_id`,
                [MANAGERS_ROLE_ID]
            )
        ).rows.map((r) => r.permission_id);
        expect(grants).to.deep.equal([
            "00000000-3838-4100-8000-000000000001",
            "00000000-3838-4100-8000-000000000002",
            "00000000-3838-4100-8000-000000000003",
            ORG_UNIT_READ_PERMISSION_ID
        ]);
        const authObjectOperations = (
            await db.pool.query(
                `SELECT DISTINCT o.uri FROM role_permissions rp
                   JOIN permission_operations po ON po.permission_id = rp.permission_id
                   JOIN operations o ON o.id = po.operation_id
                  WHERE rp.role_id = $1 AND o.uri LIKE 'authObject/%'`,
                [MANAGERS_ROLE_ID]
            )
        ).rows.map((r) => r.uri);
        expect(authObjectOperations).to.deep.equal(["authObject/orgUnit/read"]);
    });

    it("leaves every other role unchanged", async () => {
        const after = (
            await db.pool.query(
                `SELECT role_id, permission_id FROM role_permissions
                  WHERE role_id <> $1 ORDER BY role_id, permission_id`,
                [MANAGERS_ROLE_ID]
            )
        ).rows;
        expect(after).to.deep.equal(before26);
    });
});

describe("LLM Profile Managers org unit read migration (V2_7) when the role was deleted", function (this: Mocha.Suite) {
    this.timeout(30000);
    let db: { name: string; pool: pg.Pool };

    before(async () => {
        db = await createTestDb("test_llm_org_unit_read_norole");
        await runMigrationSql(db.pool, false, 2.6);
        await db.pool.query(`DELETE FROM role_permissions WHERE role_id = $1`, [
            MANAGERS_ROLE_ID
        ]);
        await db.pool.query(`DELETE FROM roles WHERE id = $1`, [
            MANAGERS_ROLE_ID
        ]);
    });

    after(async () => dropTestDb(db.name, db.pool));

    it("applies, seeds the permission without granting it, and doesn't recreate the role", async () => {
        await runMigrationSql(db.pool, false, 2.7, 2.6);
        const permission = await db.pool.query(
            `SELECT 1 FROM permissions WHERE id = $1`,
            [ORG_UNIT_READ_PERMISSION_ID]
        );
        expect(permission.rows).to.have.lengthOf(1);
        const grants = await db.pool.query(
            `SELECT 1 FROM role_permissions WHERE permission_id = $1`,
            [ORG_UNIT_READ_PERMISSION_ID]
        );
        expect(grants.rows).to.have.lengthOf(0);
        const role = await db.pool.query(`SELECT 1 FROM roles WHERE id = $1`, [
            MANAGERS_ROLE_ID
        ]);
        expect(role.rows).to.have.lengthOf(0);
    });
});
