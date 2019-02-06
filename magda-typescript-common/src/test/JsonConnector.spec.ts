import { expect } from "chai";
import "mocha";
import * as nock from "nock";
// import * as sinon from "sinon";

import AsyncPage from "../AsyncPage";
// import { AspectDefinition } from "../generated/registry/api";
import AuthRegistryClient from "../registry/AuthorizedRegistryClient";

import JsonConnector, {
    JsonConnectorOptions,
    ConnectorSource,
    JsonConnectorConfigExtraMetaData,
    JsonConnectorConfigPresetAspect
} from "../JsonConnector";
import JsonTransformer, { JsonTransformerOptions } from "src/JsonTransformer";
import ConnectorRecordId from "src/ConnectorRecordId";
import { Record } from "src/generated/registry/api";
// ConnectorSource,

describe("JsonConnector", () => {
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
                    `/records?sourceTagToPreserve=${
                        connector.sourceTag
                    }&sourceId=${connector.source.id}`
                )
                .reply(201, { count: 1 });

            return connector.run().then(result => {
                scope.done();
                expect(result.recordsTrimmed).to.equal(1);
                expect(result.trimStillProcessing).to.be.false;
            });
        });

        it("accepts a 202 Accepted status from the registry when deleting", () => {
            const { scope, connector } = setupCrawlTest();

            scope.put(new RegExp("/records")).reply(200);
            scope.delete(/.*/).reply(202);

            return connector.run().then(result => {
                scope.done();

                expect(result.trimStillProcessing).to.be.true;
            });
        });

        it("Will add aspect to all records according to `presetAspects` config", () => {
            const randomValue = Math.random();
            const { scope, connector } = setupCrawlTest({
                presetRecordAspects: [
                    {
                        id: "test-aspect-id",
                        data: {
                            "test-aspect-data": randomValue
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

            return connector.run().then(result => {
                scope.done();
                receivedRecords.forEach(record => {
                    expect(record.aspects).to.have.deep.property(
                        "test-aspect-id",
                        {
                            "test-aspect-data": randomValue
                        }
                    );
                });
            });
        });

        it("Will only add aspect to all dataset records if the `presetAspects` config specifies `recordType`", () => {
            const randomValue = Math.random();
            const { scope, connector } = setupCrawlTest({
                presetRecordAspects: [
                    {
                        id: "test-aspect-id",
                        recordType: "Dataset",
                        data: {
                            "test-aspect-data": randomValue
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

            return connector.run().then(result => {
                scope.done();
                receivedRecords.forEach(record => {
                    expect(record.aspects).to.have.deep.property(
                        "test-aspect-id",
                        {
                            "test-aspect-data": randomValue
                        }
                    );
                });
            });
        });

        function setupCrawlTest(config: FakeConnectorSourceConfig = {}) {
            const scope = nock("http://example.com");

            const registry = new AuthRegistryClient({
                baseUrl: "http://example.com",
                jwtSecret: "squirrel",
                userId: "1",
                maxRetries: 0
            });

            const source = new FakeConnectorSource(config);

            const transformer: JsonTransformer = new FakeJsonTransformer(
                {} as JsonTransformerOptions
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
        return "name";
    }
    getNameFromJsonDataset(jsonDataset: any): string {
        return "name";
    }
    getNameFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return "name";
    }
}

type FakeConnectorSourceConfig = {
    extras?: JsonConnectorConfigExtraMetaData;
    presetRecordAspects?: JsonConnectorConfigPresetAspect[];
};

class FakeConnectorSource implements ConnectorSource {
    readonly id: string = "id";
    readonly name: string = "name";
    readonly hasFirstClassOrganizations: boolean = false;
    presetRecordAspects: JsonConnectorConfigPresetAspect[] = null;
    extras: JsonConnectorConfigExtraMetaData = null;

    constructor(config: FakeConnectorSourceConfig = {}) {
        if (config.extras) {
            this.extras = config.extras;
        }
        if (config.presetRecordAspects) {
            this.presetRecordAspects = config.presetRecordAspects;
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
                blah: "blah"
            },
            {
                blah: "blah"
            }
        ]);
    }
    getJsonFirstClassOrganizations(): AsyncPage<any[]> {
        return AsyncPage.single([
            {
                blah: "blah"
            }
        ]);
    }
    getJsonDistributions(): AsyncPage<any[]> {
        return AsyncPage.single([
            {
                blah: "blah"
            }
        ]);
    }
    getJsonDatasetPublisher(dataset: any): Promise<any> {
        return Promise.resolve();
    }
}
