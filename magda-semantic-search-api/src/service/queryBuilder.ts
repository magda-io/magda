import type { SearchParams } from "../model.js";

export function buildSearchQueryBody(
    embeddingVector: number[],
    searchParams: SearchParams
) {
    const filterClauses: any[] = [];

    if (searchParams.itemType)
        filterClauses.push({ term: { itemType: searchParams.itemType } });
    if (searchParams.fileFormat)
        filterClauses.push({ term: { fileFormat: searchParams.fileFormat } });
    if (searchParams.recordId)
        filterClauses.push({ term: { recordId: searchParams.recordId } });
    if (searchParams.subObjectId)
        filterClauses.push({ term: { subObjectId: searchParams.subObjectId } });
    if (searchParams.subObjectType)
        filterClauses.push({
            term: { subObjectType: searchParams.subObjectType }
        });

    return {
        size: searchParams.max_num_results,
        query: {
            knn: {
                embedding: {
                    vector: embeddingVector,
                    min_score: searchParams.minScore,
                    k: searchParams.minScore
                        ? undefined
                        : searchParams.max_num_results,
                    filter:
                        filterClauses.length > 0
                            ? { bool: { must: filterClauses } }
                            : undefined
                }
            }
        },
        _source: {
            excludes: ["embedding"]
        }
    };
}

export function buildSingleRetrieveQueryBody(
    recordId: string,
    subObjectId?: string
) {
    return {
        query: {
            bool: {
                should: [
                    { term: { recordId: recordId } },
                    ...(subObjectId
                        ? [{ term: { subObjectId: subObjectId } }]
                        : [])
                ]
            }
        },
        sort: [{ index_text_chunk_position: "asc" }],
        _source: {
            excludes: ["embedding"]
        },
        size: 1000
    };
}

export function getIndexItemsByIdsQueryBody(documentIds: string[]) {
    return {
        size: documentIds.length,
        query: {
            ids: {
                values: documentIds
            }
        }
    };
}
