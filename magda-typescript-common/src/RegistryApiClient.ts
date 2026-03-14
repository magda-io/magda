import fetchRequest from "./fetchRequest.js";
import BaseApiClient, { BaseApiClientConfig } from "./BaseApiClient.js";

export interface FilterRecordsByAccessResult {
    records: string[];
}

export default class RegistryApiClient extends BaseApiClient {
    constructor(options: BaseApiClientConfig) {
        options.baseApiUrl = options.baseApiUrl || "http://localhost:6101/v0";
        super(options);
    }

    async filterRecordsByAccess(
        records: string[],
        jwtToken: string
    ): Promise<FilterRecordsByAccessResult> {
        return await fetchRequest<FilterRecordsByAccessResult>(
            "post",
            this.getBaseApiUri().segmentCoded("access-filter").toString(),
            { records },
            "application/json",
            false,
            {
                headers: {
                    "X-Magda-Session": jwtToken
                }
            }
        );
    }
}
