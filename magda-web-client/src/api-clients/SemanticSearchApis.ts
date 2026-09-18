import { config } from "../config";

export interface SearchParams {
    query: string;
    max_num_results?: number;
    itemType?: "storageObject" | "registryRecord";
    fileFormat?: string;
    recordId?: string;
    subObjectId?: string;
    subObjectType?: string;
    minScore?: number;
}

export function buildSemanticSearchQueryString(params: SearchParams): string {
    const parts: string[] = [];
    const add = (k: string, v: any) => {
        if (v !== undefined && v !== null && v !== "") {
            parts.push(
                `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
            );
        }
    };

    add("query", params.query);
    add("max_num_results", params.max_num_results);
    add("itemType", params.itemType);
    add("fileFormat", params.fileFormat);
    add("recordId", params.recordId);
    add("subObjectId", params.subObjectId);
    add("subObjectType", params.subObjectType);
    add("minScore", params.minScore);

    return parts.join("&");
}

export type SearchResultItem = {
    id: string;
    itemType: string;
    recordId: string;
    parentRecordId: string;
    fileFormat: string;
    subObjectId: string;
    subObjectType: string;
    text: string;
    only_one_index_text_chunk: boolean;
    index_text_chunk_length: number;
    index_text_chunk_position: number;
    index_text_chunk_overlap: number;
    score: number;
};

export async function search(
    params: SearchParams,
    method: "GET" | "POST" = "GET"
): Promise<SearchResultItem[]> {
    const baseUrl = config.semanticSearchApiBaseUrl + "search";
    const baseOpts = config.commonFetchRequestOptions;

    let url = baseUrl;
    let fetchOptions: RequestInit = { ...baseOpts, method };

    if (method === "GET") {
        const qs = buildSemanticSearchQueryString(params);
        url = qs ? `${baseUrl}?${qs}` : baseUrl;
        if (fetchOptions.headers) {
            const h = { ...(fetchOptions.headers as Record<string, string>) };
            delete h["Content-Type"];
            fetchOptions.headers = h;
        }
    } else {
        fetchOptions = {
            ...fetchOptions,
            headers: {
                ...(baseOpts.headers || {}),
                "Content-Type": "application/json"
            },
            body: JSON.stringify(params)
        };
    }

    const res = await fetch(url, fetchOptions);
    if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw new Error(`${res.statusText}${bodyText ? "\n" + bodyText : ""}`);
    }
    return res.json();
}

export const searchGet = (params: SearchParams) => search(params, "GET");

export const searchPost = (params: SearchParams) => search(params, "POST");

export type RetrieveParams = {
    ids: string[];
    mode?: "full" | "partial";
    precedingChunksNum?: number;
    subsequentChunksNum?: number;
};

export type RetrieveResultItem = {
    id: string;
    itemType: string;
    recordId: string;
    parentRecordId: string;
    fileFormat: string;
    subObjectId: string;
    subObjectType: string;
    text: string;
};

export async function retrieve(
    params: RetrieveParams
): Promise<RetrieveResultItem[]> {
    const url = config.semanticSearchApiBaseUrl + "retrieve";
    return fetch(url, {
        ...config.commonFetchRequestOptions,
        method: "POST",
        headers: {
            ...(config.commonFetchRequestOptions.headers || {}),
            "Content-Type": "application/json"
        },
        body: JSON.stringify(params)
    }).then((response: any) => {
        if (response.status === 200) {
            return response.json();
        }
        let errorMessage = response.statusText;
        if (!errorMessage)
            errorMessage = "Failed to retrieve network resource.";
        throw new Error(errorMessage);
    });
}
