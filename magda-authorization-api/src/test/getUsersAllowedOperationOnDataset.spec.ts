import "mocha";
import pg from "pg";
import _ from "lodash";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import getUsersAllowedOperationOnDataset from "../getUsersAllowedOperationOnDataset";
import getTestDBConfig from "./getTestDBConfig";
import runMigrationSql, { deleteAllTables } from "./runMigrationSql";

chai.use(chaiAsPromised);
const { expect } = chai;

const opaUrl = process.env["OPA_URL"]
    ? process.env["OPA_URL"]
    : "http://localhost:8181/";

describe("Test getUsersAllowedOperationOnDataset", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);
    let pool: pg.Pool = null;
    const dbConfig = getTestDBConfig();

    async function buildInitDb() {
        // --- rebuilt the schema
        console.log("runMigrationSql....");
        await runMigrationSql(pool, true);
        console.log("createTestTableWithTestData....");
        await createTestTableWithTestData();
        console.log("creating users....");
        // --- t1001 set to branch & t1002 set to branch b
        await pool.query(`INSERT INTO users (id, "displayName", "email", "source", "sourceId", "orgUnitId") VALUES 
            ('00000000-0000-1000-0001-000000000000', 't1001', 't1001@email.com', 'manual', 't1001', '00000000-0000-2000-0002-000000000000'),
            ('00000000-0000-1000-0002-000000000000', 't1002', 't1002@email.com', 'manual', 't1002', '00000000-0000-2000-0003-000000000000'),
            ('00000000-0000-1000-0003-000000000000', 't1003', 't1003@email.com', 'manual', 't1003', '00000000-0000-2000-0006-000000000000');
        `);

        // --- assign default approver role to both t1001 & t1002 & t1003
        // --- please note: by default, approver can read all draft dataset (as it contains a no contraint permission)
        await pool.query(`INSERT INTO user_roles ("user_id", "role_id") VALUES 
            ('00000000-0000-1000-0001-000000000000', '14ff3f57-e8ea-4771-93af-c6ea91a798d5'),
            ('00000000-0000-1000-0002-000000000000', '14ff3f57-e8ea-4771-93af-c6ea91a798d5'),
            ('00000000-0000-1000-0003-000000000000', '14ff3f57-e8ea-4771-93af-c6ea91a798d5');
        `);
    }

    /**
     * Create orgUnits data as followings:
     *
     *         +---------+
     *         |  Dep. A |
     *         | 1     12|
     *         +----+----+
     *              |
     *     +--------+--------+
     *     |                 |
     * +----+----+       +----+----+
     * | Branch A|       | Branch B|
     * | 2     3 |       | 4     11|
     * +---------+       +----+----+
     *                        |
     *         +-------------------------+
     *         |             |            |
     *     +----+----+  +----+----+  +----+----+
     *     |Section A|  |Section B|  |Section C|
     *     | 5     6 |  | 7     8 |  | 9     10|
     *     +---------+  +---------+  +---------+
     *
     * @returns
     */
    async function createTestTableWithTestData() {
        await pool.query(`INSERT INTO "org_units" ("id", "name", "left", "right") VALUES
        ('00000000-0000-2000-0001-000000000000', 'Dep. A', 1, 12),
        ('00000000-0000-2000-0002-000000000000', 'Branch A', 2, 3),
        ('00000000-0000-2000-0003-000000000000', 'Branch B', 4, 11),
        ('00000000-0000-2000-0004-000000000000', 'Section A', 5, 6),
        ('00000000-0000-2000-0005-000000000000', 'Section B', 7, 8),
        ('00000000-0000-2000-0006-000000000000', 'Section C', 9, 10)`);
    }

    before(async function() {
        // --- you have to supply a db name to connect to pg
        pool = new pg.Pool({ ...dbConfig });
        try {
            await pool.query("CREATE database test");
        } catch (e) {
            // --- if database `test` already there
            // --- then mute the error
            if (e.code !== "42P04") {
                throw e;
            }
        }
        // --- end the current one & create a new one
        await pool.end();
        pool = new pg.Pool({ ...dbConfig, database: "test" });
        await buildInitDb();
    });

    after(async function() {
        if (pool) {
            await deleteAllTables(pool);
            pool.end();
            pool = null;
        }
    });

    describe("Test Default Approver Role Setup (contains permission without constraints)", async () => {
        it("Should return both users regardless dataset / orgUnit owner", async () => {
            // --- because, by default, the approver role contains a draft read permission without any constraints
            // --- anyone who has approver role should be returned from APIs
            const users = await getUsersAllowedOperationOnDataset(
                opaUrl,
                pool,
                {
                    publishingState: "draft",
                    accessControl: {
                        ownerId: "00000000-0000-1000-0001-000000000000",
                        orgUnitOwnerId: "00000000-0000-2000-0006-000000000000",
                        preAuthorisedPermissionIds: [
                            "00000000-0000-4000-0001-000000000000"
                        ]
                    }
                },
                "object/dataset/draft/read"
            );
            expect(users.length).to.equal(3);
            const userIds = users.map(user => user.id);
            expect(userIds).to.include("00000000-0000-1000-0001-000000000000");
            expect(userIds).to.include("00000000-0000-1000-0002-000000000000");
            expect(userIds).to.include("00000000-0000-1000-0003-000000000000");
        });

        it("Should not include the user without approver role", async () => {
            // --- remove approver role from t1001
            await pool.query(
                `DELETE FROM user_roles WHERE user_id = '00000000-0000-1000-0001-000000000000'`
            );
            const users = await getUsersAllowedOperationOnDataset(
                opaUrl,
                pool,
                {
                    publishingState: "draft",
                    accessControl: {
                        ownerId: "00000000-0000-1000-0001-000000000000",
                        orgUnitOwnerId: "00000000-0000-2000-0006-000000000000",
                        preAuthorisedPermissionIds: [
                            "00000000-0000-4000-0001-000000000000"
                        ]
                    }
                },
                "object/dataset/draft/read"
            );
            expect(users.length).to.equal(2);
            const userIds = users.map(user => user.id);
            expect(userIds).to.include("00000000-0000-1000-0002-000000000000");
            expect(userIds).to.include("00000000-0000-1000-0003-000000000000");
            // --- added approver role back to t1001
            await pool.query(`INSERT INTO user_roles ("user_id", "role_id") VALUES 
                ('00000000-0000-1000-0001-000000000000', '14ff3f57-e8ea-4771-93af-c6ea91a798d5');
            `);
        });
    });

    describe("Test Approver Role with Constraints", async () => {
        it("Should not include t1001 as he is not the owner nor on a parent org unit node", async () => {
            // --- remove the read draft permission record that has no constraint from Approver Role
            await pool.query(`DELETE FROM role_permissions WHERE permission_id = (
                SELECT id FROM permissions WHERE name = 'View Draft Dataset'
            ) AND role_id = (
                SELECT id FROM roles WHERE name = 'Approvers'
            )`);

            // --- Add a read draft permission with org unit constraint to approver role
            await pool.query(`INSERT INTO role_permissions ("role_id", "permission_id") VALUES 
            ((
                SELECT id FROM roles WHERE name = 'Approvers'
            ), (
                SELECT id FROM permissions WHERE name = 'View Draft Dataset (Within Org Unit)'
            ))`);

            // --- assume a dataset is created by t1003 (thus, belong to org unit: `Section C`)
            const users = await getUsersAllowedOperationOnDataset(
                opaUrl,
                pool,
                {
                    publishingState: "draft",
                    accessControl: {
                        ownerId: "00000000-0000-1000-0003-000000000000",
                        orgUnitOwnerId: "00000000-0000-2000-0006-000000000000",
                        preAuthorisedPermissionIds: [
                            "00000000-0000-4000-0001-000000000000"
                        ]
                    }
                },
                "object/dataset/draft/read"
            );
            expect(users.length).to.equal(2);
            const userIds = users.map(user => user.id);
            // --- t1001 should not be included as he is not the owner & Branch A is not parent node of `Section C`
            // --- t1002 should be included as Branch B is not parent node of `Section C`
            expect(userIds).to.include("00000000-0000-1000-0002-000000000000");
            // --- t1003 should be included as he is the owner
            expect(userIds).to.include("00000000-0000-1000-0003-000000000000");
        });

        it("Should include the user t1001 after setting up pre-authorised permission for him", async () => {
            // --- create an adhoc role for t1001
            await pool.query(`INSERT INTO roles (id, name, is_adhoc) VALUES (
                '00000000-0000-3000-0001-000000000000',
                'Adhoc role for t1001',
                true
            )`);
            // --- assign the role to t1001
            await pool.query(`INSERT INTO user_roles (role_id, user_id) VALUES (
                '00000000-0000-3000-0001-000000000000',
                '00000000-0000-1000-0001-000000000000'
            )`);

            // --- create a pre-authorised permission
            await pool.query(`INSERT INTO permissions (
                id, 
                name, 
                resource_id,
                user_ownership_constraint,
                org_unit_ownership_constraint,
                pre_authorised_constraint) VALUES (
                '00000000-0000-4000-0001-000000000000',
                'Adhoc pre-authorised permission for t1001',
                (
                    SELECT id FROM resources WHERE uri = 'object/dataset/draft'
                ),
                false,
                false,
                true
            )`);
            // --- add operation to the created permission
            await pool.query(`INSERT INTO permission_operations ( permission_id, operation_id) VALUES (
                '00000000-0000-4000-0001-000000000000',
                (SELECT id FROM operations WHERE uri = 'object/dataset/draft/read')
            )`);

            const users = await getUsersAllowedOperationOnDataset(
                opaUrl,
                pool,
                {
                    publishingState: "draft",
                    accessControl: {
                        ownerId: "00000000-0000-1000-0001-000000000000",
                        orgUnitOwnerId: "00000000-0000-2000-0006-000000000000",
                        preAuthorisedPermissionIds: [
                            "00000000-0000-4000-0001-000000000000"
                        ]
                    }
                },
                "object/dataset/draft/read"
            );
            expect(users.length).to.equal(3);
            const userIds = users.map(user => user.id);
            // --- t1001 is not the owner & Branch A is not parent node of `Section C`
            // --- t1001 is still included because of the pre-authorised permission `00000000-0000-4000-0001-000000000000`
            expect(userIds).to.include("00000000-0000-1000-0001-000000000000");
            // --- t1002 should be included as Branch B is not parent node of `Section C`
            expect(userIds).to.include("00000000-0000-1000-0002-000000000000");
            // --- t1003 should be included as he is the owner
            expect(userIds).to.include("00000000-0000-1000-0003-000000000000");
        });
    });
});
