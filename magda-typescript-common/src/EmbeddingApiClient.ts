import BaseApiClient, { BaseApiClientConfig } from "./BaseApiClient.js";
import fetchRequest from "./fetchRequest.js";
import ServerError from "./ServerError.js";

export interface EmbeddingResult {
    data: {
        embedding: number[];
    }[];
}

export interface EmbeddingApiClientConfig extends BaseApiClientConfig {
    taskSize?: number;
}

export default class EmbeddingApiClient extends BaseApiClient {
    public taskSize: number = 10;

    constructor(options: EmbeddingApiClientConfig) {
        options.baseApiUrl = options.baseApiUrl || "http://localhost:3000";
        super(options);
        this.taskSize = options.taskSize || 10;
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
            if (Array.isArray(input)) {
                const result: number[][] = [];
                for (let i = 0; i < input.length; i += this.taskSize) {
                    const chunk = input.slice(i, i + this.taskSize);
                    const res = await fetchRequest<EmbeddingResult>(
                        "post",
                        url,
                        { input: chunk },
                        "application/json",
                        false,
                        this.addAuthHeader()
                    );
                    result.push(...res.data.map((d) => d.embedding));
                }
                return result;
            } else {
                const res = await fetchRequest<EmbeddingResult>(
                    "post",
                    url,
                    { input },
                    "application/json",
                    false,
                    this.addAuthHeader()
                );
                return res.data[0].embedding;
            }
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
