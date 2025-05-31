import fetchRequest from "./fetchRequest.js";
import BaseApiClient, { BaseApiClientConfig } from "./BaseApiClient.js";

export interface IndexResult {
    successes: number;
    failures: number;
    warns: number;
    failureReasons: string[];
    warnReasons: string[];
}

export interface DeleteResult {
    deleted: boolean;
}

export default class IndexerApiClient extends BaseApiClient {
    constructor(options: BaseApiClientConfig) {
        options.baseApiUrl = options.baseApiUrl || "http://localhost:6103/v0";
        super(options);
    }

    async indexDataset(datasetId: string) {
        return await fetchRequest<IndexResult>(
            "put",
            this.getBaseApiUri()
                .segmentCoded("dataset")
                .segmentCoded(datasetId)
                .toString(),
            undefined,
            undefined,
            false,
            this.addAuthHeader()
        );
    }

    async deleteDataset(datasetId: string) {
        return await fetchRequest<DeleteResult>(
            "delete",
            this.getBaseApiUri()
                .segmentCoded("dataset")
                .segmentCoded(datasetId)
                .toString(),
            undefined,
            undefined,
            false,
            this.addAuthHeader()
        );
    }
}
