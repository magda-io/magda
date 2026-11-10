import "mocha";
import pg from "pg";
import { expect } from "chai";
import express from "express";
import request from "supertest";
import nock from "nock";
import createMockAuthDecisionQueryClient from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient.js";
import { UnconditionalTrueDecision } from "@magda/typescript-common/dist/opa/AuthDecision.js";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import getTestDBConfig from "./getTestDBConfig.js";
import runMigrationSql from "./runMigrationSql.js";
import Database from "../Database.js";
import createAccessGroupApiRouter from "../apiRouters/createAccessGroupApiRouter.js";

// The last migration before typed access group management.
const BASELINE_VERSION = 2.4;

const MANAGERS_ROLE_ID = "00000000-3854-4200-8000-000000000003";
const MANAGERS_PERMISSION_ID = "00000000-3854-4100-8000-000000000010";

const GROUP_ID = "00000000-0000-4000-8000-0000000000d1";
const MEMBER_ROLE_ID = "00000000-0000-4000-8000-0000000000e1";
const GROUP_PERMISSION_ID = "00000000-0000-4000-8000-0000000000e2";
const RECORD_READ_CONTROL_ID = "00000000-0000-4000-8000-0000000000e3";
const UI_CONTROL_ID = "00000000-0000-4000-8000-0000000000e4";
const UNRELATED_PERMISSION_ID = "00000000-0000-4000-8000-0000000000e5";
const MEMBER_USER_ID = "00000000-0000-4000-8000-0000000000f1";

// Lookalikes of the access group API's member-role permissions that V2_5 must leave unchanged.
const OTHER_GROUP_ID = "00000000-0000-4000-8000-0000000000d2";
const OTHER_GROUP_ROLE_ID = "00000000-0000-4000-8000-0000000000e6";
// a record-read lookalike held by no role
const ORPHAN_RECORD_READ_GROUP_ID = "00000000-0000-4000-8000-0000000000d3";
const ORPHAN_RECORD_READ_ID = "00000000-0000-4000-8000-0000000000e7";
// a record-read lookalike held by a role whose description names another group
const MISMATCHED_RECORD_READ_GROUP_ID = "00000000-0000-4000-8000-0000000000d4";
const MISMATCHED_RECORD_READ_ID = "00000000-0000-4000-8000-0000000000e8";
// a record-read lookalike with an extra operation, held by its group's member role
const WIDER_GROUP_ID = "00000000-0000-4000-8000-0000000000d5";
const WIDER_GROUP_ROLE_ID = "00000000-0000-4000-8000-0000000000e9";
const WIDER_RECORD_READ_ID = "00000000-0000-4000-8000-0000000000ea";
// a UI lookalike held by a role whose description names another group
const MISMATCHED_UI_GROUP_ID = "00000000-0000-4000-8000-0000000000d6";
const MISMATCHED_UI_ID = "00000000-0000-4000-8000-0000000000eb";

// A record group created by the access group API before V2_5, deleted through the API after it.
const LEGACY_GROUP_ID = "00000000-0000-4000-8000-0000000000d7";
const LEGACY_ROLE_ID = "00000000-0000-4000-8000-0000000000ec";
const LEGACY_GROUP_PERMISSION_ID = "00000000-0000-4000-8000-0000000000ed";
const LEGACY_RECORD_READ_ID = "00000000-0000-4000-8000-0000000000ee";
const LEGACY_UI_ID = "00000000-0000-4000-8000-0000000000ef";

const REGISTRY_BASE_URL = "http://localhost:6101/v0";

describe("Access Group Management migration (V2_5)", function (this: Mocha.Suite) {
    this.timeout(30000);
    const dbConfig = getTestDBConfig();
    const testDbName = `test_access_group_management_${Date.now()}_${Math.floor(
        Math.random() * 1e6
    )}`;
    let pool: pg.Pool;

    async function permissionOperations(permissionId: string) {
        return (
            await pool.query(
                `SELECT o.uri FROM permission_operations po
                   JOIN operations o ON o.id = po.operation_id
                  WHERE po.permission_id = $1 ORDER BY o.uri`,
                [permissionId]
            )
        ).rows.map((r) => r.uri as string);
    }

    async function permission(permissionId: string) {
        return (
            await pool.query(
                `SELECT p.*, r.uri AS resource_uri FROM permissions p
                   JOIN resources r ON r.id = p.resource_id
                  WHERE p.id = $1`,
                [permissionId]
            )
        ).rows[0];
    }

    async function roleLinks(permissionId: string) {
        return (
            await pool.query(
                `SELECT role_id FROM role_permissions WHERE permission_id = $1 ORDER BY role_id`,
                [permissionId]
            )
        ).rows.map((r) => r.role_id as string);
    }

    async function seedPermission(
        id: string,
        name: string,
        description: string,
        resourceUri: string,
        operationUris: string | string[],
        preAuthorised: boolean
    ) {
        await pool.query(
            `INSERT INTO permissions (id, name, resource_id, user_ownership_constraint, org_unit_ownership_constraint,
                                      pre_authorised_constraint, allow_exemption, description)
             VALUES ($1, $2, (SELECT id FROM resources WHERE uri = $3), false, false, $4, false, $5)`,
            [id, name, resourceUri, preAuthorised, description]
        );
        for (const operationUri of ([] as string[]).concat(operationUris)) {
            await pool.query(
                `INSERT INTO permission_operations (permission_id, operation_id)
                 VALUES ($1, (SELECT id FROM operations WHERE uri = $2))`,
                [id, operationUri]
            );
        }
    }

    async function seedMemberRole(roleId: string, groupId: string) {
        await pool.query(
            `INSERT INTO roles (id, name, description) VALUES ($1, 'auto-created for access group', $2)`,
            [roleId, `auto-created for access group ${groupId}`]
        );
    }

    async function grant(roleId: string, permissionId: string) {
        await pool.query(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`,
            [roleId, permissionId]
        );
    }

    const recordReadDescription = (groupId: string) =>
        `Auto-created access group record permission for access group ${groupId}.`;
    const uiDescription = (groupId: string) =>
        `Auto-created access group UI permission for access group ${groupId}.`;

    before(async () => {
        const adminPool = new pg.Pool({ ...dbConfig });
        await adminPool.query(`CREATE DATABASE "${testDbName}"`);
        await adminPool.end();
        pool = new pg.Pool({ ...dbConfig, database: testDbName });

        await runMigrationSql(pool, false, BASELINE_VERSION);

        // A record access group's member role, as the access group API created it before V2_5.
        await seedMemberRole(MEMBER_ROLE_ID, GROUP_ID);
        await seedPermission(
            GROUP_PERMISSION_ID,
            "auto-created for access group",
            `auto-created for access group ${GROUP_ID}`,
            "object/record",
            "object/record/read",
            true
        );
        await seedPermission(
            RECORD_READ_CONTROL_ID,
            "System managed for access group",
            recordReadDescription(GROUP_ID),
            "object/record",
            "object/record/read",
            true
        );
        await seedPermission(
            UI_CONTROL_ID,
            "System managed for access group",
            uiDescription(GROUP_ID),
            "object/accessGroup",
            "object/accessGroup/read",
            false
        );
        await seedPermission(
            UNRELATED_PERMISSION_ID,
            "Some other pre-authorised read",
            "Not created by the access group API.",
            "object/record",
            "object/record/read",
            true
        );
        await pool.query(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2), ($1, $3), ($1, $4)`,
            [
                MEMBER_ROLE_ID,
                GROUP_PERMISSION_ID,
                RECORD_READ_CONTROL_ID,
                UI_CONTROL_ID
            ]
        );
        const memberUserSourceId = `member-${Date.now()}`;
        await pool.query(
            `INSERT INTO users (id, "displayName", email, source, "sourceId") VALUES ($1, 'Member', 'member@example.com', 'internal', $2)`,
            [MEMBER_USER_ID, memberUserSourceId]
        );
        await pool.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
            [MEMBER_USER_ID, MEMBER_ROLE_ID]
        );

        await seedMemberRole(OTHER_GROUP_ROLE_ID, OTHER_GROUP_ID);
        await seedPermission(
            ORPHAN_RECORD_READ_ID,
            "System managed for access group",
            recordReadDescription(ORPHAN_RECORD_READ_GROUP_ID),
            "object/record",
            "object/record/read",
            true
        );
        await seedPermission(
            MISMATCHED_RECORD_READ_ID,
            "System managed for access group",
            recordReadDescription(MISMATCHED_RECORD_READ_GROUP_ID),
            "object/record",
            "object/record/read",
            true
        );
        await grant(OTHER_GROUP_ROLE_ID, MISMATCHED_RECORD_READ_ID);
        await seedMemberRole(WIDER_GROUP_ROLE_ID, WIDER_GROUP_ID);
        await seedPermission(
            WIDER_RECORD_READ_ID,
            "System managed for access group",
            recordReadDescription(WIDER_GROUP_ID),
            "object/record",
            ["object/record/read", "object/record/update"],
            true
        );
        await grant(WIDER_GROUP_ROLE_ID, WIDER_RECORD_READ_ID);
        await seedPermission(
            MISMATCHED_UI_ID,
            "System managed for access group",
            uiDescription(MISMATCHED_UI_GROUP_ID),
            "object/accessGroup",
            "object/accessGroup/read",
            false
        );
        await grant(OTHER_GROUP_ROLE_ID, MISMATCHED_UI_ID);

        await seedMemberRole(LEGACY_ROLE_ID, LEGACY_GROUP_ID);
        await seedPermission(
            LEGACY_GROUP_PERMISSION_ID,
            "auto-created for access group",
            `auto-created for access group ${LEGACY_GROUP_ID}`,
            "object/record",
            "object/record/read",
            true
        );
        await seedPermission(
            LEGACY_RECORD_READ_ID,
            "System managed for access group",
            recordReadDescription(LEGACY_GROUP_ID),
            "object/record",
            "object/record/read",
            true
        );
        await seedPermission(
            LEGACY_UI_ID,
            "System managed for access group",
            uiDescription(LEGACY_GROUP_ID),
            "object/accessGroup",
            "object/accessGroup/read",
            false
        );
        for (const permissionId of [
            LEGACY_GROUP_PERMISSION_ID,
            LEGACY_RECORD_READ_ID,
            LEGACY_UI_ID
        ]) {
            await grant(LEGACY_ROLE_ID, permissionId);
        }

        await runMigrationSql(pool, false, Infinity, BASELINE_VERSION);
    });

    after(async () => {
        if (pool) {
            await pool.end();
        }
        const adminPool = new pg.Pool({ ...dbConfig });
        await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
        await adminPool.end();
    });

    it("converts the member role's record-read permission to a pre-authorised object/accessGroup/read, keeping its ID", async () => {
        const p = await permission(RECORD_READ_CONTROL_ID);
        expect(p.resource_uri).to.equal("object/accessGroup");
        expect(p.pre_authorised_constraint).to.equal(true);
        expect(p.user_ownership_constraint).to.equal(false);
        expect(p.org_unit_ownership_constraint).to.equal(false);
        expect(
            await permissionOperations(RECORD_READ_CONTROL_ID)
        ).to.deep.equal(["object/accessGroup/read"]);
        const links = await pool.query(
            `SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
            [MEMBER_ROLE_ID, RECORD_READ_CONTROL_ID]
        );
        expect(links.rowCount).to.equal(1);
    });

    it("removes the member role's unconstrained UI permission and its role link", async () => {
        expect(await permission(UI_CONTROL_ID)).to.equal(undefined);
        const links = await pool.query(
            `SELECT 1 FROM role_permissions WHERE permission_id = $1`,
            [UI_CONTROL_ID]
        );
        expect(links.rowCount).to.equal(0);
    });

    it("leaves the group permission, unrelated permissions and memberships unchanged", async () => {
        expect(await permissionOperations(GROUP_PERMISSION_ID)).to.deep.equal([
            "object/record/read"
        ]);
        expect(
            (await permission(UNRELATED_PERMISSION_ID)).resource_uri
        ).to.equal("object/record");
        expect(
            await permissionOperations(UNRELATED_PERMISSION_ID)
        ).to.deep.equal(["object/record/read"]);
        const member = await pool.query(
            `SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2`,
            [MEMBER_USER_ID, MEMBER_ROLE_ID]
        );
        expect(member.rowCount).to.equal(1);
    });

    describe("leaves lookalikes of the member-role permissions unchanged", () => {
        async function expectUnchanged(
            permissionId: string,
            resourceUri: string,
            operationUris: string[],
            roleIds: string[]
        ) {
            expect((await permission(permissionId)).resource_uri).to.equal(
                resourceUri
            );
            expect(await permissionOperations(permissionId)).to.deep.equal(
                operationUris
            );
            expect(await roleLinks(permissionId)).to.deep.equal(roleIds);
        }

        it("a record-read permission held by no role", async () => {
            await expectUnchanged(
                ORPHAN_RECORD_READ_ID,
                "object/record",
                ["object/record/read"],
                []
            );
        });

        it("a record-read permission held by a role whose description names another group", async () => {
            await expectUnchanged(
                MISMATCHED_RECORD_READ_ID,
                "object/record",
                ["object/record/read"],
                [OTHER_GROUP_ROLE_ID]
            );
        });

        it("a record-read permission with an extra operation, held by its group's member role", async () => {
            await expectUnchanged(
                WIDER_RECORD_READ_ID,
                "object/record",
                ["object/record/read", "object/record/update"],
                [WIDER_GROUP_ROLE_ID]
            );
        });

        it("a UI permission held by a role whose description names another group", async () => {
            await expectUnchanged(
                MISMATCHED_UI_ID,
                "object/accessGroup",
                ["object/accessGroup/read"],
                [OTHER_GROUP_ROLE_ID]
            );
        });
    });

    describe("a record group created before V2_5", () => {
        let database: Database;

        before(() => {
            // `Database` connects to the `auth` database: point it at the test database instead.
            database = new Database({ dbHost: dbConfig.host, dbPort: 5432 });
            const unusedPool = database.getPool();
            (database as any).pool = pool;
            return unusedPool.end();
        });

        afterEach(() => {
            nock.cleanAll();
            nock.enableNetConnect();
        });

        // The group record as the access group API created it before V2_5: it still lists both control
        // permission IDs, although V2_5 removed the UI permission.
        function legacyGroupRecord(extraControlPermissionIds: string[]) {
            return {
                id: LEGACY_GROUP_ID,
                name: "Legacy group",
                aspects: {
                    "access-group-details": {
                        name: "Legacy group",
                        resourceUri: "object/record",
                        operationUris: ["object/record/read"],
                        permissionId: LEGACY_GROUP_PERMISSION_ID,
                        roleId: LEGACY_ROLE_ID,
                        extraControlPermissionIds
                    },
                    "access-control": {
                        ownerId: null as string | null,
                        orgUnitId: null as string | null,
                        preAuthorisedPermissionIds: [LEGACY_RECORD_READ_ID]
                    }
                }
            };
        }

        // Deletes the group through the access group API, with the registry returning `groupRecord` and no
        // dataset listing the group permission.
        async function deleteGroup(groupRecord: any) {
            nock.disableNetConnect();
            nock.enableNetConnect("127.0.0.1");
            let deleted = false;
            nock(REGISTRY_BASE_URL)
                .get(`/records/inFull/${LEGACY_GROUP_ID}`)
                .reply(200, groupRecord)
                .get("/records")
                .query(true)
                .reply(200, { records: [], hasMore: false })
                .delete(`/records/${LEGACY_GROUP_ID}`)
                .reply(200, () => {
                    deleted = true;
                    return { deleted: true };
                });

            const app = express();
            app.use(express.json());
            app.use(
                "/v0/auth/accessGroups",
                createAccessGroupApiRouter({
                    jwtSecret: "squirrel",
                    database,
                    authDecisionClient: createMockAuthDecisionQueryClient(
                        async () => UnconditionalTrueDecision
                    ),
                    registryClient: new AuthorizedRegistryClient({
                        baseUrl: REGISTRY_BASE_URL,
                        jwtSecret: "squirrel",
                        userId: "test-user-id",
                        tenantId: 0,
                        maxRetries: 0
                    })
                })
            );
            const res = await request(app).delete(
                `/v0/auth/accessGroups/${LEGACY_GROUP_ID}`
            );
            return { res, deleted };
        }

        async function existingPermissions(ids: string[]) {
            return (
                await pool.query(
                    `SELECT id FROM permissions WHERE id = ANY($1::uuid[]) ORDER BY id`,
                    [ids]
                )
            ).rows.map((r) => r.id as string);
        }

        it("isn't deleted when it lists a control permission that isn't its own", async () => {
            const { res, deleted } = await deleteGroup(
                legacyGroupRecord([
                    LEGACY_RECORD_READ_ID,
                    LEGACY_UI_ID,
                    UNRELATED_PERMISSION_ID
                ])
            );
            expect(res.status).to.equal(400);
            expect(deleted).to.be.false;
            expect(
                await existingPermissions([
                    LEGACY_GROUP_PERMISSION_ID,
                    LEGACY_RECORD_READ_ID,
                    UNRELATED_PERMISSION_ID
                ])
            ).to.have.members([
                LEGACY_GROUP_PERMISSION_ID,
                LEGACY_RECORD_READ_ID,
                UNRELATED_PERMISSION_ID
            ]);
        });

        it("can still be deleted through the access group API once its datasets are removed", async () => {
            const { res, deleted } = await deleteGroup(
                legacyGroupRecord([LEGACY_RECORD_READ_ID, LEGACY_UI_ID])
            );
            expect(res.status, JSON.stringify(res.body)).to.equal(200);
            expect(deleted).to.be.true;
            const roles = await pool.query(
                `SELECT 1 FROM roles WHERE id = $1`,
                [LEGACY_ROLE_ID]
            );
            expect(roles.rowCount).to.equal(0);
            expect(
                await existingPermissions([
                    LEGACY_GROUP_PERMISSION_ID,
                    LEGACY_RECORD_READ_ID,
                    LEGACY_UI_ID
                ])
            ).to.deep.equal([]);
        });
    });

    it("registers update and delete operations", async () => {
        const ops = (
            await pool.query(
                `SELECT o.uri FROM operations o JOIN resources r ON r.id = o.resource_id
                  WHERE r.uri = 'object/accessGroup' ORDER BY o.uri`
            )
        ).rows.map((r) => r.uri);
        expect(ops).to.deep.equal([
            "object/accessGroup/create",
            "object/accessGroup/delete",
            "object/accessGroup/read",
            "object/accessGroup/update"
        ]);
    });

    it("creates Access Group Managers with owner-constrained create, read, update and delete only", async () => {
        const role = (
            await pool.query(`SELECT * FROM roles WHERE id = $1`, [
                MANAGERS_ROLE_ID
            ])
        ).rows[0];
        expect(role.name).to.equal("Access Group Managers");
        const grants = (
            await pool.query(
                `SELECT permission_id FROM role_permissions WHERE role_id = $1`,
                [MANAGERS_ROLE_ID]
            )
        ).rows.map((r) => r.permission_id);
        expect(grants).to.deep.equal([MANAGERS_PERMISSION_ID]);
        const p = await permission(MANAGERS_PERMISSION_ID);
        expect(p.resource_uri).to.equal("object/accessGroup");
        expect(p.user_ownership_constraint).to.equal(true);
        expect(p.org_unit_ownership_constraint).to.equal(false);
        expect(p.pre_authorised_constraint).to.equal(false);
        expect(p.allow_exemption).to.equal(false);
        expect(
            await permissionOperations(MANAGERS_PERMISSION_ID)
        ).to.deep.equal([
            "object/accessGroup/create",
            "object/accessGroup/delete",
            "object/accessGroup/read",
            "object/accessGroup/update"
        ]);
    });

    it("assigns the role to nobody", async () => {
        const users = await pool.query(
            `SELECT 1 FROM user_roles WHERE role_id = $1`,
            [MANAGERS_ROLE_ID]
        );
        expect(users.rowCount).to.equal(0);
    });
});
