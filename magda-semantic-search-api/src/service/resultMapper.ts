import type { IndexItem, SearchResultItem } from "../model.js";

export function mapSearchResults(response: any): SearchResultItem[] {
    if (!response?.body?.hits?.hits) {
        return [];
    }

    return response.body.hits.hits.map((hit: any) => mapToSearchResult(hit));
}

function mapToSearchResult(hit: any): SearchResultItem {
    const indexItem = mapToIndexItem(hit);

    return {
        ...indexItem,
        score: hit._score ?? 0
    };
}

export function mapToIndexItem(hit: any): IndexItem {
    const source = hit._source || {};

    return {
        id: hit._id || "",
        itemType: source.itemType ?? undefined,
        recordId: source.recordId ?? undefined,
        parentRecordId: source.parentRecordId ?? undefined,
        fileFormat: source.fileFormat ?? undefined,
        subObjectId: source.subObjectId ?? undefined,
        subObjectType: source.subObjectType ?? undefined,
        text: source.index_text_chunk || "",
        only_one_index_text_chunk: source.only_one_index_text_chunk ?? false,
        index_text_chunk_length: source.index_text_chunk_length ?? 0,
        index_text_chunk_position: source.index_text_chunk_position ?? 0,
        index_text_chunk_overlap: source.index_text_chunk_overlap ?? 0
    };
}
