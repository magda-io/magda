import fetch from "isomorphic-fetch";
import uniq from "lodash/uniq";
import flatMap from "lodash/flatMap";
import type { MessageSafeConfig } from "config";

async function queryEndpoint(
    apiEndpoint: string,
    str: string
): Promise<string[]> {
    if (!apiEndpoint) {
        throw new Error(
            "Failed to contact Vocabulary API: API endpoint cannot be empty!"
        );
    }

    if (typeof str !== "string") {
        return str;
    }

    str = str.replace(/\s+/g, "");

    const requestUrl =
        `${apiEndpoint}?labelcontains=` + encodeURIComponent(str);

    const data = await fetch(requestUrl).then((response) => {
        if (response.status === 200) {
            return response.json();
        }
        throw new Error(response.statusText);
    });

    if (!data || !data.result || !Array.isArray(data.result.items)) {
        throw new Error(
            "Failed to contact Vocabulary API: Invalid API response!"
        );
    }

    const keywords: string[] = [];

    data.result.items.forEach((item) => {
        let prefLabels: {
            _value: string;
            _lang: string;
        }[] = [];

        if (item.broader && item.broader.prefLabel) {
            if (!Array.isArray(item.broader.prefLabel)) {
                prefLabels.push(item.broader.prefLabel);
            } else {
                prefLabels = prefLabels.concat(item.broader.prefLabel);
            }
        }

        if (item.prefLabel) {
            if (!Array.isArray(item.prefLabel)) {
                prefLabels.push(item.prefLabel);
            } else {
                prefLabels = prefLabels.concat(item.prefLabel);
            }
        }

        prefLabels.forEach((label) => {
            if (label._lang && label._lang !== "en") {
                return;
            }
            keywords.push(label._value);
        });
    });

    return keywords;
}

export async function query(
    str: string,
    config: MessageSafeConfig
): Promise<string[]> {
    const apiEndpoints = config.vocabularyApiEndpoints;
    if (!Array.isArray(apiEndpoints) || !apiEndpoints.length) {
        throw new Error(
            "Failed to contact Vocabulary API: invalid vocabularyApiEndpoints config!"
        );
    }
    const result = await Promise.all(
        apiEndpoints.map((api) =>
            queryEndpoint(api, str).catch((e) => {
                // In the event that a query fails it's not fatal... just count it as empty and move to the next one.
                console.error(e);
                return [];
            })
        )
    );
    const keywords = uniq(
        flatMap(result).map((keyword) => keyword.toLowerCase())
    );
    return keywords;
}

export async function isValidKeyword(
    keyword: string,
    config: MessageSafeConfig
): Promise<boolean> {
    const keywords = await query(keyword, config);
    if (!Array.isArray(keywords) || !keywords.length) return false;
    return true;
}
