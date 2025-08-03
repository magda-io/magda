import type { SearchParams } from "../model.js";

export function buildSearchQueryBody(
    embeddingVector: number[],
    searchParams: SearchParams,
    fetchSize: number
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
        size: fetchSize,
        query: {
            knn: {
                embedding: {
                    vector: embeddingVector,
                    k: fetchSize,
                    filter:
                        filterClauses.length > 0
                            ? { bool: { must: filterClauses } }
                            : undefined
                }
            }
        }
    };
}
