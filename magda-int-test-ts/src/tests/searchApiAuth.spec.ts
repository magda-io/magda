import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner";
import partial from "lodash/partial";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants";
import {
    createOrgUnits,
    getRegistryClient as getRegistryClientWithJwtSecret,
    createTestDatasetByUser as createTestDatasetByUserWithAuthApiClientJwtSecret
} from "./testUtils";
import urijs from "urijs";
import buildJwt from "magda-typescript-common/src/session/buildJwt";
import IndexerApiClient from "magda-typescript-common/src/IndexerApiClient";
import fetchRequest from "magda-typescript-common/src/fetchRequest";
//import delay from "magda-typescript-common/src/delay";
import Try from "magda-typescript-common/src/Try";

const ENV_SETUP_TIME_OUT = 300000; // -- 5 mins
const jwtSecret = uuidV4();
const authApiClient = new AuthApiClient(
    "http://localhost:6104/v0",
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);

const getRegistryClient = partial(getRegistryClientWithJwtSecret, jwtSecret);
const createTestDatasetByUser = partial(
    createTestDatasetByUserWithAuthApiClientJwtSecret,
    authApiClient,
    jwtSecret
);

const indexerApiUrl = "http://localhost:6103/v0";
const indexerApiClient = new IndexerApiClient({
    jwtSecret,
    userId: DEFAULT_ADMIN_USER_ID,
    baseApiUrl: indexerApiUrl
});

const searchApiUrl = "http://localhost:6102/v0";

async function getDataset(datasetId: string, userId?: string) {
    const config: RequestInit = {};
    if (userId) {
        config.headers = {
            "X-Magda-Tenant-Id": "0",
            "X-Magda-Session": buildJwt(jwtSecret, userId)
        };
    } else {
        config.headers = {
            "X-Magda-Tenant-Id": "0"
        };
    }
    return await fetchRequest(
        "get",
        urijs(searchApiUrl)
            .segmentCoded("datasets")
            .search({ query: datasetId })
            .toString(),
        undefined,
        undefined,
        false,
        config
    );
}

// async function addPermissionToUser(
//     userId: string,
//     operationUri: string,
//     constraints?: {
//         ownershipConstraint?: boolean;
//         orgUnitOwnershipConstraint?: boolean;
//         preAuthorisedConstraint?: boolean;
//     },
//     resourceUri?: string
// ) {
//     const runtimeResourceUri = resourceUri
//         ? resourceUri
//         : operationUri.substring(0, operationUri.lastIndexOf("/"));
//     const role = await authApiClient.createRole(uuidV4());
//     const permission = await authApiClient.createRolePermission(role.id, {
//         name: uuidV4(),
//         description: "test permission",
//         resource_id: (await authApiClient.getResourceByUri(runtimeResourceUri))
//             .id,
//         user_ownership_constraint: constraints?.ownershipConstraint
//             ? true
//             : false,
//         org_unit_ownership_constraint: constraints?.orgUnitOwnershipConstraint
//             ? true
//             : false,
//         pre_authorised_constraint: constraints?.preAuthorisedConstraint
//             ? true
//             : false,
//         operationIds: [(await authApiClient.getOperationByUri(operationUri)).id]
//     });
//     await authApiClient.addUserRoles(userId, [role.id]);
//     return permission;
// }

describe("search api auth integration tests", function () {
    const serviceRunner = new ServiceRunner();
    serviceRunner.enableAuthService = true;
    serviceRunner.enableRegistryApi = true;
    serviceRunner.enableIndexer = true;
    serviceRunner.enableSearchApi = true;
    serviceRunner.jwtSecret = jwtSecret;
    serviceRunner.authApiDebugMode = false;

    before(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.create();
        await createOrgUnits(authApiClient);
    });

    after(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.destroy();
    });

    describe("Test Dataset Metadata Creation related Workflow", function (this) {
        this.timeout(300000);

        it("should allow anonymous users & users with only authenticated users role to access published public datasets that are not assigned to any orgUnits", async function (this) {
            const testUser = await authApiClient.createUser({
                displayName: "Test User",
                email: "testuser@test.com",
                source: "internal",
                sourceId: uuidV4()
            });
            const testUserId = testUser.id;

            const datasetId = await createTestDatasetByUser(
                DEFAULT_ADMIN_USER_ID,
                {
                    aspects: {
                        "dcat-dataset-strings": {
                            title: "test dataset"
                        }
                    }
                } as any
            );

            let indexResult = await Try(
                indexerApiClient.indexDataset(datasetId)
            );
            expect(indexResult.error).to.not.be.an.instanceof(Error);
            expect(indexResult.value?.successes).to.equal(1);

            // admin user should be able to see it
            let r = await Try(getDataset(datasetId, DEFAULT_ADMIN_USER_ID));
            expect(r.error).to.not.be.an.instanceof(Error);
            expect(r.value.hitCount).to.equal(1);
            expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);

            // anonymous users can't see it as it's a draft
            r = await Try(getDataset(datasetId));
            expect(r.error).to.not.be.an.instanceof(Error);
            expect(r.value.hitCount).to.equal(0);

            // user with only authenticated users role can't see it as it's a draft
            r = await Try(getDataset(datasetId, testUserId));
            expect(r.error).to.not.be.an.instanceof(Error);
            expect(r.value.hitCount).to.equal(0);

            // update dataset to published one
            r = await Try(
                getRegistryClient(DEFAULT_ADMIN_USER_ID).patchRecordAspect(
                    datasetId,
                    "publishing",
                    [
                        {
                            op: "replace",
                            path: "/state",
                            value: "published"
                        }
                    ]
                )
            );
            expect(r.error).to.not.be.an.instanceof(Error);

            // force indexer to index this dataset now
            indexResult = await Try(indexerApiClient.indexDataset(datasetId));
            expect(indexResult.error).to.not.be.an.instanceof(Error);
            expect(indexResult.value?.successes).to.equal(1);

            // anonymous users can see it now as it's a published dataset and public (not assign to any orgUnit)
            r = await Try(getDataset(datasetId));
            expect(r.error).to.not.be.an.instanceof(Error);
            expect(r.value.hitCount).to.equal(1);
            expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);

            // user with only authenticated users role can see it now as it's a published dataset and public
            r = await Try(getDataset(datasetId, testUserId));
            expect(r.error).to.not.be.an.instanceof(Error);
            expect(r.value.hitCount).to.equal(1);
            expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);
        });
    });
});
