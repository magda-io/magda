import BaseApiClient, { BaseApiClientConfig } from "./BaseApiClient.js";
import fetchRequest from "./fetchRequest.js";
import ServerError from "./ServerError.js";

export interface EmbeddingResult {
    data: {
        embedding: number[];
    }[];
}

export interface EmbeddingApiClientConfig extends BaseApiClientConfig {}

export default class EmbeddingApiClient extends BaseApiClient {
    constructor(options: EmbeddingApiClientConfig) {
        options.baseApiUrl = options.baseApiUrl || "http://localhost:3000";
        super(options);
        this.testConnection();
    }

    public async testConnection() {
        try {
            await this.get("test");
            return true;
        } catch (err) {
            throw new Error(
                `Failed to connect to embedding API: ${this.getBaseApiUri().toString()}, error: ${err}`
            );
        }
    }

    async get(text: string): Promise<number[]>;
    async get(textList: string[]): Promise<number[][]>;
    async get(input: string | string[]): Promise<number[] | number[][]> {
        const url = this.getBaseApiUri()
            .segmentCoded("v1")
            .segmentCoded("embeddings")
            .toString();

        try {
            const res = await fetchRequest<EmbeddingResult>(
                "post",
                url,
                { input },
                "application/json",
                false,
                this.addAuthHeader()
            );

            return Array.isArray(input)
                ? res.data.map((d) => d.embedding)
                : res.data[0].embedding;
        } catch (e) {
            if (e instanceof ServerError) {
                throw new Error(
                    `Embedding API error: ${e.statusCode}: ${e.message}`
                );
            }
            throw new Error(
                `Embedding API request failed: ${
                    e instanceof Error ? e.message : String(e)
                }`
            );
        }
    }
}
