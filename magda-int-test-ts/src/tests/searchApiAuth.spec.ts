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

const ENV_SETUP_TIME_OUT = 1200000; // -- 30 mins
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

async function getDataset(
    query: string,
    userId?: string,
    publishingState?: string
) {
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
            .search({
                query,
                ...(publishingState ? { publishingState } : {})
            })
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
    // Keep this auth suite on the default radial/in-memory search path. The
    // separate searchApi suite also covers quantized on-disk top-k search.
    const hybridConfig = "elasticSearch.indices.datasets.hybridSearch";
    serviceRunner.searchApiConfig = [
        `${hybridConfig}.enabled = true`,
        `${hybridConfig}.knnVectorFieldConfig.mode = "in_memory"`,
        `${hybridConfig}.k = null`,
        `${hybridConfig}.maxDistance = null`,
        `${hybridConfig}.minScore = 0.5`
    ].join("\n");
    const openSearchUrl = `http://${
        serviceRunner.dockerServiceForwardHost || "localhost"
    }:9200`;
    let datasetIndexName: string = "";

    before(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.create();
        await createOrgUnits(authApiClient);
        let resData = await fetchRequest(
            "GET",
            `${openSearchUrl}/_cat/indices?format=json`
        );
        datasetIndexName = resData
            .map((item: any) => item.index)
            .find((indexName: string) => indexName.startsWith("datasets"));
        if (!datasetIndexName) {
            throw new Error("Can't find datasets index");
        }
    });

    after(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.destroy();
    });

    afterEach(async function () {
        await fetchRequest(
            "POST",
            `${openSearchUrl}/${datasetIndexName}/_delete_by_query?refresh=true`,
            {
                query: {
                    match_all: {}
                }
            }
        );
    });

    for (const matchingBranch of ["keyword", "vector"] as const) {
        it(`should not match an accessible dataset through a hidden distribution's ${matchingBranch} content (#3886)`, async () => {
            const query = `issue3886${uuidV4().replace(/-/g, "")}`;
            const sectionBId = await getOrgUnitIdByName("Section B");
            const testUser = await authApiClient.createUser({
                displayName: "Distribution search reader",
                email: "distribution-reader@test.com",
                source: "internal",
                sourceId: uuidV4()
            });
            const queryVector: number[] =
                matchingBranch === "vector"
                    ? (
                          await fetchRequest(
                              "POST",
                              `http://${
                                  serviceRunner.dockerServiceForwardHost ||
                                  "localhost"
                              }:3000/v1/embeddings`,
                              { input: query }
                          )
                      ).data[0].embedding
                    : [];
            if (matchingBranch === "vector") {
                expect(queryVector).to.have.length(768);
                expect(queryVector.every(Number.isFinite)).to.equal(true);
            }

            const fixtures: {
                datasetId: string;
                matchingDistributionId: string;
                siblingId: string;
                state: "draft" | "published" | null;
                restricted: boolean;
            }[] = [];
            for (const visibility of [
                "public",
                "draft",
                "restricted",
                "legacy"
            ] as const) {
                const state =
                    visibility === "legacy"
                        ? null
                        : visibility === "draft"
                        ? "draft"
                        : "published";
                const matchingDistributionId =
                    await createTestDistributionByUser(
                        DEFAULT_ADMIN_USER_ID,
                        visibility === "restricted"
                            ? { orgUnitId: sectionBId }
                            : {},
                        {
                            aspects: {
                                "dcat-distribution-strings": {
                                    title:
                                        matchingBranch === "keyword"
                                            ? query
                                            : "An unrelated distribution",
                                    description: "Distribution metadata"
                                },
                                publishing: { state: state || "published" }
                            }
                        }
                    );
                if (visibility === "legacy") {
                    // Historical connectors omit publishing entirely. Delete it
                    // through Registry before indexing, not from the search
                    // fixture, so real conversion and OPA semantics are covered.
                    const deleted = await getRegistryClient(
                        DEFAULT_ADMIN_USER_ID
                    ).deleteRecordAspect(matchingDistributionId, "publishing");
                    expect(deleted).not.to.be.an.instanceof(Error);
                    expect(deleted).to.have.property("deleted", true);
                }
                const siblingId = await createTestDistributionByUser(
                    DEFAULT_ADMIN_USER_ID,
                    {},
                    {
                        aspects: {
                            "dcat-distribution-strings": {
                                title: "An unrelated accessible sibling",
                                description: "Different distribution metadata"
                            },
                            publishing: { state: "published" }
                        }
                    }
                );
                const datasetId = await createTestDatasetByUser(
                    DEFAULT_ADMIN_USER_ID,
                    {
                        aspects: {
                            "dcat-dataset-strings": {
                                title: "An accessible parent dataset",
                                description: "Unrelated dataset metadata"
                            },
                            "dataset-distributions": {
                                distributions: [
                                    matchingDistributionId,
                                    siblingId
                                ]
                            },
                            publishing: { state: "published" }
                        }
                    } as any,
                    {}
                );
                const result = await indexerApiClient.indexDataset(datasetId);
                expect(result.successes).to.equal(1);
                expect(result.failures).to.equal(0);
                fixtures.push({
                    datasetId,
                    matchingDistributionId,
                    siblingId,
                    state,
                    restricted: visibility === "restricted"
                });
            }

            // Retain real Registry/Indexer-produced access metadata. Modify only
            // vectors in these fixtures so each test isolates one matching branch
            // rather than depending on an embedding model's semantic similarity.
            for (const fixture of fixtures) {
                const indexed = await fetchRequest(
                    "POST",
                    `${openSearchUrl}/${datasetIndexName}/_search`,
                    {
                        query: { term: { identifier: fixture.datasetId } }
                    }
                );
                expect(indexed.hits.hits).to.have.length(1);
                const hit = indexed.hits.hits[0];
                const source = hit._source;
                expect(source.publishingState).to.equal("published");
                expect(source.tenantId).to.equal(0);
                expect(source.accessControl.ownerId).to.equal(
                    DEFAULT_ADMIN_USER_ID
                );
                expect(
                    source.distributions.map((dist: any) => dist.identifier)
                ).to.have.members([
                    fixture.matchingDistributionId,
                    fixture.siblingId
                ]);
                const matching = source.distributions.find(
                    (dist: any) =>
                        dist.identifier === fixture.matchingDistributionId
                );
                expect(matching.publishingState).to.equal(fixture.state);
                expect(matching.accessControl.ownerId).to.equal(
                    DEFAULT_ADMIN_USER_ID
                );
                expect(matching.accessControl.orgUnitId).to.equal(
                    fixture.restricted ? sectionBId : undefined
                );
                expect(source.queryContextVector).to.have.length(768);
                expect(matching.queryContextVector).to.have.length(768);

                await fetchRequest(
                    "POST",
                    `${openSearchUrl}/${datasetIndexName}/_update/${encodeURIComponent(
                        hit._id
                    )}?refresh=true`,
                    {
                        script:
                            matchingBranch === "keyword"
                                ? {
                                      lang: "painless",
                                      source: "ctx._source.remove('queryContextVector'); for (dist in ctx._source.distributions) { dist.remove('queryContextVector'); }"
                                  }
                                : {
                                      lang: "painless",
                                      source: "ctx._source.queryContextVector = params.unrelated; for (dist in ctx._source.distributions) { dist.queryContextVector = dist.identifier == params.matchingId ? params.matching : params.unrelated; }",
                                      params: {
                                          matchingId:
                                              fixture.matchingDistributionId,
                                          matching: queryVector,
                                          // A large l2 distance puts parent/sibling
                                          // vectors safely below minScore=0.5.
                                          unrelated: queryVector.map(
                                              (value) => value + 10
                                          )
                                      }
                                  }
                    }
                );
            }

            const identifiers = (response: any): string[] =>
                response.dataSets.map((dataset: any) => dataset.identifier);
            for (const userId of [undefined, testUser.id]) {
                for (const fixture of fixtures) {
                    const parent = await getDataset(fixture.datasetId, userId);
                    expect(identifiers(parent)).to.include(fixture.datasetId);
                    const returned = parent.dataSets.find(
                        (dataset: any) =>
                            dataset.identifier === fixture.datasetId
                    );
                    // The published parent and unrelated public sibling remain
                    // visible even when its matching distribution is not.
                    expect(
                        returned.distributions.map(
                            (dist: any) => dist.identifier
                        )
                    ).to.include(fixture.siblingId);
                    if (fixture.state === "draft" || fixture.restricted) {
                        expect(
                            returned.distributions.map(
                                (dist: any) => dist.identifier
                            )
                        ).not.to.include(fixture.matchingDistributionId);
                    }
                }
                const response = await getDataset(query, userId, "published");
                const visibleMatches = fixtures.filter(
                    (fixture) =>
                        !fixture.restricted && fixture.state !== "draft"
                );
                expect(response.hitCount).to.equal(visibleMatches.length);
                expect(identifiers(response)).to.have.members(
                    visibleMatches.map((fixture) => fixture.datasetId)
                );
            }

            // Positive controls prove that the hidden records were indexed and
            // do match, and that explicit publishing-state filtering still
            // applies even to administrators with unrestricted OPA decisions.
            const admin = await getDataset(query, DEFAULT_ADMIN_USER_ID, "*");
            expect(admin.hitCount).to.equal(fixtures.length);
            expect(identifiers(admin)).to.have.members(
                fixtures.map((fixture) => fixture.datasetId)
            );
            const publishedAdmin = await getDataset(
                query,
                DEFAULT_ADMIN_USER_ID,
                "published"
            );
            expect(identifiers(publishedAdmin)).to.have.members(
                fixtures
                    .filter((fixture) => fixture.state !== "draft")
                    .map((fixture) => fixture.datasetId)
            );
        });
    }

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
            name: "a test permission has the permission to read published datasets",
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

    it("should let an access group member find records granted by a record-level pre-authorised permission (#3907)", async () => {
        // An access group grants a pre-authorised `object/record/read`
        // permission. Records join the group by listing its permission id in
        // `access-control.preAuthorisedPermissionIds`, so a dataset can be
        // granted without some of its distributions.
        const role = await authApiClient.createRole(
            "a test role as the container of an access group permission"
        );
        const permission = await authApiClient.createRolePermission(role.id, {
            name: uuidV4(),
            description: "an access group permission",
            resource_id: (await authApiClient.getResourceByUri("object/record"))
                .id,
            user_ownership_constraint: false,
            org_unit_ownership_constraint: false,
            pre_authorised_constraint: true,
            operationIds: [
                (await authApiClient.getOperationByUri("object/record/read")).id
            ]
        });

        const token = uuidV4().replace(/-/g, "");
        const datasetQuery = `issue3907dataset${token}`;
        const draftQuery = `issue3907draft${token}`;
        const sectionBId = await getOrgUnitIdByName("Section B");
        const granted = {
            orgUnitId: sectionBId,
            preAuthorisedPermissionIds: [permission.id]
        };

        const grantedDistributionId = await createTestDistributionByUser(
            DEFAULT_ADMIN_USER_ID,
            granted,
            {
                aspects: {
                    "dcat-distribution-strings": {
                        title: "A granted distribution",
                        description: "Distribution metadata"
                    },
                    publishing: { state: "published" }
                }
            }
        );
        // restricted to Section B and not in the group
        const hiddenDistributionId = await createTestDistributionByUser(
            DEFAULT_ADMIN_USER_ID,
            { orgUnitId: sectionBId },
            {
                aspects: {
                    "dcat-distribution-strings": {
                        title: "A distribution outside the group",
                        description: "Distribution metadata"
                    },
                    publishing: { state: "published" }
                }
            }
        );
        const datasetId = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            {
                aspects: {
                    "dcat-dataset-strings": { title: datasetQuery },
                    "dataset-distributions": {
                        distributions: [
                            grantedDistributionId,
                            hiddenDistributionId
                        ]
                    },
                    publishing: { state: "published" }
                }
            } as any,
            granted
        );
        // object/dataset/*/read (no publishingState) covers any state, as
        // object/record/read does; a published-only search doesn't
        const draftDatasetId = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            {
                aspects: {
                    "dcat-dataset-strings": { title: draftQuery },
                    publishing: { state: "draft" }
                }
            } as any,
            granted
        );
        for (const id of [datasetId, draftDatasetId]) {
            const indexResult = await Try(indexerApiClient.indexDataset(id));
            expect(indexResult.error).to.not.be.an.instanceof(Error);
            expect(indexResult.value?.successes).to.equal(1);
        }

        // Branch A and Section B are on different branches
        // (test orgUnit tree structure can be found in testUtils.ts)
        const branchAId = await getOrgUnitIdByName("Branch A");
        const testUser = await authApiClient.createUser({
            displayName: "Access group member",
            email: "access-group-member@test.com",
            source: "internal",
            sourceId: uuidV4(),
            orgUnitId: branchAId
        });

        // compare identifiers, not hit counts: this suite runs hybrid search,
        // so unrelated fixtures may also match by vector similarity
        const findIds = async (query: string, publishingState?: string) => {
            const r = await Try(
                getDataset(query, testUser.id, publishingState)
            );
            expect(r.error).to.not.be.an.instanceof(Error);
            return {
                ids: (r.value?.dataSets || []).map((ds: any) => ds.identifier),
                dataSets: r.value?.dataSets || []
            };
        };

        for (const query of [datasetQuery, draftQuery]) {
            const { ids } = await findIds(query);
            expect(ids).to.not.include(datasetId);
            expect(ids).to.not.include(draftDatasetId);
        }

        // join the access group
        await authApiClient.addUserRoles(testUser.id, [role.id]);

        const published = await findIds(datasetQuery);
        expect(published.ids).to.include(datasetId);
        const dataset = published.dataSets.find(
            (ds: any) => ds.identifier === datasetId
        );
        // the distribution outside the group is not returned with its dataset
        expect(
            (dataset?.distributions || []).map((dist: any) => dist.identifier)
        ).to.have.members([grantedDistributionId]);

        expect((await findIds(draftQuery)).ids).to.include(draftDatasetId);
        expect((await findIds(draftQuery, "published")).ids).to.not.include(
            draftDatasetId
        );
    });
});
