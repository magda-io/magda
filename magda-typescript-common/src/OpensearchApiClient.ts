import { Client } from "@opensearch-project/opensearch";
import { DeleteByQuery_Request } from "@opensearch-project/opensearch/api/_core/deleteByQuery.js";
import { TransportRequestOptions } from "@opensearch-project/opensearch/lib/Transport.js";

export interface OpensearchConfig {
    url?: string;
}

export default class OpensearchApiClient {
    private client: Client;

    constructor(config: OpensearchConfig) {
        this.client = new Client({
            node: config.url
        });
    }

    static async getOpensearchApiClient(
        openSearchConfig: OpensearchConfig
    ): Promise<OpensearchApiClient> {
        const config: OpensearchConfig = {
            url: "http://localhost:9200",
            ...openSearchConfig
        };
        const instance = new OpensearchApiClient(config);
        try {
            await instance.client.ping();
            console.log(`Successfully connected to OpenSearch: ${config.url}`);
        } catch (err) {
            throw new Error(
                `Failed to connect to OpenSearch: ${config.url}, error: ${err}`
            );
        }
        return instance;
    }

    async createIndex(indexDefinition: {
        indexName: string;
        settings?: any;
        mappings?: any;
    }): Promise<void> {
        await this.client.indices.create({
            index: indexDefinition.indexName,
            body: {
                mappings: indexDefinition.mappings,
                settings: indexDefinition.settings
            }
        });

        console.log(`Index created successfully: ${indexDefinition.indexName}`);
    }

    async deleteIndex(indexName: string): Promise<void> {
        await this.client.indices.delete({
            index: indexName,
            ignore_unavailable: true
        });
        console.log(`Index deleted successfully: ${indexName}`);
    }

    async indexExists(indexName: string): Promise<boolean> {
        const { body: exists } = await this.client.indices.exists({
            index: indexName
        });
        return exists;
    }

    async indexDocument(indexName: string, document: any) {
        await this.client.index({
            index: indexName,
            body: document
        });
        console.log(`Document indexed successfully: ${document}`);
    }

    async bulkIndexDocument(indexName: string, documents: any[]) {
        await this.client.helpers
            .bulk({
                datasource: documents,
                onDocument(_) {
                    return { index: { _index: indexName } };
                }
            })
            .then((result) => {
                console.log(
                    `Successfully indexed ${result.successful} documents.`
                );
                if (result.failed > 0) {
                    console.warn(`Failed to index ${result.failed} documents.`);
                }
            });
    }

    async searchDocuments(indexName: string, query: string) {
        const searchResult = await this.client.search({
            index: indexName,
            body: {
                query: {
                    match: {
                        text: query
                    }
                }
            }
        });
        console.log(
            `Search query: ${query}, result: ${JSON.stringify(
                searchResult.body
            )}`
        );
        return searchResult.body;
    }

    async deleteDocument(indexName: string, documentId: string) {
        await this.client.delete({
            index: indexName,
            id: documentId
        });
        console.log(`Document deleted successfully: ${documentId}`);
    }

    async deleteByQuery(
        params: DeleteByQuery_Request,
        options?: TransportRequestOptions
    ) {
        const response = await this.client.deleteByQuery({
            ...params,
            ...options
        });
        return response;
    }
}
