import { Client, ApiResponse, RequestParams } from "@elastic/elasticsearch";
import _ from "lodash";

import {
    Query,
    FacetType,
    FacetSearchResult,
    Region,
    FacetOption,
    SearchResult,
    ISODate
} from "../../model.js";
import SearchQueryer from "../SearchQueryer.js";
import getFacetDefinition from "./getFacetDefinition.js";

/**
 * A field within the dataset document indexed in ES that will be searched
 * using a certain analyzer. Includes a value for how much this individual
 * field should be boosted by.
 */
type AnalysisField = {
    path: string;
    boost?: number;
};

/**
 * Fields that will be analyzed using a language analyzer (i.e. they have
 * features like plurals that need to be taken into account)
 */
const DATASETS_LANGUAGE_FIELDS: AnalysisField[] = [
    { path: "title", boost: 50 },
    { path: "description", boost: 2 },
    { path: "publisher.name" },
    { path: "keywords", boost: 10 },
    { path: "themes" }
];

/**
 * Fields that should not be analyzed using a language analyzer
 */
const NON_LANGUAGE_FIELDS: AnalysisField[] = [
    { path: "_id" },
    { path: "catalog" },
    { path: "accrualPeriodicity" },
    { path: "contactPoint.identifier" },
    { path: "publisher.acronym" }
];

/**
 * A `SearchQueryer` that uses ElasticSearch to query the index
 */
export default class ElasticSearchQueryer implements SearchQueryer {
    /**
     * The ES client to use for querying. This is an HTTP client, so it doesn't
     * need a lot of management around setup/teardown.
     */
    private client: Client;

    /**
     * @param url The base URL to call ElasticSearch at
     * @param datasetsIndexId The id of the datasets index in ES
     * @param regionsIndexId The id of the regions index in ES
     * @param publishersIndexId The id of the publishers index in ES
     */
    constructor(
        readonly url: string,
        readonly datasetsIndexId: string,
        readonly regionsIndexId: string,
        readonly publishersIndexId: string
    ) {
        this.client = new Client({ node: this.url });
    }

    async searchFacets(
        facetType: FacetType,
        generalQuery: Query,
        start: number,
        limit: number,
        facetQuery: string | undefined
    ): Promise<FacetSearchResult> {
        const facetDef = getFacetDefinition(facetType);

        const esQueryBody: RequestParams.Search = {
            index: this.publishersIndexId,
            body: {
                query: {
                    dis_max: {
                        tie_breaker: 0,
                        queries: [
                            {
                                match_phrase_prefix: {
                                    value: facetQuery || ""
                                }
                            },
                            {
                                match_phrase_prefix: {
                                    acronym: facetQuery || ""
                                }
                            }
                        ]
                    }
                }
            },
            size: limit,
            from: start
        };

        // console.log(JSON.stringify(esQueryBody, null, 2));

        const result: ApiResponse = await this.client.search(esQueryBody);

        const { body } = result;

        if (body.totalHits === 0) {
            return { hitCount: 0, options: [] };
        } else {
            type Hit = {
                value: string;
                identifier: string;
            };

            const hits: Hit[] = body.hits.hits.map((hit: any) => hit._source);

            // Create a dataset filter aggregation for each hit in the initial query
            const filters = hits.reduce(
                (soFar: any, { value }: Hit) => ({
                    ...soFar,
                    [value]: {
                        filter: facetDef.exactMatchQuery(value)
                    }
                }),
                {}
            );

            // Do a datasets query WITHOUT filtering for this facet and  with an aggregation for each of the hits we
            // got back on our keyword - this allows us to get an accurate count of dataset hits for each result
            const generalEsQueryBody = {
                from: 0,
                size: 0,
                body: {
                    query: await this.buildESBody(
                        facetDef.removeFromQuery(generalQuery)
                    ),
                    aggs: filters
                },
                index: this.datasetsIndexId
            };

            // console.log(JSON.stringify(generalEsQueryBody, null, 2));

            const resultWithout = await this.client.search(generalEsQueryBody);

            const aggregationsResult = _(
                resultWithout.body.aggregations as {
                    [aggName: string]: any;
                }
            )
                .map((value, key) => ({
                    countErrorUpperBound: 0,
                    hitCount: value.doc_count || 0,
                    matched: false,
                    value: key
                }))
                .keyBy("value")
                .value();

            const options: FacetOption[] = _(hits)
                .map((hit) => ({
                    ...aggregationsResult[hit.value],
                    identifier: hit.identifier
                }))
                .sortBy((hit) => -hit.hitCount)
                .drop(start)
                .take(limit)
                .value();

            return {
                hitCount: resultWithout.body.hits.total,
                options
            };
        }
    }

    async search(
        query: Query,
        start: number,
        limit: number,
        facetSize: number
    ): Promise<SearchResult> {
        const searchParams: RequestParams.Search = {
            from: start,
            size: limit,
            body: {
                query: await this.buildESBody(query),
                aggs: {
                    minDate: {
                        min: {
                            field: "temporal.start.date"
                        }
                    },
                    maxDate: {
                        max: {
                            field: "temporal.end.date"
                        }
                    }
                }
            },
            index: this.datasetsIndexId
        };

        // For debugging! Use this to explain how a certain dataset is rated.
        // console.log(
        //     JSON.stringify(
        //         (await this.client.explain({
        //             body: {
        //                 query: await this.buildESDatasetsQuery(query)
        //                 // aggs: filters
        //             },
        //             index: this.datasetsIndexId,
        //             id: "ds-6",
        //             type: "datasets"
        //         })).body,
        //         null,
        //         2
        //     )
        // );

        // console.log(JSON.stringify(searchParams, null, 2));
        const response: ApiResponse = await this.client.search(searchParams);

        // console.log(response.body);

        return {
            query,
            hitCount: response.body.hits.total,
            dataSets: response.body.hits.hits.map((hit: any) => ({
                ...hit._source,
                score: hit._score,
                years: undefined
            })),
            temporal: {
                start: {
                    date: response.body.aggregations.minDate.value_as_string // new Date().toISOString() //TODO
                },
                end: {
                    date: response.body.aggregations.maxDate.value_as_string //TODO
                }
            },
            facets: [],
            strategy: "match-all"
        };
    }

    /**
     * Get the regions to apply a boost to, based off the search text in a query.
     *
     * E.g. if a user searches for "trees marrickville", then datasets that match the
     * "Marrickville" SA regions should be boosted above ones that don't.
     */
    async getBoostRegions(query: Query): Promise<Region[]> {
        if (!query.freeText || query.freeText === "") {
            return [];
        }

        const regionsResult = await this.client.search({
            index: this.regionsIndexId,
            body: {
                query: {
                    match: {
                        regionSearchId: {
                            query: query.freeText,
                            operator: "or"
                        }
                    }
                }
            },
            size: 50
        });

        return regionsResult.body.hits.hits.map((x: any) => x._source);
    }

    /**
     * Uses the Search API query to build an object that can be passed
     * to ElasticSearch in the body.
     */
    async buildESBody(query: Query): Promise<any> {
        const boostRegions = await this.getBoostRegions(query);

        const geomScorerQueries = boostRegions.map(
            this.regionToGeoshapeQuery,
            this
        );

        const qualityFactor = {
            filter: {
                term: {
                    hasQuality: true
                }
            },
            field_value_factor: {
                field: "quality",
                missing: 1
            }
        };

        const esQuery = {
            function_score: {
                query: this.queryToEsQuery(query, boostRegions),
                functions: [
                    {
                        weight: 1
                    },
                    qualityFactor,
                    {
                        filter: {
                            bool: {
                                should: geomScorerQueries
                            }
                        },
                        weight: 1
                    }
                ],
                score_mode: "sum"
            }
        };

        return esQuery;
    }

    /**
     * Turns a query recieved by the search API into a query recognisable by ES.
     */
    queryToEsQuery(query: Query, boostRegions: Region[]): any {
        const freeText = (() => {
            const sanitisedFreeText =
                !query.freeText || query.freeText === "" ? "*" : query.freeText;
            const textQuery = this.textQuery(sanitisedFreeText);

            if (boostRegions.length === 0) {
                return textQuery;
            } else {
                const regionNames: string[] = _(boostRegions)
                    .flatMap((region) => [
                        region.regionName,
                        region.regionShortName
                    ])
                    .filter((x) => !!x && x !== "")
                    .map((x) => x as string)
                    .sortBy((x: string) => x.length)
                    .value();

                // Remove these regions from the text
                const textWithoutRegions = regionNames
                    .reduce(
                        (soFar, currentRegion) =>
                            soFar.replace(new RegExp(currentRegion, "ig"), ""),
                        sanitisedFreeText
                    )
                    .trim();

                const textQueryNoRegions = this.textQuery(
                    textWithoutRegions.length > 0 ? textWithoutRegions : "*"
                );
                const geomScorerQueries = boostRegions.map(
                    this.regionToGeoshapeQuery,
                    this
                );

                return {
                    bool: {
                        should: [
                            textQuery,
                            {
                                bool: {
                                    must: [
                                        textQueryNoRegions,
                                        ...geomScorerQueries
                                    ]
                                }
                            }
                        ],
                        minimum_should_match: 1
                    }
                };
            }
        })();

        const dateQuery = (date: ISODate, comparator: "gte" | "lte") => ({
            bool: {
                should: [
                    {
                        range: {
                            "temporal.end.date": {
                                [comparator]: date
                            }
                        }
                    },
                    {
                        range: {
                            "temporal.start.date": {
                                [comparator]: date
                            }
                        }
                    }
                ],
                minimum_should_match: 1
            }
        });

        return {
            bool: {
                must: [
                    freeText,
                    ...query.regions.map((queryRegion) =>
                        this.regionIdToGeoshapeQuery(
                            queryRegion.regionType + "/" + queryRegion.regionId
                        )
                    ),
                    query.dateFrom &&
                        dateQuery(query.dateFrom.toISOString(), "gte"),
                    query.dateTo && dateQuery(query.dateTo.toISOString(), "lte")
                ].filter((x) => !!x)
            }
        };
    }

    /** Turns a string into an ElasticSearch text query */
    textQuery(inputText: string) {
        const simpleQueryStringQuery = {
            query: inputText,
            default_operator: "and",
            quote_field_suffix: ".quote"
        };

        // Surprise! english analysis doesn't work on nested objects unless you have a nested query, even though
        // other analysis does. So we do this silliness
        const distributionsEnglishQuery = {
            nested: {
                path: "distributions",
                score_mode: "max",
                query: {
                    simple_query_string: {
                        query: inputText,
                        fields: [
                            "distributions.title",
                            "distributions.description",
                            "distributions.format"
                        ],
                        default_operator: "and"
                    }
                }
            }
        };

        /**
         * Unfortunately, when default operator is AND, we can't put NON_LANGUAGE_FIELDS & DATASETS_LANGUAGE_FIELDS
         * into one SimpleStringQuery as they have different searchAnalylzer
         * It will result a term like +(catalog:at | _id:at)  will never be matched
         * We need to fix on our side as elasticsearch won't know our intention for this case
         */
        const queries = [
            {
                bool: {
                    should: [
                        {
                            simple_query_string: {
                                ...simpleQueryStringQuery,
                                fields: DATASETS_LANGUAGE_FIELDS.map(
                                    fieldDefToEs
                                )
                            }
                        },
                        {
                            simple_query_string: {
                                ...simpleQueryStringQuery,
                                fields: NON_LANGUAGE_FIELDS.map(fieldDefToEs)
                            }
                        }
                    ],
                    minimum_should_match: 1
                }
            },
            distributionsEnglishQuery
        ];

        return {
            dis_max: {
                queries
            }
        };
    }

    regionToGeoshapeQuery(region: Region) {
        return this.regionIdToGeoshapeQuery(region.regionSearchId);
    }

    regionIdToGeoshapeQuery(id: string) {
        return {
            geo_shape: {
                "spatial.geoJson": {
                    indexed_shape: {
                        index: this.regionsIndexId,
                        type: "regions",
                        id,
                        path: "geometry"
                    }
                }
            }
        };
    }
}

function fieldDefToEs(def: AnalysisField): string {
    if (typeof def.boost !== "undefined") {
        return `${def.path}^${def.boost}`;
    } else {
        return def.path;
    }
}
