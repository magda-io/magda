import fetchRequest from "./fetchRequest";
import BaseApiClient, { BaseApiClientConfig } from "./BaseApiClient";

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
