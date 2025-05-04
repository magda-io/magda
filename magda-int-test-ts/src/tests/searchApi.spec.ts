import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner.js";
import partial from "lodash/partial.js";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient.js";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants.js";
import {
    createOrgUnits,
    getOrgUnitIdByName as getOrgUnitIdByNameWithAuthApiClient,
    createTestDatasetByUser as createTestDatasetByUserWithAuthApiClientJwtSecret
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

const createTestDatasetByUser = partial(
    createTestDatasetByUserWithAuthApiClientJwtSecret,
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
const openSearchUrl = "http://localhost:9200";

async function searchDataset(q: string, userId?: string) {
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
            .search({ query: q })
            .toString(),
        undefined,
        undefined,
        false,
        config
    );
}

describe("search api hybrid integration tests [in_memory]", function (this) {
    this.timeout(ENV_SETUP_TIME_OUT);

    const serviceRunner = new ServiceRunner();
    serviceRunner.enableAuthService = true;
    serviceRunner.enableRegistryApi = true;
    serviceRunner.enableIndexer = true;
    serviceRunner.enableSearchApi = true;
    serviceRunner.jwtSecret = jwtSecret;
    serviceRunner.authApiDebugMode = false;
    serviceRunner.searchApiDebugMode = false;

    const prefix = "elasticSearch.indices.datasets.hybridSearch";
    const lines = [
        `${prefix}.enabled = true`,
        `${prefix}.knnVectorFieldConfig.mode = "in_memory"`,
        `${prefix}.knnVectorFieldConfig.dimension = 768`,
        `${prefix}.knnVectorFieldConfig.spaceType = "l2"`,
        `${prefix}.knnVectorFieldConfig.efConstruction = 100`,
        `${prefix}.knnVectorFieldConfig.efSearch = 100`,
        `${prefix}.knnVectorFieldConfig.m = 16`,
        `${prefix}.k = null`,
        `${prefix}.minScore = 0.5`,
        `${prefix}.knnVectorFieldConfig.compressionLevel = null`,
        `${prefix}.knnVectorFieldConfig.encoder.name = "sq"`,
        `${prefix}.knnVectorFieldConfig.encoder.type = "fp16"`,
        `${prefix}.knnVectorFieldConfig.encoder.clip = false`
    ];
    serviceRunner.searchApiConfig = lines.join("\n");

    let datasetIndexName: string = "";
    let testUserId: string = "";
    // user will be set to branch B
    let branchBId: string = "";
    // dataset will be set to section C
    let sectionCId: string = "";
    const datasets: any[] = [
        {
            aspects: {
                "dcat-dataset-strings": {
                    title: "a good milk chocolate receipt",
                    description: `Milk chocolate is a type of chocolate that is made from a blend of cocoa solids, cocoa butter, sugar, and milk or milk powder. Unlike dark chocolate, which has a higher percentage of cocoa solids and little to no milk content, milk chocolate contains a significant amount of milk, giving it a creamier texture and a sweeter, milder flavor. Milk chocolate typically has a lower cocoa content (often between 10% to 50%) compared to dark chocolate. It is commonly used in candy bars, confections, and various desserts.`
                },
                publishing: {
                    state: "published"
                },
                "access-control": {
                    orgUnitId: sectionCId
                }
            }
        },
        {
            aspects: {
                "dcat-dataset-strings": {
                    title: "a good chocolate milk receipt",
                    description: `Chocolate milk is a sweetened, flavored milk beverage that is made by mixing milk (usually cow's milk) with cocoa powder or chocolate syrup and often sugar. The drink can be served cold or hot and is popular as both a refreshing treat and a comfort beverage. Chocolate milk can be made at home or purchased pre-mixed in bottles or cartons. Some versions also include additional ingredients like vanilla extract or stabilizers to improve texture and flavor.`
                },
                publishing: {
                    state: "published"
                },
                "access-control": {
                    orgUnitId: sectionCId
                }
            }
        },
        {
            aspects: {
                "dcat-dataset-strings": {
                    title: "sydney water revenue report",
                    description:
                        "The Sydney Water Revenue Report is a quarterly report that provides information on the revenue collected by Sydney Water. The report ID is RS2SDW2S."
                },
                publishing: {
                    state: "published"
                },
                "access-control": {
                    orgUnitId: sectionCId
                }
            }
        }
    ];

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

        branchBId = await getOrgUnitIdByName("Branch B");
        sectionCId = await getOrgUnitIdByName("Section C");

        const testUser = await authApiClient.createUser({
            displayName: "Test User",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4(),
            orgUnitId: branchBId
        });
        testUserId = testUser.id;
    });

    after(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.destroy();
    });

    beforeEach(async function () {
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

    it("should rank chocolate milk over milk chocolate and not return irrelevant result when searching `chocolate milk`", async () => {
        const datasetId1 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[0]
        );
        const datasetId2 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[1]
        );
        const datasetId3 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[2]
        );

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId3));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId1));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId2));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        let r = await Try(searchDataset("chocolate milk", testUserId));
        expect(r.error).to.not.be.an.instanceof(Error);
        console.log("test 1 Original datasets: ", [
            datasetId1,
            datasetId2,
            datasetId3
        ]);
        console.log(
            "test 1 Search result: ",
            r.value?.dataSets.map((d: any) => d.identifier)
        );
        console.log("test 1 Search result data: ", r.value?.dataSets);
        // we should get chocolate milk dataset first, then milk chocolate dataset
        // the third dataset is not relevant but it will be returned as the last result with very low score
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId2);
        expect(r.value?.dataSets?.[1]?.identifier).to.equal(datasetId1);
        // should only find 2 relevant datasets
        expect(r.value?.dataSets?.length).to.equal(2);
    });

    it("should rank milk chocolate over chocolate milk and not return irrelevant result when searching `milk chocolate`", async () => {
        const datasetId1 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[0]
        );
        const datasetId2 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[1]
        );
        const datasetId3 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[2]
        );

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId3));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId2));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId1));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        let r = await Try(searchDataset("milk chocolate", testUserId));
        expect(r.error).to.not.be.an.instanceof(Error);
        console.log("test 2 Original datasets: ", [
            datasetId1,
            datasetId2,
            datasetId3
        ]);
        console.log(
            "test 2 Search result: ",
            r.value?.dataSets.map((d: any) => d.identifier)
        );
        console.log("test 2 Search result data: ", r.value?.dataSets);
        // first one should be the milk chocolate  dataset
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId1);
        expect(r.value?.dataSets?.[1]?.identifier).to.equal(datasetId2);
        // should only find 2 relevant datasets
        expect(r.value?.dataSets?.length).to.equal(2);
    });

    it("should be able to searching keyword without semantic meaning `RS2SDW2S`", async () => {
        const datasetId1 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[0]
        );
        const datasetId2 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[1]
        );
        const datasetId3 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[2]
        );

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId3));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId2));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId1));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        let r = await Try(searchDataset("RS2SDW2S", testUserId));
        expect(r.error).to.not.be.an.instanceof(Error);
        console.log("test 3 Original datasets: ", [
            datasetId1,
            datasetId2,
            datasetId3
        ]);
        console.log(
            "test 3 Search result: ",
            r.value?.dataSets.map((d: any) => d.identifier)
        );
        console.log("test 3 Search result data: ", r.value?.dataSets);
        // first one should be the sydney report dataset
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId3);
        // should only find 1 relevant datasets
        expect(r.value?.dataSets?.length).to.equal(1);
    });
});

describe("search api hybrid integration tests [on_disk]", function (this) {
    this.timeout(ENV_SETUP_TIME_OUT);

    const serviceRunner = new ServiceRunner();
    serviceRunner.enableAuthService = true;
    serviceRunner.enableRegistryApi = true;
    serviceRunner.enableIndexer = true;
    serviceRunner.enableSearchApi = true;
    serviceRunner.jwtSecret = jwtSecret;
    serviceRunner.authApiDebugMode = false;
    serviceRunner.searchApiDebugMode = false;

    const prefix = "elasticSearch.indices.datasets.hybridSearch";
    const lines = [
        `${prefix}.enabled = true`,
        `${prefix}.knnVectorFieldConfig.mode = "on_disk"`,
        `${prefix}.knnVectorFieldConfig.dimension = 768`,
        `${prefix}.knnVectorFieldConfig.spaceType = "l2"`,
        `${prefix}.knnVectorFieldConfig.efConstruction = 100`,
        `${prefix}.knnVectorFieldConfig.efSearch = 100`,
        `${prefix}.knnVectorFieldConfig.m = 16`,
        `${prefix}.k = 100`,
        `${prefix}.minScore = null`,
        `${prefix}.knnVectorFieldConfig.compressionLevel = "32x"`,
        `${prefix}.knnVectorFieldConfig.encoder.name = null`,
        `${prefix}.knnVectorFieldConfig.encoder.type = null`,
        `${prefix}.knnVectorFieldConfig.encoder.clip = null`
    ];
    serviceRunner.searchApiConfig = lines.join("\n");

    let datasetIndexName: string = "";
    let testUserId: string = "";
    // user will be set to branch B
    let branchBId: string = "";
    // dataset will be set to section C
    let sectionCId: string = "";
    const datasets: any[] = [
        {
            aspects: {
                "dcat-dataset-strings": {
                    title: "a good milk chocolate receipt",
                    description: `Milk chocolate is a type of chocolate that is made from a blend of cocoa solids, cocoa butter, sugar, and milk or milk powder. Unlike dark chocolate, which has a higher percentage of cocoa solids and little to no milk content, milk chocolate contains a significant amount of milk, giving it a creamier texture and a sweeter, milder flavor. Milk chocolate typically has a lower cocoa content (often between 10% to 50%) compared to dark chocolate. It is commonly used in candy bars, confections, and various desserts.`
                },
                publishing: {
                    state: "published"
                },
                "access-control": {
                    orgUnitId: sectionCId
                }
            }
        },
        {
            aspects: {
                "dcat-dataset-strings": {
                    title: "a good chocolate milk receipt",
                    description: `Chocolate milk is a sweetened, flavored milk beverage that is made by mixing milk (usually cow's milk) with cocoa powder or chocolate syrup and often sugar. The drink can be served cold or hot and is popular as both a refreshing treat and a comfort beverage. Chocolate milk can be made at home or purchased pre-mixed in bottles or cartons. Some versions also include additional ingredients like vanilla extract or stabilizers to improve texture and flavor.`
                },
                publishing: {
                    state: "published"
                },
                "access-control": {
                    orgUnitId: sectionCId
                }
            }
        },
        {
            aspects: {
                "dcat-dataset-strings": {
                    title: "sydney water revenue report",
                    description:
                        "The Sydney Water Revenue Report is a quarterly report that provides information on the revenue collected by Sydney Water. The report ID is RS2SDW2S."
                },
                publishing: {
                    state: "published"
                },
                "access-control": {
                    orgUnitId: sectionCId
                }
            }
        }
    ];

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

        branchBId = await getOrgUnitIdByName("Branch B");
        sectionCId = await getOrgUnitIdByName("Section C");

        const testUser = await authApiClient.createUser({
            displayName: "Test User",
            email: "testuser@test.com",
            source: "internal",
            sourceId: uuidV4(),
            orgUnitId: branchBId
        });
        testUserId = testUser.id;
    });

    after(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.destroy();
    });

    beforeEach(async function () {
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

    it("should rank chocolate milk over milk chocolate and not return irrelevant result when searching `chocolate milk`", async () => {
        const datasetId1 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[0]
        );
        const datasetId2 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[1]
        );
        const datasetId3 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[2]
        );

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId3));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId1));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId2));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        let r = await Try(searchDataset("chocolate milk", testUserId));
        expect(r.error).to.not.be.an.instanceof(Error);
        console.log("test 1 Original datasets: ", [
            datasetId1,
            datasetId2,
            datasetId3
        ]);
        console.log(
            "test 1 Search result: ",
            r.value?.dataSets.map((d: any) => d.identifier)
        );
        console.log("test 1 Search result data: ", r.value?.dataSets);
        // we should get chocolate milk dataset first, then milk chocolate dataset
        // the third dataset is not relevant but it will be returned as the last result with very low score
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId2);
        expect(r.value?.dataSets?.[1]?.identifier).to.equal(datasetId1);
        // should only find 2 relevant datasets; find all datasets in on_disk mode
        expect(r.value?.dataSets?.length).to.equal(datasets.length);
    });

    it("should rank milk chocolate over chocolate milk and not return irrelevant result when searching `milk chocolate`", async () => {
        const datasetId1 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[0]
        );
        const datasetId2 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[1]
        );
        const datasetId3 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[2]
        );

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId3));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId2));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId1));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        let r = await Try(searchDataset("milk chocolate", testUserId));
        expect(r.error).to.not.be.an.instanceof(Error);
        console.log("test 2 Original datasets: ", [
            datasetId1,
            datasetId2,
            datasetId3
        ]);
        console.log(
            "test 2 Search result: ",
            r.value?.dataSets.map((d: any) => d.identifier)
        );
        console.log("test 2 Search result data: ", r.value?.dataSets);
        // first one should be the milk chocolate  dataset
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId1);
        expect(r.value?.dataSets?.[1]?.identifier).to.equal(datasetId2);
        // should only find 2 relevant datasets; find all datasets in on_disk mode
        expect(r.value?.dataSets?.length).to.equal(datasets.length);
    });

    it("should be able to searching keyword without semantic meaning `RS2SDW2S`", async () => {
        const datasetId1 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[0]
        );
        const datasetId2 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[1]
        );
        const datasetId3 = await createTestDatasetByUser(
            DEFAULT_ADMIN_USER_ID,
            datasets[2]
        );

        let indexResult = await Try(indexerApiClient.indexDataset(datasetId3));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId2));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        indexResult = await Try(indexerApiClient.indexDataset(datasetId1));
        expect(indexResult.error).to.not.be.an.instanceof(Error);
        expect(indexResult.value?.successes).to.equal(1);

        let r = await Try(searchDataset("RS2SDW2S", testUserId));
        expect(r.error).to.not.be.an.instanceof(Error);
        console.log("test 3 Original datasets: ", [
            datasetId1,
            datasetId2,
            datasetId3
        ]);
        console.log(
            "test 3 Search result: ",
            r.value?.dataSets.map((d: any) => d.identifier)
        );
        console.log("test 3 Search result data: ", r.value?.dataSets);
        // first one should be the sydney report dataset
        expect(r.value?.dataSets?.[0]?.identifier).to.equal(datasetId3);
        // should only find 1 relevant datasets; find all datasets in on_disk mode
        expect(r.value?.dataSets?.length).to.equal(datasets.length);
    });
});
