import { expect } from "chai";
import "mocha";
import nock from "nock";
// import sinon from "sinon";

import AsyncPage from "../AsyncPage.js";
// import { AspectDefinition } from "../generated/registry/api";
import AuthRegistryClient from "../registry/AuthorizedRegistryClient.js";

import JsonConnector, {
    JsonConnectorOptions,
    ConnectorSource,
    JsonConnectorConfigExtraMetaData,
    JsonConnectorConfigPresetAspect
} from "../JsonConnector.js";
import JsonTransformer, { JsonTransformerOptions } from "../JsonTransformer.js";
import ConnectorRecordId from "../ConnectorRecordId.js";
import { Record } from "../generated/registry/api.js";

// ConnectorSource,

describe("JsonConnector", () => {
    before(() => {
        nock.disableNetConnect();
    });

    after(() => {
        nock.enableNetConnect();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    const tenant_id_1 = 1;

    describe("crawlTag", () => {
        it("auto-generates a tag that is distinct between instances by default", () => {
            for (let i: number = 0; i < 100; i++) {
                const connectorA = new JsonConnector({
                    source: {
                        // --- id & name is compulsory
                        id: "xxx",
                        name: "xxx"
                    }
                } as JsonConnectorOptions);
                const connectorB = new JsonConnector({
                    source: {
                        // --- id & name is compulsory
                        id: "xxx",
                        name: "xxx"
                    }
                } as JsonConnectorOptions);

                expect(connectorA.sourceTag).not.to.equal(connectorB.sourceTag);
            }
        });

        it("accepts an overridden tag", () => {
            const tag = "blah";
            const connector = new JsonConnector({
                source: {
                    // --- id & name is compulsory
                    id: "xxx",
                    name: "xxx"
                },
                sourceTag: tag
            } as JsonConnectorOptions);
            expect(connector.sourceTag).to.equal(tag);
        });

        it("applies the tag to datasets", () => {
            const { scope, connector } = setupCrawlTest();

            scope
                .put(new RegExp("/records"), (body: any) => {
                    return body.sourceTag === connector.sourceTag;
                })
                .times(4)
                .reply(200);

            scope.delete(/.*/).reply(201, { count: 0 });

            return connector.run().then(() => {
                scope.done();
            });
        });

        it("trims with its id and crawltag at the end of a run", () => {
            const { scope, connector } = setupCrawlTest();

            scope.put(new RegExp("/records")).reply(200);

            scope
                .delete(
                    `/records?sourceTagToPreserve=${connector.sourceTag}&sourceId=${connector.source.id}`
                )
                .reply(201, { count: 1 });

            return connector.run().then((result) => {
                scope.done();
                expect(result.recordsTrimmed).to.equal(1);
                expect(result.trimStillProcessing).to.be.false;
            });
        });

        it("accepts a 202 Accepted status from the registry when deleting", () => {
            const { scope, connector } = setupCrawlTest();

            scope.put(new RegExp("/records")).reply(200);
            scope.delete(/.*/).reply(202);

            return connector.run().then((result) => {
                scope.done();

                expect(result.trimStillProcessing).to.be.true;
            });
        });

        it("Will add aspect to all records according to `presetAspects` config", () => {
            const randomValue = Math.random().toString();
            const { scope, connector } = setupCrawlTest({
                presetRecordAspects: [
                    {
                        id: "test-aspect-id",
                        data: {
                            "test-aspect-data1": randomValue
                        }
                    }
                ]
            });
            const receivedRecords: Record[] = [];

            scope
                .persist()
                .put(new RegExp("/records"))
                .reply(200, (uri: string, requestBody: any) => {
                    receivedRecords.push(requestBody);
                });
            scope.delete(/.*/).reply(202);

            return connector.run().then((result) => {
                scope.done();
                receivedRecords.forEach((record) => {
                    expect(record.aspects).to.have.deep.property(
                        "test-aspect-id",
                        {
                            "test-aspect-data1": randomValue
                        }
                    );
                });
            });
        });

        it("Will only add aspect to all dataset records if the `presetAspects` config specifies `recordType`", () => {
            const randomValue = Math.random().toString();
            const { scope, connector } = setupCrawlTest({
                presetRecordAspects: [
                    {
                        id: "test-aspect-id",
                        recordType: "Dataset",
                        data: {
                            "test-aspect-data1": randomValue
                        }
                    }
                ]
            });
            const receivedRecords: Record[] = [];

            scope
                .persist()
                .put(new RegExp("/records"))
                .reply(200, (uri: string, requestBody: any) => {
                    receivedRecords.push(requestBody);
                });
            scope.delete(/.*/).reply(202);

            return connector.run().then((result) => {
                scope.done();
                receivedRecords.forEach((record) => {
                    if (record.id.indexOf("ds-") === 0) {
                        expect(record.aspects).to.have.deep.property(
                            "test-aspect-id",
                            {
                                "test-aspect-data1": randomValue
                            }
                        );
                    } else {
                        expect(record.aspects).to.not.have.property(
                            "test-aspect-id"
                        );
                    }
                });
            });
        });

        const testAspectJsonSchema = {
            $schema: "http://json-schema.org/schema#",
            title: "Test Json Schema",
            type: "object",
            properties: {
                "test-aspect-data1": {
                    title: "test-aspect-data1",
                    type: "string",
                    tenantId: tenant_id_1
                },
                "test-aspect-data2": {
                    title: "test-aspect-data2",
                    type: "string",
                    tenantId: tenant_id_1
                }
            }
        };

        it('By default (`opType` === "MERGE_LEFT"), `presetAspects` should be overwritten by records aspects before added to records', () => {
            const randomValue1 = Math.random().toString();
            const randomValue2 = Math.random().toString();
            const datasetRandomValue1 = Math.random().toString();
            const { scope, connector } = setupCrawlTest(
                {
                    presetRecordAspects: [
                        {
                            id: "test-aspect-id",
                            data: {
                                "test-aspect-data1": randomValue1,
                                "test-aspect-data2": randomValue2
                            }
                        }
                    ]
                },
                {
                    // --- transformer options:
                    sourceId: "connector-id",
                    tenantId: tenant_id_1,
                    datasetAspectBuilders: [
                        {
                            aspectDefinition: {
                                id: "test-aspect-id",
                                name: "test-aspect-id",
                                jsonSchema: testAspectJsonSchema
                            },
                            builderFunctionString: `return {"test-aspect-data1":"${datasetRandomValue1}"};`
                        }
                    ]
                }
            );
            const receivedRecords: Record[] = [];

            scope
                .persist()
                .put(new RegExp("/records"))
                .reply(200, (uri: string, requestBody: any) => {
                    receivedRecords.push(requestBody);
                });
            scope.delete(/.*/).reply(202);

            return connector.run().then((result) => {
                scope.done();
                receivedRecords.forEach((record) => {
                    if (record.id.indexOf("ds-") === 0) {
                        expect(record.aspects).to.have.deep.property(
                            "test-aspect-id",
                            {
                                // --- Dataset record's value should be kept for the first property:
                                "test-aspect-data1": datasetRandomValue1,
                                "test-aspect-data2": randomValue2
                            }
                        );
                    } else {
                        expect(record.aspects).to.have.deep.property(
                            "test-aspect-id",
                            {
                                "test-aspect-data1": randomValue1,
                                "test-aspect-data2": randomValue2
                            }
                        );
                    }
                });
            });
        });

        it("Will add extra data to source aspects", () => {
            const randomValue = Math.random().toString();
            const { scope, connector } = setupCrawlTest({
                extras: {
                    testData: randomValue
                }
            });
            const receivedRecords: Record[] = [];

            scope
                .persist()
                .put(new RegExp("/records"))
                .reply(200, (uri: string, requestBody: any) => {
                    receivedRecords.push(requestBody);
                });
            scope.delete(/.*/).reply(202);

            return connector.run().then((result) => {
                scope.done();
                receivedRecords.forEach((record) => {
                    expect(record.aspects["source"]).to.have.deep.property(
                        "extras",
                        {
                            testData: randomValue
                        }
                    );
                });
            });
        });

        it("Will cralw only one dataset (`blah2-dataset-2`) and one distribution with `customJsFilterCode`", () => {
            const { scope, connector } = setupCrawlTest({
                customJsFilterCode: `if(type === 'Dataset' && jsonData.blah != 'blah2-dataset-2') {
                    return false;
                } else {
                    return true;
                }`
            });
            const receivedRecords: Record[] = [];

            scope
                .persist()
                .put(new RegExp("/records"))
                .reply(200, (uri: string, requestBody: any) => {
                    receivedRecords.push(requestBody);
                });
            scope.delete(/.*/).reply(202);

            return connector.run().then((result) => {
                scope.done();
                expect(receivedRecords.length).to.equal(3);
                const datasets = receivedRecords.filter(
                    (record) => !!record.aspects["dataset-distributions"]
                );
                expect(datasets.length).to.equal(1);
                expect(datasets[0].name).to.equal("blah2-dataset-2");
                const dists = receivedRecords.filter(
                    (record) => !record.aspects["dataset-distributions"]
                );
                expect(dists.length).to.equal(2);
                expect(dists.map((dist) => dist.name)).to.include.members([
                    "blah-dist-1",
                    "blah-dist-2"
                ]);
            });
        });

        it("Will cralw only one dataset (`blah2-dataset-1`) with `customJsFilterCode`", () => {
            const { scope, connector } = setupCrawlTest({
                customJsFilterCode: `if(type === 'Dataset' && jsonData.blah != 'blah-dataset-1') {
                    return false;
                } else if(type === 'Distribution' && jsonData.blah != 'blah-dist-2') {
                    return false;
                }else {
                    return true;
                }`
            });
            const receivedRecords: Record[] = [];

            scope
                .persist()
                .put(new RegExp("/records"))
                .reply(200, (uri: string, requestBody: any) => {
                    receivedRecords.push(requestBody);
                });
            scope.delete(/.*/).reply(202);

            return connector.run().then((result) => {
                scope.done();
                expect(receivedRecords.length).to.equal(2);
                const datasets = receivedRecords.filter(
                    (record) => !!record.aspects["dataset-distributions"]
                );
                expect(datasets.length).to.equal(1);
                expect(datasets[0].name).to.equal("blah-dataset-1");
                const dists = receivedRecords.filter(
                    (record) => !record.aspects["dataset-distributions"]
                );
                expect(dists.length).to.equal(1);
                expect(dists[0].name).to.equal("blah-dist-2");
            });
        });

        function setupCrawlTest(
            config: FakeConnectorSourceConfig = {},
            transformerConfig: JsonTransformerOptions = {} as JsonTransformerOptions
        ) {
            const scope = nock("http://example.com");

            const registry = new AuthRegistryClient({
                baseUrl: "http://example.com",
                jwtSecret: "squirrel",
                userId: "b1fddd6f-e230-4068-bd2c-1a21844f1598",
                maxRetries: 0,
                tenantId: tenant_id_1
            });

            const source = new FakeConnectorSource(config);

            const transformer: JsonTransformer = new FakeJsonTransformer(
                transformerConfig
            );

            const connector = new JsonConnector({
                source,
                transformer,
                registry
            });

            return { scope, registry, source, transformer, connector };
        }
    });
});

class FakeJsonTransformer extends JsonTransformer {
    getIdFromJsonOrganization(
        jsonOrganization: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId("id", "Organization", "source");
    }
    getIdFromJsonDataset(
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId("id", "Dataset", "source");
    }
    getIdFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId("id", "Distribution", "source");
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization?.name ? jsonOrganization.name : "name";
    }
    getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset?.name ? jsonDataset.name : "name";
    }
    getNameFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return jsonDistribution?.name ? jsonDistribution.name : "name";
    }
}

type FakeConnectorSourceConfig = {
    extras?: JsonConnectorConfigExtraMetaData;
    presetRecordAspects?: JsonConnectorConfigPresetAspect[];
    customJsFilterCode?: string;
};

class FakeConnectorSource implements ConnectorSource {
    readonly id: string = "id";
    readonly name: string = "name";
    readonly hasFirstClassOrganizations: boolean = false;
    presetRecordAspects: JsonConnectorConfigPresetAspect[] = null;
    extras: JsonConnectorConfigExtraMetaData = null;
    customJsFilterCode: string = "";

    constructor(config: FakeConnectorSourceConfig = {}) {
        if (config.extras) {
            this.extras = config.extras;
        }
        if (config.presetRecordAspects) {
            this.presetRecordAspects = config.presetRecordAspects;
        }
        if (config.customJsFilterCode) {
            this.customJsFilterCode = config.customJsFilterCode;
        }
    }

    getJsonDataset(id: string): Promise<any> {
        return Promise.resolve();
    }

    searchDatasetsByTitle(title: string, maxResults: number): AsyncPage<any[]> {
        return AsyncPage.single([]);
    }

    getJsonFirstClassOrganization(id: string): Promise<any> {
        return Promise.resolve();
    }

    searchFirstClassOrganizationsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        return AsyncPage.single([]);
    }

    getJsonDatasetPublisherId(dataset: any): string {
        return "id";
    }

    getJsonDatasets(): AsyncPage<any[]> {
        return AsyncPage.single([
            {
                blah: "blah-dataset-1",
                name: "blah-dataset-1"
            },
            {
                blah: "blah2-dataset-2",
                name: "blah2-dataset-2"
            }
        ]);
    }
    getJsonFirstClassOrganizations(): AsyncPage<any[]> {
        return AsyncPage.single([
            {
                blah: "blah-org-1",
                name: "blah-org-1"
            }
        ]);
    }
    getJsonDistributions(): AsyncPage<any[]> {
        return AsyncPage.single([
            {
                blah: "blah-dist-1",
                name: "blah-dist-1"
            },
            {
                blah: "blah-dist-2",
                name: "blah-dist-2"
            }
        ]);
    }
    getJsonDatasetPublisher(dataset: any): Promise<any> {
        return Promise.resolve();
    }
}
