import BaseApiClient, { BaseApiClientConfig } from "./BaseApiClient.js";
import fetchRequest from "./fetchRequest.js";

export interface EmbeddingResult {
    data: {
        embedding: number[];
    }[];
}

export default class EmbeddingApiClient extends BaseApiClient {
    private taskSize: number = 10;

    constructor(options: BaseApiClientConfig) {
        options.baseApiUrl = options.baseApiUrl || "http://localhost:3000/v0";
        super(options);
    }

    async get(text: string): Promise<number[]>;
    async get(textList: string[]): Promise<number[][]>;
    async get(input: string | string[]): Promise<number[] | number[][]> {
        if (Array.isArray(input)) {
            const result: number[][] = [];
            for (let i = 0; i < input.length; i += this.taskSize) {
                const chunk = input.slice(i, i + this.taskSize);
                const body = { input: chunk };

                const response = await fetchRequest<EmbeddingResult>(
                    "post",
                    this.getBaseApiUri()
                        .segmentCoded("v1")
                        .segmentCoded("embeddings")
                        .toString(),
                    body,
                    "application/json",
                    false,
                    this.addAuthHeader()
                );

                result.push(...response.data.map((d) => d.embedding));
            }

            return result;
        } else {
            const body = { input };

            const response = await fetchRequest<EmbeddingResult>(
                "post",
                this.getBaseApiUri()
                    .segmentCoded("v1")
                    .segmentCoded("embeddings")
                    .toString(),
                body,
                "application/json",
                false,
                this.addAuthHeader()
            );

            return response.data[0].embedding;
        }
    }
}
