import "mocha";
import pg from "pg";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { expect } from "chai";
import getTestDBConfig from "./getTestDBConfig.js";
import runMigrationSql from "./runMigrationSql.js";
import Database from "../Database.js";
import NestedSetModelQueryer from "../NestedSetModelQueryer.js";
import createPermissionApiRouter from "../apiRouters/createPermissionApiRouter.js";
import createMockAuthDecisionQueryClient from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient.js";
import AuthDecision, {
    UnconditionalTrueDecision,
    UnconditionalFalseDecision
} from "magda-typescript-common/src/opa/AuthDecision.js";
import { AuthDecisionReqConfig } from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";

// Auth API support for LLM access profiles (#3838): org unit ancestors in the
// decision input (AUTHAPI-3), the roles holding a permission (AUTHAPI-1) and
// deleting a permission together with its role links (AUTHAPI-2).
describe("Auth API support for LLM access profiles (integration)", function (this: Mocha.Suite) {
    this.timeout(30000);
    const jwtSecret = "test-jwt-secret";
    const dbConfig = getTestDBConfig();
    const testDbName = `test_llm_access_profiles_${Date.now()}_${Math.floor(
        Math.random() * 1e6
    )}`;
    let pool: pg.Pool;
    let database: Database;
    let orgQueryer: NestedSetModelQueryer;

    before(async () => {
        const adminPool = new pg.Pool({ ...dbConfig });
        await adminPool.query(`CREATE DATABASE "${testDbName}"`);
        await adminPool.end();
        pool = new pg.Pool({ ...dbConfig, database: testDbName });
        await runMigrationSql(pool);

        database = new Database({ dbHost: dbConfig.host, dbPort: 5432 });
        const throwawayPool = database.getPool();
        (database as any).pool = pool;
        orgQueryer = new NestedSetModelQueryer(pool, "org_units", [
            "id",
            "name",
            "description",
            "left",
            "right"
        ]);
        (database as any).orgQueryer = orgQueryer;
        await throwawayPool.end();
    });

    after(async () => {
        if (pool) {
            await pool.end();
        }
        const adminPool = new pg.Pool({ ...dbConfig });
        try {
            await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
        } finally {
            await adminPool.end();
        }
    });

    function sessionRequest(userId: string) {
        const token = jwt.sign({ userId }, jwtSecret);
        return {
            header: (name: string) =>
                name.toLowerCase() === "x-magda-session" ? token : undefined
        };
    }

    async function createUser(name: string, orgUnitId?: string) {
        const user = await database.createUser({
            displayName: name,
            email: `${name}@example.com`,
            photoURL: "",
            source: "test",
            sourceId: `${name}-${Date.now()}-${Math.random()}`,
            ...(orgUnitId ? { orgUnitId } : {})
        } as any);
        return user.id;
    }

    async function createPermission(name: string) {
        const permission = await database.createPermission({
            name,
            description: "",
            resourceUri: "llm/access",
            operationUris: ["llm/access/invoke"],
            userOwnershipConstraint: false,
            orgUnitOwnershipConstraint: false,
            preAuthorisedConstraint: true
        } as any);
        return permission.id as string;
    }

    async function createRole(name: string, permissionIds: string[] = []) {
        const role = (
            await pool.query(
                `INSERT INTO roles (name, description) VALUES ($1, '') RETURNING id`,
                [name]
            )
        ).rows[0];
        for (const permissionId of permissionIds) {
            await pool.query(
                `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`,
                [role.id, permissionId]
            );
        }
        return role.id as string;
    }

    describe("orgUnitAncestorIds (AUTHAPI-3)", () => {
        // Corporate › Finance › Payroll, plus Corporate › Sales
        let corporate: string;
        let finance: string;
        let payroll: string;
        let sales: string;

        let rootId: string;

        before(async () => {
            rootId = (await orgQueryer.getRootNode()).valueOr(null)?.id;
            if (!rootId) {
                rootId = await orgQueryer.createRootNode({ name: "Root" });
            }
            corporate = await orgQueryer.insertNode(rootId, {
                name: "Corporate"
            });
            finance = await orgQueryer.insertNode(corporate, {
                name: "Finance"
            });
            payroll = await orgQueryer.insertNode(finance, { name: "Payroll" });
            sales = await orgQueryer.insertNode(corporate, { name: "Sales" });
        });

        it("lists a leaf org unit user's own unit and every ancestor", async () => {
            const userId = await createUser("payroll-user", payroll);
            const user = await database.getCurrentUserInfo(
                sessionRequest(userId),
                jwtSecret
            );
            expect(user.orgUnitAncestorIds).to.have.members([
                payroll,
                finance,
                corporate,
                rootId
            ]);
            expect(user.orgUnitAncestorIds).not.to.include(sales);
            // the management scope is unchanged: own unit and below
            expect(user.managingOrgUnitIds).to.have.members([payroll]);
        });

        it("doesn't list descendant or sibling org units", async () => {
            const userId = await createUser("finance-user", finance);
            const user = await database.getCurrentUserInfo(
                sessionRequest(userId),
                jwtSecret
            );
            expect(user.orgUnitAncestorIds).to.include(finance);
            expect(user.orgUnitAncestorIds).to.include(corporate);
            expect(user.orgUnitAncestorIds).not.to.include(payroll);
            expect(user.orgUnitAncestorIds).not.to.include(sales);
            expect(user.managingOrgUnitIds).to.have.members([finance, payroll]);
        });

        it("lists only the root for a user in the root org unit", async () => {
            const userId = await createUser("root-user", rootId);
            const user = await database.getCurrentUserInfo(
                sessionRequest(userId),
                jwtSecret
            );
            expect(user.orgUnitAncestorIds).to.deep.equal([rootId]);
        });

        it("is empty for a user without an org unit, and for anonymous users", async () => {
            const userId = await createUser("no-org-unit-user");
            const user = await database.getCurrentUserInfo(
                sessionRequest(userId),
                jwtSecret
            );
            expect(user.orgUnitAncestorIds).to.deep.equal([]);

            const anonymous = await database.getCurrentUserInfo(
                { header: (): string | undefined => undefined },
                jwtSecret
            );
            expect(anonymous.orgUnitAncestorIds).to.deep.equal([]);
        });
    });

    describe("permission roles and delete with role links (AUTHAPI-1, AUTHAPI-2)", () => {
        it("lists no, one or many roles holding a permission, ordered by name and paginated", async () => {
            const unassigned = await createPermission("unassigned");
            expect(await database.getPermissionRoles(unassigned)).to.deep.equal(
                []
            );

            const single = await createPermission("single");
            const singleRole = await createRole("single role", [single]);
            expect(
                (await database.getPermissionRoles(single)).map((r) => r.id)
            ).to.deep.equal([singleRole]);

            const many = await createPermission("many");
            const b = await createRole("role b", [many]);
            const a = await createRole("role a", [many]);
            const c = await createRole("role c", [many]);
            expect(
                (await database.getPermissionRoles(many)).map((r) => r.id)
            ).to.deep.equal([a, b, c]);
            expect(
                (await database.getPermissionRoles(many, 1, 1)).map((r) => r.id)
            ).to.deep.equal([b]);
        });

        it("deletes a held permission and every role link, keeping roles, users and other permissions", async () => {
            const target = await createPermission("target");
            const other = await createPermission("other");
            const roleA = await createRole("delete role a", [target, other]);
            const roleB = await createRole("delete role b", [target]);
            const userId = await createUser("role-holder");
            await pool.query(
                `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
                [userId, roleB]
            );

            // the existing delete still refuses a held permission
            let refused = false;
            try {
                await database.deletePermission(target);
            } catch (e) {
                refused = true;
            }
            expect(refused).to.equal(true);

            expect(
                await database.deletePermissionAndRoleLinks(target)
            ).to.equal(true);

            const permissionRows = await pool.query(
                `SELECT id FROM permissions WHERE id = $1`,
                [target]
            );
            expect(permissionRows.rows).to.have.lengthOf(0);
            const linkRows = await pool.query(
                `SELECT 1 FROM role_permissions WHERE permission_id = $1`,
                [target]
            );
            expect(linkRows.rows).to.have.lengthOf(0);
            const opRows = await pool.query(
                `SELECT 1 FROM permission_operations WHERE permission_id = $1`,
                [target]
            );
            expect(opRows.rows).to.have.lengthOf(0);

            const roles = await pool.query(
                `SELECT id FROM roles WHERE id = ANY($1::uuid[])`,
                [[roleA, roleB]]
            );
            expect(roles.rows).to.have.lengthOf(2);
            const remaining = await pool.query(
                `SELECT permission_id FROM role_permissions WHERE role_id = $1`,
                [roleA]
            );
            expect(remaining.rows.map((r) => r.permission_id)).to.deep.equal([
                other
            ]);
            const userRoles = await pool.query(
                `SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2`,
                [userId, roleB]
            );
            expect(userRoles.rows).to.have.lengthOf(1);
        });

        it("returns false for a missing permission, so retries are idempotent", async () => {
            const permission = await createPermission("twice");
            expect(
                await database.deletePermissionAndRoleLinks(permission)
            ).to.equal(true);
            expect(
                await database.deletePermissionAndRoleLinks(permission)
            ).to.equal(false);
        });
    });

    describe("permission API routes", () => {
        function buildApp(
            decide: (config: AuthDecisionReqConfig) => boolean = () => true
        ) {
            const app = express();
            app.use(express.json());
            app.use(
                "/v0/auth/permissions",
                createPermissionApiRouter({
                    database,
                    jwtSecret,
                    authDecisionClient: createMockAuthDecisionQueryClient(
                        async (config): Promise<AuthDecision> =>
                            decide(config)
                                ? UnconditionalTrueDecision
                                : UnconditionalFalseDecision
                    )
                })
            );
            return app;
        }

        it("GET /:permissionId/roles returns the roles holding the permission", async () => {
            const permission = await createPermission("route list");
            const role = await createRole("route list role", [permission]);
            const res = await request(buildApp()).get(
                `/v0/auth/permissions/${permission}/roles`
            );
            expect(res.status).to.equal(200);
            expect(res.body.map((r: any) => r.id)).to.deep.equal([role]);
            expect(res.body[0]).to.have.keys(["id", "name", "description"]);
        });

        it("GET /:permissionId/roles requires authObject/permission/read", async () => {
            const permission = await createPermission("route list denied");
            const res = await request(
                buildApp(
                    (config) =>
                        config.operationUri !== "authObject/permission/read"
                )
            ).get(`/v0/auth/permissions/${permission}/roles`);
            expect(res.status).to.equal(403);
        });

        it("DELETE ?removeFromRoles=true removes a held permission", async () => {
            const permission = await createPermission("route delete");
            await createRole("route delete role", [permission]);
            const res = await request(buildApp()).delete(
                `/v0/auth/permissions/${permission}?removeFromRoles=true`
            );
            expect(res.status).to.equal(200);
            expect(res.body).to.deep.equal({ result: true });
            expect(await database.getPermissionRoles(permission)).to.deep.equal(
                []
            );
        });

        it("DELETE ?removeFromRoles=true also requires authObject/role/update", async () => {
            const permission = await createPermission("route delete denied");
            await createRole("route delete denied role", [permission]);
            const res = await request(
                buildApp(
                    (config) => config.operationUri !== "authObject/role/update"
                )
            ).delete(`/v0/auth/permissions/${permission}?removeFromRoles=true`);
            expect(res.status).to.equal(403);
            expect(
                await database.getPermissionRoles(permission)
            ).to.have.lengthOf(1);
        });

        it("DELETE without removeFromRoles still refuses a held permission", async () => {
            const permission = await createPermission("route delete plain");
            await createRole("route delete plain role", [permission]);
            const res = await request(buildApp()).delete(
                `/v0/auth/permissions/${permission}`
            );
            expect(res.status).to.equal(400);
            expect(
                await database.getPermissionRoles(permission)
            ).to.have.lengthOf(1);
        });
    });
});
