import { Client } from "@elastic/elasticsearch";
import _ from "lodash";

import handleESError from "../../search/elasticsearch/handleESError.js";
import bulkIndex from "./bulkIndex.js";
import { Region } from "../../model.js";

const DEFINITION = {
    aliases: {},
    mappings: {
        regions: {
            properties: {
                boundingBox: { type: "geo_shape" },
                geometry: { type: "geo_shape" },
                order: { type: "integer" },
                regionId: { type: "keyword" },
                regionName: {
                    type: "text",
                    fields: {
                        keyword: { type: "keyword" },
                        quote: { type: "text", analyzer: "quote" }
                    },
                    analyzer: "english"
                },
                regionSearchId: {
                    type: "text",
                    analyzer: "regionSearchIdIndex",
                    search_analyzer: "regionSearchIdInput"
                },
                regionShortName: {
                    type: "text",
                    fields: {
                        keyword: { type: "keyword" },
                        quote: { type: "text", analyzer: "quote" }
                    },
                    analyzer: "english"
                },
                regionType: { type: "keyword" }
            }
        }
    },
    settings: {
        index: {
            number_of_shards: "1",
            analysis: {
                filter: {
                    search_region_synonym_graph_filter: {
                        type: "synonym_graph",
                        synonyms_path: "analysis/regionSynonyms.txt"
                    }
                },
                analyzer: {
                    quote: {
                        filter: ["lowercase"],
                        type: "custom",
                        tokenizer: "keyword"
                    },
                    regionSearchIdIndex: {
                        filter: ["lowercase"],
                        type: "custom",
                        tokenizer: "keyword"
                    },
                    regionSearchIdInput: {
                        filter: [
                            "lowercase",
                            "search_region_synonym_graph_filter"
                        ],
                        type: "custom",
                        tokenizer: "whitespace"
                    }
                }
            },
            number_of_replicas: "0"
        }
    }
};

export default async function buildRegionsIndex(
    client: Client,
    indexId: string,
    regions: Region[]
) {
    await handleESError(
        client.indices.delete({
            index: indexId,
            ignore_unavailable: true
        })
    );
    await handleESError(
        client.indices.create({ index: indexId, body: DEFINITION })
    );

    await bulkIndex(client, indexId, regions, true, "regionSearchId");
}
