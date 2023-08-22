import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner";
import partial from "lodash/partial";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import RegistryApiClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import {
    DEFAULT_ADMIN_USER_ID,
    AUTHENTICATED_USERS_ROLE_ID,
    DATA_STEWARDS_ROLE_ID,
    ANONYMOUS_USERS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants";
import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";
import { CreateUserData } from "magda-typescript-common/src/authorization-api/model";
import { Record } from "magda-typescript-common/src/generated/registry/api";
import ServerError from "magda-typescript-common/src/ServerError";
import isUuid from "magda-typescript-common/src/util/isUuid";
import { AccessControlAspect } from "magda-typescript-common/src/registry/model";
import {
    createOrgUnits,
    getRegistryClient as getRegistryClientWithJwtSecret,
    getOrgUnitIdByName as getOrgUnitIdByNameWithAuthApiClient,
    createTestDatasetByUser as createTestDatasetByUserWithAuthApiClientJwtSecret,
    createTestDistributionByUser as createTestDistributionByUserWithAuthApiClientJwtSecret
} from "./testUtils";

const ENV_SETUP_TIME_OUT = 600000; // -- 10 mins
const jwtSecret = uuidV4();
const authApiClient = new AuthApiClient(
    "http://localhost:6104/v0",
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);

const getRegistryClient = partial(getRegistryClientWithJwtSecret, jwtSecret);
const getOrgUnitIdByName = partial(
    getOrgUnitIdByNameWithAuthApiClient,
    authApiClient
);
const createTestDatasetByUser = partial(
    createTestDatasetByUserWithAuthApiClientJwtSecret,
    authApiClient,
    jwtSecret
);
const createTestDistributionByUser = partial(
    createTestDistributionByUserWithAuthApiClientJwtSecret,
    authApiClient,
    jwtSecret
);

function testUserDatasetAccess(
    testDesc: string,
    shouldHasAccess: boolean,
    datasetAccessControlAspect: AccessControlAspect & {
        orgUnitName?: string;
    },
    testUserRoleIdOrIds: string | string[],
    testUserOrgUnitName?: string,
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

            if (datasetAccessControlAspect?.orgUnitName) {
                const orgUnitId = await getOrgUnitIdByName(
                    datasetAccessControlAspect.orgUnitName
                );
                expect(isUuid(orgUnitId)).to.be.true;
                delete datasetAccessControlAspect.orgUnitName;
                datasetAccessControlAspect.orgUnitId = orgUnitId;
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
        if (testUserRoleIdOrIds === ANONYMOUS_USERS_ROLE_ID) {
            testUser2RegistryClient = getRegistryClient();
        } else {
            const testUser2Data: CreateUserData = {
                displayName: "Test User2",
                email: "testUser2@test.com",
                source: "internal",
                sourceId: uuidV4()
            };

            if (testUserOrgUnitName) {
                const testUserOrgUnitId = await getOrgUnitIdByName(
                    testUserOrgUnitName
                );
                expect(isUuid(testUserOrgUnitId)).to.be.true;
                testUser2Data.orgUnitId = testUserOrgUnitId;
            }

            const testUser2 = await authApiClient.createUser(testUser2Data);

            await authApiClient.addUserRoles(
                testUser2.id,
                typeof testUserRoleIdOrIds === "string"
                    ? [testUserRoleIdOrIds]
                    : testUserRoleIdOrIds
            );

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

let roleWithConstraintedDraftDatasetAccessAllowExemption: string = null;
let roleWithConstraintedDraftDatasetAccessNotAllowExemption: string = null;

describe("registry auth integration tests", () => {
    describe("Test Dataset Metadata Creation Workflow", function () {
        const serviceRunner = new ServiceRunner();
        serviceRunner.enableAuthService = true;
        serviceRunner.enableRegistryApi = true;
        serviceRunner.jwtSecret = jwtSecret;
        serviceRunner.authApiDebugMode = false;

        before(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.create();
            await createOrgUnits(authApiClient);

            const resource = await authApiClient.getResourceByUri(
                "object/dataset/draft"
            );
            let role = await authApiClient.createRole(
                "Role with constrainted draft dataset access but no allow exemption"
            );
            roleWithConstraintedDraftDatasetAccessAllowExemption = role.id;
            await authApiClient.createRolePermission(role.id, {
                name: "test permission",
                description: "",
                operationIds: [
                    (
                        await authApiClient.getOperationByUri(
                            "object/dataset/draft/read"
                        )
                    ).id.toString()
                ],
                allow_exemption: true,
                org_unit_ownership_constraint: true,
                user_ownership_constraint: true,
                pre_authorised_constraint: false,
                resource_id: resource.id
            });

            role = await authApiClient.createRole(
                "Role with constrainted draft dataset access not allow exemption"
            );
            roleWithConstraintedDraftDatasetAccessNotAllowExemption = role.id;
            await authApiClient.createRolePermission(role.id, {
                name: "test permission",
                description: "",
                operationIds: [
                    (
                        await authApiClient.getOperationByUri(
                            "object/dataset/draft/read"
                        )
                    ).id.toString()
                ],
                allow_exemption: false,
                org_unit_ownership_constraint: true,
                user_ownership_constraint: true,
                pre_authorised_constraint: false,
                resource_id: resource.id
            });
        });

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
            // anonymous user has also access to published dataset that's not assigned to any org unit
            // this is a legacy behaviour created to support the "public" semantics before the introduction of `constraintExemption`
            "should allow an anonymous user to access the published dataset that is not assigned to any orgUnit",
            true,
            {},
            ANONYMOUS_USERS_ROLE_ID,
            undefined,
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            // only because anonymous user has no access to draft dataset by default
            "should not allow an anonymous user to access the draft dataset for which constraintExemption is on",
            false,
            {
                constraintExemption: true
            },
            ANONYMOUS_USERS_ROLE_ID,
            undefined
        );

        testUserDatasetAccess(
            // anonymous user has access to public published dataset by default
            "should allow an anonymous user to access the published dataset for which constraintExemption is on",
            true,
            {
                constraintExemption: true,
                orgUnitName: "Section B"
            },
            ANONYMOUS_USERS_ROLE_ID,
            undefined,
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            // anonymous user has access to public published dataset by default
            // but this record has been assigned to an org unit and the record doesn't have constraintExemption = "true"
            "should not allow an anonymous user to access the published dataset assign to `Section B`",
            false,
            {
                orgUnitName: "Section B"
            },
            ANONYMOUS_USERS_ROLE_ID,
            undefined,
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            // anonymous user has also access to published dataset that's not assigned to any org unit
            // this is a legacy behaviour created to support the "public" semantics before the introduction of `constraintExemption`
            "should allow an anonymous user to access the published dataset that not assigned to any org unit",
            true,
            {},
            ANONYMOUS_USERS_ROLE_ID,
            undefined,
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            "should not allow an anonymous user to access the draft dataset that is assigned to `Section B`",
            false,
            {
                // access-control aspect doesn't support `orgUnitName` field
                // as we don't know the actual id of orgUnit yet during test cases creation time,
                // we choose to supply the orgName instead and convert it to orgUnitId in `testUserDatasetAccess`
                orgUnitName: "Section B"
            },
            ANONYMOUS_USERS_ROLE_ID,
            undefined
        );

        testUserDatasetAccess(
            "should allow an anonymous user to access the published dataset that is assigned to `Section B` with constraintExemption on",
            true,
            {
                // access-control aspect doesn't support `orgUnitName` field
                // as we don't know the actual id of orgUnit yet during test cases creation time,
                // we choose to supply the orgName instead and convert it to orgUnitId in `testUserDatasetAccess`
                orgUnitName: "Section B",
                constraintExemption: true
            },
            ANONYMOUS_USERS_ROLE_ID,
            undefined,
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            "should not allow an anonymous user to access the draft dataset that is assigned to `Section B` (plus constraintExemption is on for the dataset)",
            false,
            {
                // access-control aspect doesn't support `orgUnitName` field
                // as we don't know the actual id of orgUnit yet during test cases creation time,
                // we choose to supply the orgName instead and convert it to orgUnitId in `testUserDatasetAccess`
                orgUnitName: "Section B",
                constraintExemption: true
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
            // this is a legacy behaviour created to support the "public" semantics before the introduction of `constraintExemption`
            "should allow an authenticated user to access the published dataset that is not assigned to any orgUnit",
            true,
            {},
            AUTHENTICATED_USERS_ROLE_ID,
            undefined,
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            "should not allow an authenticated user to access the draft dataset that for which constraintExemption is on",
            false,
            {
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            undefined
        );

        testUserDatasetAccess(
            "should allow an authenticated user to access the published dataset that for which constraintExemption is on",
            true,
            {
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            undefined,
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            "should not allow an authenticated user to access the draft dataset that is assigned to `Section B`",
            false,
            {
                orgUnitName: "Section B"
            },
            AUTHENTICATED_USERS_ROLE_ID,
            undefined
        );

        testUserDatasetAccess(
            "should not allow an authenticated user to access the draft dataset that is assigned to `Section B` (plus constraintExemption is on for the dataset)",
            false,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            undefined
        );

        testUserDatasetAccess(
            "should allow an authenticated user to access the published dataset that is assigned to `Section B` (plus constraintExemption is on for the dataset)",
            true,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            undefined,
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            "should not allow an authenticated user that is assigned to `Section B` to access the draft dataset that is assigned to `Section B`",
            false,
            {
                orgUnitName: "Section B"
            },
            // authenticated users has no permissions to access draft dataset
            AUTHENTICATED_USERS_ROLE_ID,
            "Section B"
        );

        testUserDatasetAccess(
            "should allow an authenticated user that is assigned to `Section B` to access the published dataset that is assigned to `Section B`",
            true,
            {
                orgUnitName: "Section B"
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Section B",
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            "should not allow an authenticated user that is assigned to `Section B` to access the draft dataset that is assigned to `Section B` (plus constraintExemption is on for the dataset)",
            false,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Section B"
        );

        testUserDatasetAccess(
            "should allow an authenticated user that is assigned to `Section B` to access the published dataset that is assigned to `Section B` (plus constraintExemption is on for the dataset)",
            true,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Section B",
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            "should not allow an authenticated user that is assigned to `Branch B` to access the draft dataset that is assigned to `Section B`",
            false,
            {
                orgUnitName: "Section B"
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Branch B"
        );

        testUserDatasetAccess(
            "should allow an authenticated user that is assigned to `Branch B` to access the published dataset that is assigned to `Section B`",
            true,
            {
                orgUnitName: "Section B"
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Branch B",
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            "should not allow an authenticated user that is assigned to `Branch B` to access the draft dataset that is assigned to `Section B` (plus constraintExemption is on for the dataset)",
            false,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Branch B"
        );

        testUserDatasetAccess(
            "should allow an authenticated user that is assigned to `Branch B` to access the published dataset that is assigned to `Section B` (plus constraintExemption is on for the dataset)",
            true,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Branch B",
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        testUserDatasetAccess(
            "should not allow an authenticated user that is assigned to `Branch A` to access the draft dataset that is assigned to `Section B`",
            false,
            {
                orgUnitName: "Section B"
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Branch A"
        );

        testUserDatasetAccess(
            "should not allow an authenticated user that is assigned to `Branch A` to access the draft dataset that is assigned to `Section B` (plus constraintExemption is on for the dataset)",
            false,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Branch A"
        );

        testUserDatasetAccess(
            "should allow an authenticated user that is assigned to `Branch A` to access the published dataset that is assigned to `Section B` (plus constraintExemption is on for the dataset)",
            true,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            AUTHENTICATED_USERS_ROLE_ID,
            "Branch A",
            {
                id: "",
                name: "",
                aspects: {
                    publishing: {
                        state: "published"
                    },
                    "dcat-dataset-strings": {}
                },
                sourceTag: "",
                tenantId: 0
            }
        );

        //------------------- data steward tests -------------------//

        testUserDatasetAccess(
            "should allow another data steward that is not assigned to any orgUnit to access the draft dataset that is not assigned to any orgUnit",
            true,
            {},
            [DATA_STEWARDS_ROLE_ID, AUTHENTICATED_USERS_ROLE_ID],
            undefined
        );

        testUserDatasetAccess(
            "should allow another data steward that is assigned to `Section B` to access the draft dataset that is assigned to `Section B`",
            true,
            {
                orgUnitName: "Section B"
            },
            [DATA_STEWARDS_ROLE_ID, AUTHENTICATED_USERS_ROLE_ID],
            "Section B"
        );

        testUserDatasetAccess(
            "should allow another data steward that is assigned to `Branch B` to access the draft dataset that is assigned to `Section B`",
            true,
            {
                orgUnitName: "Section B"
            },
            [DATA_STEWARDS_ROLE_ID, AUTHENTICATED_USERS_ROLE_ID],
            "Branch B"
        );

        testUserDatasetAccess(
            "should not allow another data steward that is assigned to `Branch A` to access the draft dataset that is assigned to `Section B`",
            false,
            {
                orgUnitName: "Section B"
            },
            [DATA_STEWARDS_ROLE_ID, AUTHENTICATED_USERS_ROLE_ID],
            "Branch A"
        );

        testUserDatasetAccess(
            "should allow another data steward that is assigned to `Branch A` to access the draft dataset that is assigned to `Section B` but `constraintExemption` = true",
            // data steward has restrcited access to draft dataset and NOT allow exemption
            false,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            [DATA_STEWARDS_ROLE_ID, AUTHENTICATED_USERS_ROLE_ID],
            "Branch A"
        );

        console.log(
            roleWithConstraintedDraftDatasetAccessAllowExemption,
            roleWithConstraintedDraftDatasetAccessNotAllowExemption
        );

        testUserDatasetAccess(
            "should not allow another data steward that is assigned to `Section C` to access the draft dataset that is assigned to `Section B`",
            false,
            {
                orgUnitName: "Section B"
            },
            [DATA_STEWARDS_ROLE_ID, AUTHENTICATED_USERS_ROLE_ID],
            "Section C"
        );

        testUserDatasetAccess(
            "should allow another data steward that is assigned to `Section C` to access the draft dataset that is assigned to `Section B` but `constraintExemption` = true",
            // data steward has restrcited access to draft dataset and NOT allow exemption
            false,
            {
                orgUnitName: "Section B",
                constraintExemption: true
            },
            [DATA_STEWARDS_ROLE_ID, AUTHENTICATED_USERS_ROLE_ID],
            "Section C"
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

            const datasetId = await createTestDatasetByUser(dataStewardUserId);

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
                orgUnitId: await getOrgUnitIdByName("Branch B")
            });

            const dataStewardUserId = dataStewardUser.id;
            // add data steward user role to the data steward user
            await authApiClient.addUserRoles(dataStewardUserId, [
                DATA_STEWARDS_ROLE_ID
            ]);

            const datasetId = await createTestDatasetByUser(dataStewardUserId);

            const result = await getRegistryClient(
                dataStewardUserId
            ).patchRecordAspect(datasetId, "access-control", [
                {
                    op: "replace",
                    path: "/orgUnitId",
                    value: await getOrgUnitIdByName("Branch A")
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

            const datasetId = await createTestDatasetByUser(dataStewardUserId);

            let result = await getRegistryClient(dataStewardUserId).patchRecord(
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
                        op: "add",
                        path: "/aspects/dcat-dataset-strings/title",
                        value: "test dataset"
                    },
                    {
                        op: "add",
                        path: "/aspects/dcat-dataset-strings/description",
                        value: "this is a test dataset"
                    }
                ]
            );

            expect(result).to.not.be.an.instanceof(Error);

            result = await getRegistryClient(
                dataStewardUserId
            ).getRecord(datasetId, ["dcat-dataset-strings", "publishing"]);

            expect(result).to.not.be.an.instanceof(Error);

            const record = result as Record;
            expect(record.aspects["publishing"]["state"]).to.equal("published");
            expect(record.aspects["dataset-draft"]).to.be.undefined;
            expect(
                record.aspects["dcat-dataset-strings"]["description"]
            ).to.equal("this is a test dataset");
        });

        it("should allow data steward to edit a published dataset as draft dataset and re-publish it", async () => {
            const dataStewardUser = await authApiClient.createUser({
                displayName: "Test dataStewardUser",
                email: "dataStewward@test.com",
                source: "internal",
                sourceId: uuidV4(),
                orgUnitId: await getOrgUnitIdByName("Section B")
            });
            const dataStewardUserId = dataStewardUser.id;
            // add data steward user role to the data steward user
            await authApiClient.addUserRoles(dataStewardUserId, [
                DATA_STEWARDS_ROLE_ID
            ]);

            const datasetId = await createTestDatasetByUser(dataStewardUserId, {
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
                sourceTag: ""
            });

            let result = await getRegistryClient(dataStewardUserId).putRecord({
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
                        orgUnitId: await getOrgUnitIdByName("Section B")
                    }
                },
                tenantId: 0,
                sourceTag: ""
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
            expect(record.aspects["dataset-draft"]["dataset"]["name"]).to.equal(
                "test dataset updated name"
            );
            expect(record.aspects["dcat-dataset-strings"]["title"]).to.equal(
                "test dataset"
            );

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
            expect(record.aspects["publishing"]["state"]).to.equal("published");
            expect(record.aspects["dataset-draft"]).to.be.undefined;
            expect(record.aspects["dcat-dataset-strings"]["title"]).to.equal(
                "test dataset updated name"
            );
        });

        it("should not allow a user to access distributions that he has no access via `dereference`", async () => {
            const dataStewardUser = await authApiClient.createUser({
                displayName: "Test dataStewardUser",
                email: "dataStewward@test.com",
                source: "internal",
                sourceId: uuidV4(),
                orgUnitId: await getOrgUnitIdByName("Section B")
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

            const datasetId = await createTestDatasetByUser(dataStewardUserId, {
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
                sourceTag: ""
            });

            let result = await getRegistryClient(dataStewardUserId).getRecord(
                datasetId,
                ["dcat-dataset-strings", "publishing", "dataset-distributions"],
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
            // use admin user to revoke
            result = await getRegistryClient(DEFAULT_ADMIN_USER_ID).patchRecord(
                disId2,
                [
                    {
                        op: "replace",
                        path: "/aspects/access-control/orgUnitId",
                        value: await getOrgUnitIdByName("Branch B")
                    },
                    {
                        op: "remove",
                        path: "/aspects/access-control/ownerId"
                    }
                ]
            );

            expect(result).to.not.be.an.instanceof(Error);

            // verify record's distribution again
            result = await getRegistryClient(dataStewardUserId).getRecord(
                datasetId,
                ["dcat-dataset-strings", "publishing", "dataset-distributions"],
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
                orgUnitId: await getOrgUnitIdByName("Branch B")
            });

            const testUserId = testUser.id;

            const datasetId = await createTestDatasetByUser(
                DEFAULT_ADMIN_USER_ID,
                undefined,
                {
                    ownerId: DEFAULT_ADMIN_USER_ID,
                    orgUnitId: await getOrgUnitIdByName("Branch A")
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
                        await authApiClient.getResourceByUri("object/record")
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
            result = await getRegistryClient(testUserId).getRecord(datasetId);

            expect(result).to.not.be.an.instanceof(Error);
            expect(unionToThrowable(result).id).to.equal(datasetId);
        });

        it("should allow an anonymous user with constrain permission's allowExemption = true to access dataset with `constraintExemption` = true", async () => {
            const testUser = await authApiClient.createUser({
                displayName: "anonymous User",
                email: "xxx@xx.com",
                source: "",
                sourceId: "",
                orgUnitId: null
            });

            const altAnonymousRole = await authApiClient.createRole(
                "test alternative anonymous users role"
            );
            const altPermission = await authApiClient.createRolePermission(
                altAnonymousRole.id,
                {
                    name: "record read permission",
                    description: "",
                    resource_id: (
                        await authApiClient.getResourceByUri("object/record")
                    ).id,
                    user_ownership_constraint: true,
                    org_unit_ownership_constraint: true,
                    pre_authorised_constraint: true,
                    allow_exemption: true,
                    operationIds: [
                        (
                            await authApiClient.getOperationByUri(
                                "object/record/read"
                            )
                        ).id
                    ]
                }
            );

            const testUserId = testUser.id;
            await authApiClient.addUserRoles(testUserId, [altAnonymousRole.id]);

            const datasetId1 = await createTestDatasetByUser(
                DEFAULT_ADMIN_USER_ID,
                undefined,
                {
                    ownerId: DEFAULT_ADMIN_USER_ID,
                    orgUnitId: await getOrgUnitIdByName("Branch A"),
                    constraintExemption: false
                }
            );

            const datasetId2 = await createTestDatasetByUser(
                DEFAULT_ADMIN_USER_ID,
                undefined,
                {
                    ownerId: DEFAULT_ADMIN_USER_ID,
                    orgUnitId: await getOrgUnitIdByName("Branch A")
                }
            );

            const datasetId3 = await createTestDatasetByUser(
                DEFAULT_ADMIN_USER_ID,
                undefined,
                {
                    ownerId: DEFAULT_ADMIN_USER_ID,
                    orgUnitId: await getOrgUnitIdByName("Branch A"),
                    constraintExemption: true
                }
            );

            // cannot access the dataset with `constraintExemption`=false
            let result = await getRegistryClient(testUserId).getRecord(
                datasetId1
            );
            expect(result).to.be.an.instanceof(ServerError);
            expect((result as ServerError).statusCode).to.equal(404);

            // cannot access the dataset with `constraintExemption` not set
            result = await getRegistryClient(testUserId).getRecord(datasetId2);
            expect(result).to.be.an.instanceof(ServerError);
            expect((result as ServerError).statusCode).to.equal(404);

            // can access the dataset now with `constraintExemption`=true
            result = await getRegistryClient(testUserId).getRecord(datasetId3);
            expect(result).to.not.be.an.instanceof(Error);
            expect(unionToThrowable(result).id).to.equal(datasetId3);

            // --- remove the allow_exemption flag
            await authApiClient.updatePermission(altPermission.id, {
                allow_exemption: false
            });

            // cannot access the dataset with `constraintExemption`=false
            result = await getRegistryClient(testUserId).getRecord(datasetId1);
            expect(result).to.be.an.instanceof(ServerError);
            expect((result as ServerError).statusCode).to.equal(404);

            // cannot access the dataset with `constraintExemption` not set
            result = await getRegistryClient(testUserId).getRecord(datasetId2);
            expect(result).to.be.an.instanceof(ServerError);
            expect((result as ServerError).statusCode).to.equal(404);

            // can NOT access the dataset now with `constraintExemption`=true now (as allow_exemption flag of the permission has been removed)
            result = await getRegistryClient(testUserId).getRecord(datasetId3);
            expect(result).to.be.an.instanceof(ServerError);
            expect((result as ServerError).statusCode).to.equal(404);
        });
    });
});
