import { config } from "config";

import buildSearchQueryString, {
    Query as SearchQuery,
    Query
} from "../helpers/buildSearchQueryString";
import { DataSearchJson } from "../helpers/datasetSearch";
import urijs from "urijs";

type SearchApiResult = {
    hitCount: number;
    organisations: SearchApiPublisher[];
};
type SearchApiPublisher = {
    /** A UUID identifying the organisation in the registry */
    identifier: string;
    /** An acronym used for prefixing purposes - the same as 'id' in 'source' */
    id: string;
    name: string;
    acronym: string;
    aggKeywords: string[];
    datasetCount: number;
    description: string;
    email: string;
    imageUrl: string;
    jurisdiction: string;
    phone: string;
    website: string;
    source: {
        id: string;
        name: string;
    };
};

export function searchPublishers(
    query: string,
    start: number = 1,
    searchResultsPerPage: number = 10
): Promise<SearchApiResult> {
    const url = `${
        config.searchApiUrl + "organisations"
    }?query=${query}&start=${
        (start - 1) * searchResultsPerPage
    }&limit=${searchResultsPerPage}`;
    return fetch(url, config.credentialsFetchOptions).then((response) => {
        if (!response.ok) {
            let statusText = response.statusText;
            // response.statusText are different in different browser, therefore we unify them here
            if (response.status === 404) {
                statusText = "Not Found";
            }
            throw Error(statusText);
        }
        return response.json();
    });
}

type AutocompletePublisher = {
    countErrorUpperBound: number;
    hitCount: number;
    identifier: string;
    matched: boolean;
    value: string;
};

type AutocompleteResponse = {
    /** The count of all hits that match the *general* query */
    hitCount: number;
    options: AutocompletePublisher[];
};

export function autocompletePublishers(
    generalQuery: SearchQuery,
    term: string
): Promise<AutocompleteResponse> {
    const generalQueryString = buildSearchQueryString({
        ...generalQuery,
        start: 0,
        limit: 10,
        q: "*",
        publisher: undefined
    });

    return fetch(
        config.searchApiUrl +
            `facets/publisher/options?generalQuery=${encodeURIComponent(
                generalQuery.q || "*"
            )}&${generalQueryString}&facetQuery=${term}`,
        config.credentialsFetchOptions
    ).then((response) => {
        if (!response.ok) {
            throw new Error(response.statusText);
        } else {
            return response.json();
        }
    });
}

type AutoCompleteResult = {
    inputString: String;
    suggestions: string[];
    errorMessage?: string;
};

export async function autoCompleteAccessLocation(
    term: string,
    size: number = 8
): Promise<string[]> {
    const url = `${
        config.searchApiUrl + "autoComplete"
    }?field=accessNotes.location&input=${encodeURIComponent(
        term
    )}&size=${size}`;

    const response = await fetch(url, config.credentialsFetchOptions);
    try {
        const resData: AutoCompleteResult = await response.json();
        if (resData.errorMessage) {
            throw new Error(resData.errorMessage);
        }
        return resData.suggestions;
    } catch (e) {
        if (!response.ok) {
            // --- server side error
            throw Error(response.statusText);
        } else {
            throw Error(e);
        }
    }
}

export function searchDatasets(queryObject: Query): Promise<DataSearchJson> {
    let url: string =
        config.searchApiUrl + `datasets?${buildSearchQueryString(queryObject)}`;
    return fetch(url, config.credentialsFetchOptions).then((response: any) => {
        if (response.status === 200) {
            return response.json();
        }
        let errorMessage = response.statusText;
        if (!errorMessage)
            errorMessage = "Failed to retrieve network resource.";
        throw new Error(errorMessage);
    });
}

export type SearchRegionOptions = {
    regionId?: string;
    type?: string;
    lv1Id?: string;
    lv2Id?: string;
    lv3Id?: string;
    lv4Id?: string;
    lv5Id?: string;
    start?: number;
    limit?: number;
};

export type Region = {
    regionId: string;
    regionType: string;
    lv1Id?: string;
    lv2Id?: string;
    lv3Id?: string;
    lv4Id?: string;
    lv5Id?: string;
    boundingBox?: {
        east?: number;
        north?: number;
        south?: number;
        west?: number;
    };
    regionName: string;
};

export async function getRegions(
    options: SearchRegionOptions
): Promise<Region[]> {
    const uri = urijs(`${config.searchApiUrl}regions`);
    const res = await fetch(uri.search(options as any).toString());
    if (!res.ok) {
        const bodyText = await res.text();
        throw new Error(`${res.statusText}${bodyText ? "\n" + bodyText : ""}`);
    }
    const data = await res.json();
    if (data?.regions?.length) {
        return data.regions;
    } else {
        return [];
    }
}
