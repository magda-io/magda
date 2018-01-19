import { expect } from "chai";
import "mocha";
import * as nock from "nock";
// import * as sinon from "sinon";

import AsyncPage from "../AsyncPage";
// import { AspectDefinition } from "../generated/registry/api";
import AuthRegistryClient from "../registry/AuthorizedRegistryClient";

import JsonConnector, {
    JsonConnectorOptions,
    ConnectorSource
} from "../JsonConnector";
import JsonTransformer, { JsonTransformerOptions } from "src/JsonTransformer";
import ConnectorRecordId from "src/ConnectorRecordId";
// ConnectorSource,

describe("JsonConnector", () => {
    describe("crawlTag", () => {
        it("auto-generates a tag that is distinct between instances by default", () => {
            for (let i: number = 0; i < 100; i++) {
                const connectorA = new JsonConnector(
                    {} as JsonConnectorOptions
                );
                const connectorB = new JsonConnector(
                    {} as JsonConnectorOptions
                );

                expect(connectorA.sourceTag).not.to.equal(connectorB.sourceTag);
            }
        });

        it("accepts an overridden tag", () => {
            const tag = "blah";
            const connector = new JsonConnector({
                sourceTag: tag
            } as JsonConnectorOptions);
            expect(connector.sourceTag).to.equal(tag);
        });

        it("applies the tag to datasets", () => {
            const scope = nock("http://example.com");

            const registry = new AuthRegistryClient({
                baseUrl: "http://example.com",
                jwtSecret: "squirrel",
                userId: "1",
                maxRetries: 0
            });

            const source = new FakeConnectorSource();

            const transformer: JsonTransformer = new FakeJsonTransformer(
                {} as JsonTransformerOptions
            );

            const connector = new JsonConnector({
                source,
                transformer,
                registry
            });

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
    });

    describe("trim", () => {
        it("trims with its id and crawltag at the end of a run", () => {});
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

class FakeConnectorSource implements ConnectorSource {
    readonly id: string = "id";
    readonly name: string = "name";
    readonly hasFirstClassOrganizations: boolean = false;

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
