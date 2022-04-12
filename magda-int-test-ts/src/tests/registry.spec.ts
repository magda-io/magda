import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import {
    DEFAULT_ADMIN_USER_ID,
    AUTHENTICATED_USERS_ROLE_ID,
    DATA_STEWARDS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants";
import RegistryApiClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";
import {
    OrgUnit,
    CreateUserData
} from "magda-typescript-common/src/authorization-api/model";
import { Record } from "magda-typescript-common/src/generated/registry/api";
import ServerError from "magda-typescript-common/src/ServerError";
import isUuid from "magda-typescript-common/src/util/isUuid";
import { AccessControlAspect } from "magda-typescript-common/src/registry/model";

const ENV_SETUP_TIME_OUT = 300000; // -- 5 mins
const jwtSecret = uuidV4();
const authApiClient = new AuthApiClient(
    "http://localhost:6104/v0",
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);

const getRegistryClient = (userId: string) =>
    new RegistryApiClient({
        baseUrl: "http://localhost:6101/v0",
        maxRetries: 0,
        tenantId: 0,
        jwtSecret: jwtSecret,
        userId
    });

describe("registry auth integration tests", function (this) {
    this.timeout(300000);
    const serviceRunner = new ServiceRunner();
    serviceRunner.enableRegistryApi = true;
    serviceRunner.jwtSecret = jwtSecret;
    serviceRunner.authApiDebugMode = false;

    let authenticatedUserId: string;
    let dataStewardUserId: string;

    const orgUnitRefs = {} as { [key: string]: OrgUnit };

    async function createOrgUnits() {
        /**
         * Create org unit as followings:
         *
         *         +---------+
         *         |   Root  |
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
         */

        const rootNode = await authApiClient.getRootOrgUnit();
        orgUnitRefs["Branch A"] = await authApiClient.createOrgNode(
            rootNode.id,
            {
                name: "Branch A"
            }
        );
        orgUnitRefs["Branch B"] = await authApiClient.createOrgNode(
            rootNode.id,
            {
                name: "Branch B"
            }
        );
        orgUnitRefs["Section A"] = await authApiClient.createOrgNode(
            orgUnitRefs["Branch B"].id,
            {
                name: "Section A"
            }
        );
        orgUnitRefs["Section B"] = await authApiClient.createOrgNode(
            orgUnitRefs["Branch B"].id,
            {
                name: "Section B"
            }
        );
        orgUnitRefs["Section C"] = await authApiClient.createOrgNode(
            orgUnitRefs["Branch B"].id,
            {
                name: "Section C"
            }
        );
    }

    async function createTestDatasetByUser(
        userId: string,
        record?: Record,
        accessControlAspect?: AccessControlAspect
    ) {
        const userInfo = (await authApiClient.getUser(userId)).valueOrThrow(
            new Error(`Invalid user id: ${userId}: cannot locate user info.`)
        );
        const datasetSetId = uuidV4();
        const recordData = record
            ? record
            : {
                  id: datasetSetId,
                  name: "test dataset",
                  aspects: {
                      "dataset-draft": {
                          dataset: {
                              name: "test dataset"
                          },
                          data: "{}",
                          timestamp: "2022-04-11T12:52:24.278Z"
                      },
                      publishing: {
                          state: "draft"
                      },
                      "access-control": {}
                  },
                  tenantId: 0,
                  sourceTag: "",
                  // authnReadPolicyId is deprecated and to be removed
                  authnReadPolicyId: ""
              };
        if (!recordData?.aspects) {
            recordData.aspects = {};
        }

        if (!recordData.aspects?.["access-control"]) {
            recordData.aspects["access-control"] = {};
        }

        if (accessControlAspect) {
            recordData.aspects["access-control"] = {
                ...accessControlAspect
            };
        } else {
            // when accessControlAspect is not specify, set to the user's user id & orgUnit id
            recordData.aspects["access-control"].ownerId = userId;
            if (userInfo?.orgUnitId) {
                recordData.aspects["access-control"].orgUnitId =
                    userInfo.orgUnitId;
            }
        }

        let result = await getRegistryClient(userId).putRecord(recordData);
        expect(result).to.not.be.an.instanceof(Error);

        // test if the newly create dataset exists
        // we act as admin user
        result = await getRegistryClient(DEFAULT_ADMIN_USER_ID).getRecord(
            datasetSetId
        );

        expect(result).to.not.be.an.instanceof(Error);
        expect(unionToThrowable(result).id).to.equal(datasetSetId);
        return datasetSetId;
    }

    function testUserDatasetAccess(
        testDesc: string,
        shouldHasAccess: boolean,
        datasetAccessControlAspect: AccessControlAspect,
        testUserRoleId: string,
        testUserOrgUnitId?: string,
        datasetData?: Record
    ) {
        it(testDesc, async () => {
            const dataStewardUser = await authApiClient.createUser({
                displayName: "Test dataStewardUser",
                email: "dataStewward@test.com",
                source: "internal",
                sourceId: uuidV4()
            });
            const dataStewardUserId = dataStewardUser.id;
            // add data steward user role to the data steward user
            await authApiClient.addUserRoles(dataStewardUserId, [
                DATA_STEWARDS_ROLE_ID
            ]);

            const datasetId = await createTestDatasetByUser(
                dataStewardUserId,
                datasetData
            );

            // the creator data steward can still access the dataset
            let result = await getRegistryClient(dataStewardUserId).getRecord(
                datasetId
            );

            expect(result).to.not.be.an.instanceof(Error);
            expect(unionToThrowable(result).id).to.equal(datasetId);

            // we delete access control aspect before assign the new datasetAccessControlAspect data
            await getRegistryClient(dataStewardUserId).deleteRecordAspect(
                datasetId,
                "access-control"
            );

            if (datasetAccessControlAspect?.orgUnitId) {
                expect(isUuid(datasetAccessControlAspect.orgUnitId)).to.be.true;
            }

            await getRegistryClient(dataStewardUserId).putRecordAspect(
                datasetId,
                "access-control",
                {
                    ownerId: dataStewardUserId,
                    ...datasetAccessControlAspect
                }
            );

            const testUser2Data: CreateUserData = {
                displayName: "Test User2",
                email: "testUser2@test.com",
                source: "internal",
                sourceId: uuidV4()
            };

            if (testUserOrgUnitId) {
                expect(isUuid(testUserOrgUnitId)).to.be.true;
                testUser2Data.orgUnitId = testUserOrgUnitId;
            }

            const testUser2 = await authApiClient.createUser(testUser2Data);

            await authApiClient.addUserRoles(testUser2.id, [testUserRoleId]);

            result = await getRegistryClient(testUser2.id).getRecord(datasetId);

            if (shouldHasAccess) {
                // the test user should has access
                expect(result).to.not.be.an.instanceof(Error);
                expect(unionToThrowable(result).id).to.equal(datasetId);
            } else {
                // the test user should has NO access
                expect(result).to.be.an.instanceof(Error);
                expect((result as ServerError).statusCode).to.equal(404);
            }
        });
    }

    before(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.create();
        await createOrgUnits();
        const authenticatedUser = await authApiClient.createUser({
            displayName: "Test AuthenticatedUser1",
            email: "authenticatedUser1@test.com",
            source: "internal",
            sourceId: uuidV4()
        });
        authenticatedUserId = authenticatedUser.id;
        await authApiClient.addUserRoles(authenticatedUserId, [
            AUTHENTICATED_USERS_ROLE_ID
        ]);
        const dataStewardUser = await authApiClient.createUser({
            displayName: "Test dataStewardUser",
            email: "dataStewward@test.com",
            source: "internal",
            sourceId: uuidV4(),
            orgUnitId: orgUnitRefs["Section B"].id
        });
        dataStewardUserId = dataStewardUser.id;
        // add data steward user role to the data steward user
        await authApiClient.addUserRoles(dataStewardUserId, [
            DATA_STEWARDS_ROLE_ID
        ]);

        describe("Test Dataset Metadata Creation Workflow", function () {
            after(async function (this) {
                this.timeout(ENV_SETUP_TIME_OUT);
                await serviceRunner.destroy();
            });

            testUserDatasetAccess(
                "should not allow an authenticated user to access the draft dataset that is not assigned to any orgUnit",
                false,
                {},
                AUTHENTICATED_USERS_ROLE_ID,
                undefined
            );

            testUserDatasetAccess(
                "should not allow an authenticated user to access the draft dataset that is assigned to `Section B`",
                false,
                {
                    orgUnitId: orgUnitRefs["Section B"].id
                },
                AUTHENTICATED_USERS_ROLE_ID,
                undefined
            );

            testUserDatasetAccess(
                "should not allow an authenticated user that is assigned to `Section B` to access the draft dataset that is assigned to `Section B`",
                false,
                {
                    orgUnitId: orgUnitRefs["Section B"].id
                },
                AUTHENTICATED_USERS_ROLE_ID,
                orgUnitRefs["Section B"].id
            );

            testUserDatasetAccess(
                "should not allow an authenticated user that is assigned to `Branch B` to access the draft dataset that is assigned to `Section B`",
                false,
                {
                    orgUnitId: orgUnitRefs["Section B"].id
                },
                AUTHENTICATED_USERS_ROLE_ID,
                orgUnitRefs["Branch B"].id
            );

            testUserDatasetAccess(
                "should not allow an authenticated user that is assigned to `Branch A` to access the draft dataset that is assigned to `Section B`",
                false,
                {
                    orgUnitId: orgUnitRefs["Section B"].id
                },
                AUTHENTICATED_USERS_ROLE_ID,
                orgUnitRefs["Branch A"].id
            );

            testUserDatasetAccess(
                "should allow another data steward that is not assigned to any orgUnit to access the draft dataset that is not assigned to any orgUnit",
                true,
                {},
                DATA_STEWARDS_ROLE_ID,
                undefined
            );

            testUserDatasetAccess(
                "should allow another data steward that is assigned to `Section B` to access the draft dataset that is assigned to `Section B`",
                true,
                {
                    orgUnitId: orgUnitRefs["Section B"].id
                },
                DATA_STEWARDS_ROLE_ID,
                orgUnitRefs["Section B"].id
            );

            testUserDatasetAccess(
                "should allow another data steward that is assigned to `Branch B` to access the draft dataset that is assigned to `Section B`",
                true,
                {
                    orgUnitId: orgUnitRefs["Section B"].id
                },
                DATA_STEWARDS_ROLE_ID,
                orgUnitRefs["Branch B"].id
            );

            testUserDatasetAccess(
                "should not allow another data steward that is assigned to `Branch A` to access the draft dataset that is assigned to `Section B`",
                false,
                {
                    orgUnitId: orgUnitRefs["Section B"].id
                },
                DATA_STEWARDS_ROLE_ID,
                orgUnitRefs["Branch A"].id
            );

            testUserDatasetAccess(
                "should not allow another data steward that is assigned to `Section C` to access the draft dataset that is assigned to `Section B`",
                false,
                {
                    orgUnitId: orgUnitRefs["Section B"].id
                },
                DATA_STEWARDS_ROLE_ID,
                orgUnitRefs["Section C"].id
            );
        });
    });

    it("Placeholder to trigger test cases", () => expect(true).to.be.true);
});
