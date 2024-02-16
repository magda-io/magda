import casual from "casual";
import moment from "moment";
import _ from "lodash";

import buildDatasetsIndexInner from "./buildDatasetsIndex.js";
import buildRegionsIndexInner from "./buildRegionsIndex.js";
import { Dataset, Agent, Distribution, PeriodOfTime } from "../../model.js";

export const buildDatasetsIndex = buildDatasetsIndexInner;
export const buildRegionsIndex = buildRegionsIndexInner;

export const buildDataset = (() => {
    let globalDatasetIdentifierCount = 0;

    return function buildDataset(overrides: any = {}): Dataset {
        return {
            identifier: "ds-" + globalDatasetIdentifierCount++,
            catalog: "data.gov.au",
            publisher: buildPublisher(),
            title: casual.title,
            description: casual.description,
            themes: casual.array_of_words(casual.integer(0, 10)),
            keywords: casual.array_of_words(casual.integer(0, 10)),
            distributions: buildNDistributions(casual.integer(0, 10)),
            quality: casual.double(0, 1),
            hasQuality: casual.coin_flip,
            temporal: {
                start: casual.coin_flip
                    ? {
                          date: moment(casual.date("YYYY-MM-DD")).toISOString(),
                          text: casual.date("YYYY-MM-DD")
                      }
                    : undefined,
                end: casual.coin_flip
                    ? {
                          date: moment(casual.date("YYYY-MM-DD")).toISOString(),
                          text: casual.date("YYYY-MM-DD")
                      }
                    : undefined
            } as PeriodOfTime,
            ...overrides
        } as Dataset;
    };
})();

export const buildPublisher = (() => {
    let globalPublisherIdentifierCount = 0;

    return function buildPublisher(overrides: any = {}): Agent {
        return {
            identifier: "pub-" + globalPublisherIdentifierCount++,
            name: casual.title,
            description: casual.description,
            acronym: casual.title
                .split(" ")
                .map((word) => word[0])
                .join(""),
            jurisdiction: casual.title,
            aggKeywords: casual.array_of_words(casual.integer(0, 10)),
            email: casual.email,
            imageUrl: casual.url,
            phone: casual.phone,
            addrStreet: casual.street,
            addrSuburb: casual.city,
            addrPostcode: casual.coin_flip
                ? casual.array_of_digits(4).join("")
                : casual.zip,
            addrCountry: casual.country,
            website: casual.url,
            source: {
                name: casual.title,
                id: casual.string
            },

            ...overrides
        };
    };
})();

export const buildDistribution = (() => {
    let globalDistIdentifierCount = 0;

    return function buildDataset(overrides: any = {}): Distribution {
        return {
            identifier: "dist-" + globalDistIdentifierCount++,
            title: casual.title,
            description: casual.description,
            issued: casual.date,
            modified: casual.date,
            license: {
                name: casual.title,
                url: casual.url
            },
            rights: casual.description,
            accessURL: casual.url,
            downloadURL: casual.url,
            byteSize: casual.integer(1, Number.MAX_SAFE_INTEGER),
            mediaType: casual.mime_type,
            source: {
                id: casual.uuid,
                name: casual.title
            },
            format: casual.mime_type.split("/")[1],

            ...overrides
        } as Distribution;
    };
})();

export const buildN = <T>(builderFn: (override: any) => T) => (
    n: number,
    override: (n: number) => any = () => {}
): T[] => {
    return _.range(0, n).map(() => builderFn(override(n)));
};

export const buildNDatasets = buildN(buildDataset);
export const buildNDistributions = buildN(buildDistribution);
