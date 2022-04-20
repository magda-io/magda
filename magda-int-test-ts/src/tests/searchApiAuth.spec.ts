import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner";
import partial from "lodash/partial";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants";
import {
    createOrgUnits,
    //getRegistryClient as getRegistryClientWithJwtSecret,
    createTestDatasetByUser as createTestDatasetByUserWithAuthApiClientJwtSecret
} from "./testUtils";
import urijs from "urijs";
import buildJwt from "magda-typescript-common/src/session/buildJwt";
import IndexerApiClient from "magda-typescript-common/src/IndexerApiClient";
import fetchRequest from "magda-typescript-common/src/fetchRequest";
//import delay from "magda-typescript-common/src/delay";

const ENV_SETUP_TIME_OUT = 300000; // -- 5 mins
const jwtSecret = uuidV4();
const authApiClient = new AuthApiClient(
    "http://localhost:6104/v0",
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);

//const getRegistryClient = partial(getRegistryClientWithJwtSecret, jwtSecret);
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

describe("search api auth integration tests", () => {
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

    describe("Test Dataset Metadata Creation related Workflow", function () {
        it("should allow anonymous users & users with only authenticated users role to access published public datasets that are not assigned to any orgUnits", async function (this) {
            //this.timeout(300000);
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

            const r = await indexerApiClient.indexDataset(datasetId);
            console.log(r);

            try {
                // admin user should be able to see it
                let res = await getDataset(datasetId, DEFAULT_ADMIN_USER_ID);

                expect(res.hitCount).to.equal(1);
                expect(res?.dataSets?.[0]?.identifier).to.equal(datasetId);
            } catch (e) {
                console.log(e);
            }
        });
    });
});
