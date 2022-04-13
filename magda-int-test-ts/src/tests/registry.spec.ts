import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import {
    DEFAULT_ADMIN_USER_ID,
    AUTHENTICATED_USERS_ROLE_ID,
    DATA_STEWARDS_ROLE_ID,
    ANONYMOUS_USERS_ROLE_ID
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

const getRegistryClient = (userId?: string) => {
    if (userId) {
        return new RegistryApiClient({
            baseUrl: "http://localhost:6101/v0",
            maxRetries: 0,
            tenantId: 0,
            jwtSecret: jwtSecret,
            userId
        });
    } else {
        // registry client that acts as ANONYMOUS_USERS
        return new RegistryApiClient({
            baseUrl: "http://localhost:6101/v0",
            maxRetries: 0,
            tenantId: 0
        });
    }
};

describe("registry auth integration tests", function (this) {
    this.timeout(300000);
    const serviceRunner = new ServiceRunner();
    serviceRunner.enableRegistryApi = true;
    serviceRunner.jwtSecret = jwtSecret;
    serviceRunner.authApiDebugMode = false;

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

        recordData.id = datasetSetId;

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

    async function createTestDistributionByUser(
        userId: string,
        accessControlAspect?: AccessControlAspect
    ) {
        return await createTestDatasetByUser(
            userId,
            {
                id: "",
                name: "test dist",
                aspects: {
                    "dcat-distribution-strings": {
                        title: "a test distribution",
                        description: "this is a test distribution"
                    },
                    "access-control": {}
                },
                tenantId: 0,
                sourceTag: "",
                // authnReadPolicyId is deprecated and to be removed
                authnReadPolicyId: ""
            },
            accessControlAspect
        );
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

            // updating access-control aspect
            if (datasetAccessControlAspect) {
                // we delete access control aspect before assign the new datasetAccessControlAspect data
                await getRegistryClient(dataStewardUserId).deleteRecordAspect(
                    datasetId,
                    "access-control"
                );

                if (datasetAccessControlAspect?.orgUnitId) {
                    expect(isUuid(datasetAccessControlAspect.orgUnitId)).to.be
                        .true;
                }

                await getRegistryClient(dataStewardUserId).putRecordAspect(
                    datasetId,
                    "access-control",
                    {
                        ownerId: dataStewardUserId,
                        ...datasetAccessControlAspect
                    }
                );
            }

            let testUser2RegistryClient: RegistryApiClient;
            if (testUserRoleId === ANONYMOUS_USERS_ROLE_ID) {
                testUser2RegistryClient = getRegistryClient();
            } else {
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

                await authApiClient.addUserRoles(testUser2.id, [
                    testUserRoleId
                ]);

                testUser2RegistryClient = getRegistryClient(testUser2.id);
            }

            result = await testUser2RegistryClient.getRecord(datasetId);

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

        // we need to put actual test cases inside `before` as we need to org unit ids to generate our test case.
        describe("Test Dataset Metadata Creation Workflow", function () {
            after(async function (this) {
                this.timeout(ENV_SETUP_TIME_OUT);
                await serviceRunner.destroy();
            });

            testUserDatasetAccess(
                "should not allow an anonymous user to access the draft dataset that is not assigned to any orgUnit",
                false,
                {},
                ANONYMOUS_USERS_ROLE_ID,
                undefined
            );

            testUserDatasetAccess(
                "should not allow an anonymous user to access the draft dataset that is assigned to `Section B`",
                false,
                {
                    orgUnitId: orgUnitRefs["Section B"].id
                },
                ANONYMOUS_USERS_ROLE_ID,
                undefined
            );

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

            it("should allow data steward update its own draft dataset", async () => {
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
                    dataStewardUserId
                );

                const result = await getRegistryClient(
                    dataStewardUserId
                ).patchRecordAspect(datasetId, "dataset-draft", [
                    {
                        op: "replace",
                        path: "/data",
                        value: '{"name": "xxx"}'
                    }
                ]);

                expect(result).to.not.be.an.instanceof(Error);
            });

            it("should not allow data steward update its own draft dataset to a dataset he has no access (e.g. assign to an orgunit he has no access)", async () => {
                const dataStewardUser = await authApiClient.createUser({
                    displayName: "Test dataStewardUser",
                    email: "dataStewward@test.com",
                    source: "internal",
                    sourceId: uuidV4(),
                    orgUnitId: orgUnitRefs["Branch B"].id
                });
                expect(isUuid(orgUnitRefs["Branch B"].id)).to.equal(true);

                const dataStewardUserId = dataStewardUser.id;
                // add data steward user role to the data steward user
                await authApiClient.addUserRoles(dataStewardUserId, [
                    DATA_STEWARDS_ROLE_ID
                ]);

                const datasetId = await createTestDatasetByUser(
                    dataStewardUserId
                );

                expect(isUuid(orgUnitRefs["Branch A"].id)).to.equal(true);
                const result = await getRegistryClient(
                    dataStewardUserId
                ).patchRecordAspect(datasetId, "access-control", [
                    {
                        op: "replace",
                        path: "/orgUnitId",
                        value: orgUnitRefs["Branch A"].id
                    },
                    {
                        op: "remove",
                        path: "/ownerId"
                    }
                ]);

                expect(result).to.be.an.instanceof(Error);
                expect((result as ServerError).statusCode).to.equal(403);
            });

            it("should allow data steward to update a draft dataset to published dataset", async () => {
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
                    dataStewardUserId
                );

                let result = await getRegistryClient(
                    dataStewardUserId
                ).patchRecord(datasetId, [
                    {
                        op: "replace",
                        path: "/aspects/publishing/state",
                        value: "published"
                    },
                    {
                        op: "remove",
                        path: "/aspects/dataset-draft"
                    },
                    {
                        op: "add",
                        path: "/aspects/dcat-dataset-strings/title",
                        value: "test dataset"
                    },
                    {
                        op: "add",
                        path: "/aspects/dcat-dataset-strings/description",
                        value: "this is a test dataset"
                    }
                ]);

                expect(result).to.not.be.an.instanceof(Error);

                result = await getRegistryClient(
                    dataStewardUserId
                ).getRecord(datasetId, ["dcat-dataset-strings", "publishing"]);

                expect(result).to.not.be.an.instanceof(Error);

                const record = result as Record;
                expect(record.aspects["publishing"]["state"]).to.equal(
                    "published"
                );
                expect(record.aspects["dataset-draft"]).to.be.undefined;
                expect(
                    record.aspects["dcat-dataset-strings"]["description"]
                ).to.equal("this is a test dataset");
            });

            it("should allow data steward to edit a published dataset as draft dataset and re-publish it", async () => {
                expect(isUuid(orgUnitRefs["Section B"].id)).to.equal(true);
                const dataStewardUser = await authApiClient.createUser({
                    displayName: "Test dataStewardUser",
                    email: "dataStewward@test.com",
                    source: "internal",
                    sourceId: uuidV4(),
                    orgUnitId: orgUnitRefs["Section B"].id
                });
                const dataStewardUserId = dataStewardUser.id;
                // add data steward user role to the data steward user
                await authApiClient.addUserRoles(dataStewardUserId, [
                    DATA_STEWARDS_ROLE_ID
                ]);

                const datasetId = await createTestDatasetByUser(
                    dataStewardUserId,
                    {
                        id: "",
                        name: "test dataset",
                        aspects: {
                            "dcat-dataset-strings": {
                                title: "test dataset",
                                description: "this is a test one"
                            },
                            publishing: {
                                state: "published"
                            }
                        },
                        tenantId: 0,
                        sourceTag: "",
                        // authnReadPolicyId is deprecated and to be removed
                        authnReadPolicyId: ""
                    }
                );

                let result = await getRegistryClient(
                    dataStewardUserId
                ).putRecord({
                    id: datasetId,
                    name: "test dataset updated name",
                    aspects: {
                        "dataset-draft": {
                            dataset: {
                                name: "test dataset updated name"
                            },
                            data: "{}",
                            timestamp: "2022-04-11T12:52:24.278Z"
                        },
                        publishing: {
                            state: "draft"
                        },
                        "access-control": {
                            ownerId: dataStewardUserId,
                            orgUnitId: orgUnitRefs["Section B"].id
                        }
                    },
                    tenantId: 0,
                    sourceTag: "",
                    // authnReadPolicyId is deprecated and to be removed
                    authnReadPolicyId: ""
                });

                expect(result).to.not.be.an.instanceof(Error);

                // read the recode to confirm its current data
                result = await getRegistryClient(
                    dataStewardUserId
                ).getRecord(datasetId, [
                    "dcat-dataset-strings",
                    "publishing",
                    "dataset-draft"
                ]);

                expect(result).to.not.be.an.instanceof(Error);

                let record = result as Record;
                expect(record.aspects["publishing"]["state"]).to.equal("draft");
                expect(
                    record.aspects["dataset-draft"]["dataset"]["name"]
                ).to.equal("test dataset updated name");
                expect(
                    record.aspects["dcat-dataset-strings"]["title"]
                ).to.equal("test dataset");

                // modify again to make it published dataset
                result = await getRegistryClient(dataStewardUserId).patchRecord(
                    datasetId,
                    [
                        {
                            op: "replace",
                            path: "/aspects/publishing/state",
                            value: "published"
                        },
                        {
                            op: "remove",
                            path: "/aspects/dataset-draft"
                        },
                        {
                            op: "replace",
                            path: "/aspects/dcat-dataset-strings/title",
                            value: "test dataset updated name"
                        }
                    ]
                );

                // read the recode to confirm its current data
                result = await getRegistryClient(dataStewardUserId).getRecord(
                    datasetId,
                    ["dcat-dataset-strings", "publishing"],
                    ["dataset-draft"]
                );

                expect(result).to.not.be.an.instanceof(Error);

                record = result as Record;
                expect(record.aspects["publishing"]["state"]).to.equal(
                    "published"
                );
                expect(record.aspects["dataset-draft"]).to.be.undefined;
                expect(
                    record.aspects["dcat-dataset-strings"]["title"]
                ).to.equal("test dataset updated name");
            });

            it("should not allow a user to access distributions that he has no access via `dereference`", async () => {
                expect(isUuid(orgUnitRefs["Section B"].id)).to.equal(true);
                const dataStewardUser = await authApiClient.createUser({
                    displayName: "Test dataStewardUser",
                    email: "dataStewward@test.com",
                    source: "internal",
                    sourceId: uuidV4(),
                    orgUnitId: orgUnitRefs["Section B"].id
                });
                const dataStewardUserId = dataStewardUser.id;
                // add data steward user role to the data steward user
                await authApiClient.addUserRoles(dataStewardUserId, [
                    DATA_STEWARDS_ROLE_ID
                ]);

                const disId1 = await createTestDistributionByUser(
                    dataStewardUserId
                );

                const disId2 = await createTestDistributionByUser(
                    dataStewardUserId
                );

                const disId3 = await createTestDistributionByUser(
                    dataStewardUserId
                );

                const datasetId = await createTestDatasetByUser(
                    dataStewardUserId,
                    {
                        id: "",
                        name: "test dataset",
                        aspects: {
                            "dcat-dataset-strings": {
                                title: "test dataset",
                                description: "this is a test one"
                            },
                            publishing: {
                                state: "published"
                            },
                            "dataset-distributions": {
                                distributions: [disId1, disId2, disId3]
                            }
                        },
                        tenantId: 0,
                        sourceTag: "",
                        // authnReadPolicyId is deprecated and to be removed
                        authnReadPolicyId: ""
                    }
                );

                let result = await getRegistryClient(
                    dataStewardUserId
                ).getRecord(
                    datasetId,
                    [
                        "dcat-dataset-strings",
                        "publishing",
                        "dataset-distributions"
                    ],
                    [],
                    true
                );

                expect(result).to.not.be.an.instanceof(Error);
                expect(
                    (result as Record).aspects["dataset-distributions"][
                        "distributions"
                    ]
                ).to.have.lengthOf(3);
                expect(
                    (result as Record).aspects["dataset-distributions"][
                        "distributions"
                    ][0]
                ).to.have.own.property("aspects");
                expect(
                    (result as Record).aspects["dataset-distributions"][
                        "distributions"
                    ][0]["aspects"]["dcat-distribution-strings"]["title"]
                ).to.equal("a test distribution");
                expect(
                    (result as Record).aspects["dataset-distributions"][
                        "distributions"
                    ].map((item: any) => item.id)
                ).to.include.members([disId1, disId2, disId3]);

                // revoke the access to 2ns dist
                expect(isUuid(orgUnitRefs["Branch B"].id)).to.equal(true);
                // use admin user to revoke
                result = await getRegistryClient(
                    DEFAULT_ADMIN_USER_ID
                ).patchRecord(disId2, [
                    {
                        op: "replace",
                        path: "/aspects/access-control/orgUnitId",
                        value: orgUnitRefs["Branch B"].id
                    },
                    {
                        op: "remove",
                        path: "/aspects/access-control/ownerId"
                    }
                ]);

                expect(result).to.not.be.an.instanceof(Error);

                // verify record's distribution again
                result = await getRegistryClient(dataStewardUserId).getRecord(
                    datasetId,
                    [
                        "dcat-dataset-strings",
                        "publishing",
                        "dataset-distributions"
                    ],
                    [],
                    true
                );

                expect(result).to.not.be.an.instanceof(Error);
                expect(
                    (result as Record).aspects["dataset-distributions"][
                        "distributions"
                    ]
                ).to.have.lengthOf(2);
                expect(
                    (result as Record).aspects["dataset-distributions"][
                        "distributions"
                    ].map((item: any) => item.id)
                    // -- dist2 is not included anymore
                ).to.include.members([disId1, disId3]);
                expect(
                    (result as Record).aspects["dataset-distributions"][
                        "distributions"
                    ][0]
                ).to.have.own.property("aspects");
                expect(
                    (result as Record).aspects["dataset-distributions"][
                        "distributions"
                    ][0]["aspects"]["dcat-distribution-strings"]["title"]
                ).to.equal("a test distribution");
            });

            it("should allow a user to access draft dataset via pre-authorised permission", async () => {
                const testUser = await authApiClient.createUser({
                    displayName: "Test User",
                    email: "testuser@test.com",
                    source: "internal",
                    sourceId: uuidV4(),
                    orgUnitId: orgUnitRefs["Branch B"].id
                });
                expect(isUuid(orgUnitRefs["Branch B"].id)).to.equal(true);

                const testUserId = testUser.id;

                expect(isUuid(orgUnitRefs["Branch A"].id)).to.equal(true);
                const datasetId = await createTestDatasetByUser(
                    DEFAULT_ADMIN_USER_ID,
                    undefined,
                    {
                        ownerId: DEFAULT_ADMIN_USER_ID,
                        orgUnitId: orgUnitRefs["Branch A"].id
                    }
                );

                let result = await getRegistryClient(testUserId).getRecord(
                    datasetId
                );

                expect(result).to.be.an.instanceof(ServerError);
                expect((result as ServerError).statusCode).to.equal(404);

                const role = await authApiClient.createRole("test role");
                const permission = await authApiClient.createRolePermission(
                    role.id,
                    {
                        name: "record read permission",
                        description: "",
                        resource_id: (
                            await authApiClient.getResourceByUri(
                                "object/record"
                            )
                        ).id,
                        user_ownership_constraint: false,
                        org_unit_ownership_constraint: false,
                        pre_authorised_constraint: true,
                        operationIds: [
                            (
                                await authApiClient.getOperationByUri(
                                    "object/record/read"
                                )
                            ).id
                        ]
                    }
                );

                result = await getRegistryClient(
                    DEFAULT_ADMIN_USER_ID
                ).patchRecordAspect(datasetId, "access-control", [
                    {
                        op: "add",
                        path: "/preAuthorisedPermissionIds",
                        value: [permission.id]
                    }
                ]);

                expect(result).to.not.be.an.instanceof(Error);

                // add test role to the test user
                await authApiClient.addUserRoles(testUserId, [role.id]);

                // testUser can access the record now
                result = await getRegistryClient(testUserId).getRecord(
                    datasetId
                );

                expect(result).to.not.be.an.instanceof(Error);
                expect(unionToThrowable(result).id).to.equal(datasetId);
            });
        });
    });

    it("Placeholder to trigger test cases", () => expect(true).to.be.true);
});
