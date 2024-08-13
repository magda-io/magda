import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner.js";
import partial from "lodash/partial.js";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient.js";
import {
    AUTHENTICATED_USERS_ROLE_ID,
    DEFAULT_ADMIN_USER_ID
} from "magda-typescript-common/src/authorization-api/constants.js";
import {
    createOrgUnits,
    getRegistryClient as getRegistryClientWithJwtSecret,
    getOrgUnitIdByName as getOrgUnitIdByNameWithAuthApiClient,
    createTestDatasetByUser as createTestDatasetByUserWithAuthApiClientJwtSecret,
    createTestDistributionByUser as createTestDistributionByUserWithAuthApiClientJwtSecret
} from "./testUtils.js";
import urijs from "urijs";
import buildJwt from "magda-typescript-common/src/session/buildJwt.js";
import IndexerApiClient from "magda-typescript-common/src/IndexerApiClient.js";
import fetchRequest from "magda-typescript-common/src/fetchRequest.js";
import Try from "magda-typescript-common/src/Try.js";

const ENV_SETUP_TIME_OUT = 1800000; // -- 30 mins
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
const createTestDistributionByUser = partial(
    createTestDistributionByUserWithAuthApiClientJwtSecret,
    authApiClient,
    jwtSecret
);
const getOrgUnitIdByName = partial(
    getOrgUnitIdByNameWithAuthApiClient,
    authApiClient
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

describe("search api auth integration tests", function (this) {
    this.timeout(ENV_SETUP_TIME_OUT);

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

    it("should index accessControl aspect for both datasets & distributions", async () => {
        const sectionAId = await getOrgUnitIdByName("Section A");
        const sectionBId = await getOrgUnitIdByName("Section B");
        const sectionCId = await getOrgUnitIdByName("Section C");
        const testUser = await authApiClient.createUser({
            displayName: "Test User",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4()
        });
        const testUserId = testUser.id;
        console.log(testUserId);

        const dist1 = await createTestDistributionByUser(
            DEFAULT_ADMIN_USER_ID,
            {
                orgUnitId: sectionBId
            }
        );
        const dist2 = await createTestDistributionByUser(
            DEFAULT_ADMIN_USER_ID,
            {
                orgUnitId: sectionCId
            }
        );
        const datasetId = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            {
                aspects: {
                    "dcat-dataset-strings": {
                        title: "test dataset"
                    },
                    "dataset-distributions": {
                        distributions: [dist1, dist2]
                    }
                }
            } as any,
            {
                orgUnitId: sectionAId
            }
        );

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        // admin user should be able to see it
        let r = await Try(getDataset(datasetId, DEFAULT_ADMIN_USER_ID));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(1);
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);
        // search api should removed accessControl aspect informaiton from the dataset
        expect(r.value?.dataSets?.[0]?.accessControl).to.be.undefined;
        expect(r.value?.dataSets?.[0]?.distributions?.length).to.to.equal(2);
        const dists = r.value.dataSets[0].distributions;
        // search api should removed accessControl aspect informaiton from the distributions
        dists.forEach(
            (dist: any) => expect(dist?.accessControl).to.be.undefined
        );
    });

    it("should allow anonymous users & users with only authenticated users role to access published public datasets that are not assigned to any orgUnits", async () => {
        const testUser = await authApiClient.createUser({
            displayName: "Test User",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4()
        });
        const testUserId = testUser.id;

        const datasetId = await createTestDatasetByUser(DEFAULT_ADMIN_USER_ID, {
            aspects: {
                "dcat-dataset-strings": {
                    title: "test dataset"
                }
            }
        } as any);

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId));
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

    it("should not allow anonymous users & users with only authenticated users role to access published datasets that are assigned to an orgUnit", async () => {
        const sectionBId = await getOrgUnitIdByName("Section B");

        // create a published dataset
        const datasetId = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            {
                aspects: {
                    "dcat-dataset-strings": {
                        title: "test dataset"
                    },
                    publishing: {
                        state: "published"
                    }
                }
            } as any,
            {
                orgUnitId: sectionBId
            }
        );

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        // admin user should be able to see it
        let r = await Try(getDataset(datasetId, DEFAULT_ADMIN_USER_ID));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(1);
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);

        // anonymous users can't see it as it's assigned to an org unit
        r = await Try(getDataset(datasetId));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(0);

        // user with only authenticated users role can't see it as it's assigned to an org unit (and this users has not assigned to any org unit)
        const testUser = await authApiClient.createUser({
            displayName: "Test User",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4()
        });
        r = await Try(getDataset(datasetId, testUser.id));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(0);

        // a user assigned to Branch B (a parent node of Section B) can see this dataset
        const branchBId = await getOrgUnitIdByName("Branch B");
        const testUser2 = await authApiClient.createUser({
            displayName: "Test User 2",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4(),
            orgUnitId: branchBId
        });
        r = await Try(getDataset(datasetId, testUser2.id));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(1);
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);
    });

    it("should allow anonymous users & users with only authenticated users role to access published datasets that are assigned to an orgUnit with constraintExemption", async () => {
        const sectionBId = await getOrgUnitIdByName("Section B");

        // create a published dataset
        const datasetId = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            {
                aspects: {
                    "dcat-dataset-strings": {
                        title: "test dataset"
                    },
                    publishing: {
                        state: "published"
                    }
                }
            } as any,
            {
                orgUnitId: sectionBId,
                constraintExemption: true
            }
        );

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        // admin user should be able to see it
        let r = await Try(getDataset(datasetId, DEFAULT_ADMIN_USER_ID));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(1);
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);

        // anonymous users can see it now as it has `constraintExemption` enabled (even through assigned to an org unit)
        r = await Try(getDataset(datasetId));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(1);
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);

        // user with only authenticated users role can see it now as it has `constraintExemption` enabled (even through assigned to an org unit)
        const testUser = await authApiClient.createUser({
            displayName: "Test User",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4()
        });
        r = await Try(getDataset(datasetId, testUser.id));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(1);
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);

        // a user assigned to Branch B (a parent node of Section B) can see this dataset
        const branchBId = await getOrgUnitIdByName("Branch B");
        const testUser2 = await authApiClient.createUser({
            displayName: "Test User 2",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4(),
            orgUnitId: branchBId
        });
        r = await Try(getDataset(datasetId, testUser2.id));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(1);
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);

        // a user assigned to Branch A can't see this dataset when permission allowExemption = false
        const branchAId = await getOrgUnitIdByName("Branch A");
        const testUser3 = await authApiClient.createUser({
            displayName: "Test User 3",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4(),
            orgUnitId: branchAId
        });
        await authApiClient.deleteUserRoles(testUser3.id, [
            AUTHENTICATED_USERS_ROLE_ID
        ]);
        const role = await authApiClient.createRole(
            "a test role has the permission to read published datasets"
        );
        const permission = await authApiClient.createRolePermission(role.id, {
            name:
                "a test permission has the permission to read published datasets",
            description:
                "a test permission has the permission to read published datasets",
            resourceUri: "object/dataset/published",
            operationUris: ["object/dataset/published/read"],
            allow_exemption: false,
            user_ownership_constraint: true,
            org_unit_ownership_constraint: true,
            pre_authorised_constraint: false
        });
        await authApiClient.addUserRoles(testUser3.id, [role.id]);

        r = await Try(getDataset(datasetId, testUser3.id));
        expect(r.error).to.not.be.an.instanceof(Error);
        // cann't see the dataset as allow_exemption = false
        expect(r.value.hitCount).to.equal(0);

        // can see dataset now once allow_exemption = true
        await authApiClient.updatePermission(permission.id, {
            allow_exemption: true
        });
        r = await Try(getDataset(datasetId, testUser3.id));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(1);
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);
    });

    it("should only allow a user that is grant pre-authorised permission to datasets that are explicitly associated with the permission", async () => {
        const role = await authApiClient.createRole(
            "a test role as the container of the pre-authorised permission"
        );
        const permission = await authApiClient.createRolePermission(role.id, {
            name: uuidV4(),
            description: "a pre-authorised permission",
            resource_id: (
                await authApiClient.getResourceByUri("object/dataset/published")
            ).id,
            user_ownership_constraint: false,
            org_unit_ownership_constraint: false,
            pre_authorised_constraint: true,
            operationIds: [
                (
                    await authApiClient.getOperationByUri(
                        "object/dataset/published/read"
                    )
                ).id
            ]
        });

        // create a published dataset
        // assigned to section B (test orgUnit tree structure can be found in testUtils.ts)
        const sectionBId = await getOrgUnitIdByName("Section B");
        const datasetId = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            {
                aspects: {
                    "dcat-dataset-strings": {
                        title: "test dataset"
                    },
                    publishing: {
                        state: "published"
                    }
                }
            } as any,
            {
                orgUnitId: sectionBId
            }
        );

        // force reindex the dataset to search engine
        let indexResult = await Try(indexerApiClient.indexDataset(datasetId));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        // a user assigned to Branch A cannot see this dataset
        // as branch A & Section B are on different branches (there is no path between the two nodes)
        // (test orgUnit tree structure can be found in testUtils.ts)
        const branchAId = await getOrgUnitIdByName("Branch A");
        const testUser = await authApiClient.createUser({
            displayName: "Test User",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4(),
            orgUnitId: branchAId
        });

        let r = await Try(getDataset(datasetId, testUser.id));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(0);

        // update dataset to explicitly associated the dataset with the permission
        r = await Try(
            getRegistryClient(DEFAULT_ADMIN_USER_ID).patchRecordAspect(
                datasetId,
                "access-control",
                [
                    {
                        op: "add",
                        path: "/preAuthorisedPermissionIds",
                        value: [permission.id]
                    }
                ]
            )
        );
        expect(r.error).to.not.be.an.instanceof(Error);

        // force reindex the dataset to search engine again
        indexResult = await Try(indexerApiClient.indexDataset(datasetId));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        // assign the pre-authorised permission to the test user
        await authApiClient.addUserRoles(testUser.id, [role.id]);

        // the test user can now see the dataset
        r = await Try(getDataset(datasetId, testUser.id));
        expect(r.error).to.not.be.an.instanceof(Error);
        expect(r.value.hitCount).to.equal(1);
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId);
    });
});
