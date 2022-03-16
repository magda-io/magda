import { Client } from "@elastic/elasticsearch";
import _ from "lodash";

import handleESError from "../../search/elasticsearch/handleESError";
import bulkIndex from "./bulkIndex";
import { Dataset } from "../../model";

export default async function buildDatasetsIndex(
    client: Client,
    indexId: string,
    datasets: Dataset[]
) {
    await handleESError(
        client.indices.delete({
            index: indexId,
            ignore_unavailable: true
        })
    );
    await handleESError(
        client.indices.create({
            index: indexId,
            body: {
                aliases: {},
                mappings: {
                    datasets: {
                        properties: {
                            accessControl: {
                                properties: {
                                    orgUnitId: { type: "keyword" },
                                    ownerId: { type: "keyword" },
                                    preAuthorisedPermissionIds: {
                                        type: "keyword"
                                    }
                                }
                            },
                            accrualPeriodicity: {
                                properties: {
                                    text: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    }
                                }
                            },
                            catalog: { type: "keyword" },
                            contactPoint: {
                                properties: {
                                    identifier: { type: "keyword" }
                                }
                            },
                            creation: {
                                properties: {
                                    affiliatedOrganisation: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    isInternallyProduced: {
                                        type: "boolean"
                                    },
                                    isOpenData: { type: "boolean" },
                                    likelihoodOfRelease: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    mechanism: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    sourceSystem: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    }
                                }
                            },
                            description: {
                                type: "text",
                                fields: {
                                    keyword: { type: "keyword" },
                                    quote: {
                                        type: "text",
                                        analyzer: "quote_partial_match"
                                    }
                                },
                                analyzer: "english_with_synonym",
                                search_analyzer:
                                    "english_without_synonym_for_search"
                            },
                            distributions: {
                                type: "nested",
                                properties: {
                                    accessURL: {
                                        type: "text",
                                        fields: {
                                            keyword: {
                                                type: "keyword",
                                                ignore_above: 256
                                            }
                                        }
                                    },
                                    byteSize: { type: "long" },
                                    description: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote_partial_match"
                                            }
                                        },
                                        analyzer: "english_with_synonym",
                                        search_analyzer:
                                            "english_without_synonym_for_search"
                                    },
                                    downloadURL: {
                                        type: "text",
                                        fields: {
                                            keyword: {
                                                type: "keyword",
                                                ignore_above: 256
                                            }
                                        }
                                    },
                                    format: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            keyword_lowercase: {
                                                type: "text",
                                                analyzer: "quote",
                                                fielddata: true
                                            },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    identifier: { type: "keyword" },
                                    issued: { type: "date" },
                                    license: {
                                        properties: {
                                            name: {
                                                type: "text",
                                                fields: {
                                                    keyword: {
                                                        type: "keyword",
                                                        ignore_above: 256
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    mediaType: {
                                        type: "text",
                                        fields: {
                                            keyword: {
                                                type: "keyword",
                                                ignore_above: 256
                                            }
                                        }
                                    },
                                    modified: { type: "date" },
                                    rights: {
                                        type: "text",
                                        fields: {
                                            keyword: {
                                                type: "keyword",
                                                ignore_above: 256
                                            }
                                        }
                                    },
                                    source: {
                                        properties: {
                                            id: {
                                                type: "text",
                                                fields: {
                                                    keyword: {
                                                        type: "keyword",
                                                        ignore_above: 256
                                                    }
                                                }
                                            },
                                            name: {
                                                type: "text",
                                                fields: {
                                                    keyword: {
                                                        type: "keyword",
                                                        ignore_above: 256
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    title: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    }
                                }
                            },
                            hasQuality: { type: "boolean" },
                            identifier: { type: "keyword" },
                            indexed: { type: "date" },
                            issued: { type: "date" },
                            keywords: {
                                type: "text",
                                fields: {
                                    keyword: { type: "keyword" },
                                    quote: {
                                        type: "text",
                                        analyzer: "quote"
                                    }
                                },
                                analyzer: "english"
                            },
                            landingPage: {
                                type: "text",
                                fields: {
                                    keyword: {
                                        type: "keyword",
                                        ignore_above: 256
                                    }
                                }
                            },
                            languages: {
                                type: "text",
                                fields: {
                                    keyword: {
                                        type: "keyword",
                                        ignore_above: 256
                                    }
                                }
                            },
                            modified: { type: "date" },
                            publisher: {
                                properties: {
                                    acronym: {
                                        type: "text",
                                        analyzer: "keyword",
                                        search_analyzer: "uppercase"
                                    },
                                    addrCountry: { type: "keyword" },
                                    addrPostCode: { type: "keyword" },
                                    addrState: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    addrStreet: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    addrSuburb: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    aggKeywords: {
                                        type: "text",
                                        fields: {
                                            keyword: {
                                                type: "keyword",
                                                ignore_above: 256
                                            }
                                        }
                                    },
                                    aggregation_keywords: {
                                        type: "text",
                                        analyzer: "keyword"
                                    },
                                    description: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    email: { type: "keyword" },
                                    identifier: { type: "keyword" },
                                    imageUrl: { type: "keyword" },
                                    jurisdiction: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    name: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            keyword_lowercase: {
                                                type: "text",
                                                analyzer: "quote",
                                                fielddata: true
                                            },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    },
                                    phone: { type: "keyword" },
                                    source: {
                                        properties: {
                                            id: {
                                                type: "text",
                                                fields: {
                                                    keyword: {
                                                        type: "keyword",
                                                        ignore_above: 256
                                                    }
                                                }
                                            },
                                            name: {
                                                type: "text",
                                                fields: {
                                                    keyword: {
                                                        type: "keyword",
                                                        ignore_above: 256
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    website: { type: "keyword" }
                                }
                            },
                            publishingState: { type: "keyword" },
                            quality: { type: "double" },
                            source: {
                                properties: {
                                    extras: {
                                        type: "object",
                                        dynamic: "true"
                                    },
                                    id: { type: "keyword" },
                                    name: {
                                        type: "text",
                                        fields: {
                                            keyword: { type: "keyword" },
                                            quote: {
                                                type: "text",
                                                analyzer: "quote"
                                            }
                                        },
                                        analyzer: "english"
                                    }
                                }
                            },
                            spatial: {
                                properties: {
                                    geoJson: { type: "geo_shape" },
                                    text: {
                                        type: "text",
                                        fields: {
                                            keyword: {
                                                type: "keyword",
                                                ignore_above: 256
                                            }
                                        }
                                    }
                                }
                            },
                            temporal: {
                                properties: {
                                    end: {
                                        properties: {
                                            date: { type: "date" },
                                            text: { type: "text" }
                                        }
                                    },
                                    start: {
                                        properties: {
                                            date: { type: "date" },
                                            text: { type: "text" }
                                        }
                                    }
                                }
                            },
                            themes: {
                                type: "text",
                                fields: {
                                    keyword: { type: "keyword" },
                                    quote: {
                                        type: "text",
                                        analyzer: "quote_partial_match"
                                    }
                                },
                                analyzer: "english_with_synonym",
                                search_analyzer:
                                    "english_without_synonym_for_search"
                            },
                            title: {
                                type: "text",
                                fields: {
                                    keyword: { type: "keyword" },
                                    quote: {
                                        type: "text",
                                        analyzer: "quote"
                                    }
                                },
                                analyzer: "english"
                            },
                            years: { type: "keyword" }
                        }
                    }
                },
                settings: {
                    index: {
                        number_of_shards: "1",
                        analysis: {
                            filter: {
                                light_english_stemmer: {
                                    name: "light_english",
                                    type: "stemmer"
                                },
                                synonym: {
                                    format: "wordnet",
                                    type: "synonym",
                                    synonyms_path: "analysis/wn_s.pl"
                                },
                                english_possessive_stemmer: {
                                    name: "possessive_english",
                                    type: "stemmer"
                                },
                                english_stop: {
                                    type: "stop",
                                    stopwords: "_english_"
                                }
                            },
                            analyzer: {
                                uppercase: {
                                    filter: ["uppercase"],
                                    type: "custom",
                                    tokenizer: "keyword"
                                },
                                english_without_synonym_for_search: {
                                    filter: [
                                        "lowercase",
                                        "english_possessive_stemmer",
                                        "light_english_stemmer",
                                        "english_stop"
                                    ],
                                    type: "custom",
                                    tokenizer: "standard"
                                },
                                quote: {
                                    filter: ["lowercase"],
                                    type: "custom",
                                    tokenizer: "keyword"
                                },
                                quote_partial_match: {
                                    filter: ["lowercase"],
                                    type: "custom",
                                    tokenizer: "standard"
                                },
                                english_with_synonym: {
                                    filter: [
                                        "lowercase",
                                        "english_possessive_stemmer",
                                        "light_english_stemmer",
                                        "synonym",
                                        "english_possessive_stemmer",
                                        "english_stop"
                                    ],
                                    type: "custom",
                                    tokenizer: "standard"
                                }
                            }
                        },
                        number_of_replicas: "0"
                    }
                }
            }
        })
    );

    await bulkIndex(client, indexId, datasets, true, "identifier");
}
