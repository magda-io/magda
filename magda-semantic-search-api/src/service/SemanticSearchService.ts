import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import RegistryApiClient from "magda-typescript-common/src/RegistryApiClient.js";
import SearchApiClient from "magda-typescript-common/src/SearchApiClient.js";
import {
    getIndexItemsByIdsQueryBody,
    buildSearchQueryBody,
    buildSingleRetrieveQueryBody,
    buildSearchQueryBodyByRecordIds
} from "./queryBuilder.js";
import { mapToIndexItem, mapSearchResults } from "./resultMapper.js";
import { filterByMinScore, keepTopK } from "./filters.js";
import type {
    IndexItem,
    SearchParams,
    SearchResultItem,
    RetrieveParams,
    RetrieveResultItem,
    SemanticIndexerConfig
} from "../model.js";

const DEFAULT_MAX_NUM_RESULTS = 100;

export class SemanticSearchService {
    private indexName: string;

    constructor(
        private embeddingApiClient: EmbeddingApiClient,
        private openSearchClient: OpensearchApiClient,
        private registryApiClient: RegistryApiClient,
        private searchApiClient: SearchApiClient,
        private semanticIndexerConfig: SemanticIndexerConfig
    ) {
        this.indexName = `${this.semanticIndexerConfig.indexName}-v${this.semanticIndexerConfig.indexVersion}`;
    }

    async search(searchParams: SearchParams): Promise<SearchResultItem[]> {
        const embeddingVector = await this.embeddingApiClient.get(
            searchParams.query
        );

        const inMemoryMode = this.semanticIndexerConfig.mode === "in_memory";
        const tempSearchParams = { ...searchParams };

        if (!inMemoryMode) {
            tempSearchParams.minScore = undefined;
            tempSearchParams.max_num_results =
                (searchParams.max_num_results ?? DEFAULT_MAX_NUM_RESULTS) * 2;
        }

        let items = await this.executeVectorSearch(
            embeddingVector,
            tempSearchParams
        );

        // Phase 1: Records Access Filtering
        const recordIds = [
            ...new Set(
                items
                    .map((item) => item.recordId)
                    .filter((id): id is string => !!id)
            )
        ];

        const registryResponse = await this.registryApiClient.filterRecordsByAccess(
            recordIds,
            searchParams.jwt
        );

        const allowedRecordIds = new Set(registryResponse.records);
        items = items.filter((item) => allowedRecordIds.has(item.recordId));

        // Phase 2: Access-Aware Narrowed Vector Search
        if (items.length === 0) {
            const searchDatasetResponse = await this.searchApiClient.searchDatasets(
                {
                    query: searchParams.query,
                    start: 0,
                    limit: 500
                },
                searchParams.jwt
            );

            const newAllowedRecordIds = new Set<string>();

            for (const dataset of searchDatasetResponse.dataSets) {
                if (dataset.identifier) {
                    newAllowedRecordIds.add(dataset.identifier);
                }

                for (const dist of dataset.distributions ?? []) {
                    if (dist.identifier) {
                        newAllowedRecordIds.add(dist.identifier);
                    }
                }
            }

            if (newAllowedRecordIds.size === 0) {
                return [];
            }

            items = await this.executeVectorSearch(
                embeddingVector,
                tempSearchParams,
                [...newAllowedRecordIds]
            );
        }

        return items;
    }

    private async executeVectorSearch(
        embeddingVector: number[],
        searchParams: SearchParams,
        recordIds?: string[]
    ): Promise<SearchResultItem[]> {
        const inMemoryMode = this.semanticIndexerConfig.mode === "in_memory";

        const queryBody = recordIds?.length
            ? buildSearchQueryBodyByRecordIds(
                  embeddingVector,
                  searchParams,
                  recordIds
              )
            : buildSearchQueryBody(embeddingVector, searchParams);

        const searchResponse = await this.openSearchClient.search(
            this.indexName,
            queryBody
        );

        let items = mapSearchResults(searchResponse);

        if (!inMemoryMode) {
            items = filterByMinScore(items, searchParams.minScore);
            items = keepTopK(items, searchParams.max_num_results);
        }

        return items;
    }

    async retrieve(_params: RetrieveParams): Promise<RetrieveResultItem[]> {
        const {
            ids,
            mode = "full",
            precedingChunksNum = 0,
            subsequentChunksNum = 0
        } = _params;

        // fetch recordIds
        const indexItems = await this._fetchIndexItemsByIds(ids);

        const results: RetrieveResultItem[] = [];
        for (const item of indexItems) {
            // get all chunks for the record
            const allChunks = await this._fetchChunks(
                item.recordId,
                item.subObjectId
            );

            if (!allChunks.length) continue;
            allChunks.sort(
                (a, b) =>
                    a.index_text_chunk_position - b.index_text_chunk_position
            );

            if (mode === "full") {
                results.push(
                    this._buildResult(item, this._mergeChunks(allChunks))
                );
            } else {
                const targetId = item.id;
                const selected = this._selectContextChunks(
                    allChunks,
                    targetId,
                    precedingChunksNum,
                    subsequentChunksNum
                );
                results.push(
                    this._buildResult(item, this._mergeChunks(selected))
                );
            }
        }
        return results;
    }

    private async _fetchIndexItemsByIds(ids: string[]): Promise<IndexItem[]> {
        const body = getIndexItemsByIdsQueryBody(ids);
        const response = await this.openSearchClient.search(
            this.indexName,
            body
        );
        return response.body.hits.hits.map(mapToIndexItem);
    }

    private async _fetchChunks(
        recordId: string,
        subObjectId?: string
    ): Promise<IndexItem[]> {
        const body = buildSingleRetrieveQueryBody(recordId, subObjectId);
        const resp = await this.openSearchClient.search(this.indexName, body);
        return resp.body.hits.hits.map(mapToIndexItem);
    }

    private _selectContextChunks(
        all: IndexItem[],
        targetId: string,
        pre: number,
        post: number
    ): IndexItem[] {
        const idx = all.findIndex((c) => c.id === targetId);
        if (idx === -1) return [];
        const start = Math.max(0, idx - pre);
        const end = Math.min(all.length, idx + post + 1);
        return all.slice(start, end);
    }

    private _mergeChunks(chunks: IndexItem[]): string {
        return chunks
            .map((c, i) =>
                i === 0 ? c.text : c.text.slice(c.index_text_chunk_overlap)
            )
            .join("");
    }

    private _buildResult(item: IndexItem, text: string): RetrieveResultItem {
        return {
            id: item.id,
            itemType: item.itemType,
            recordId: item.recordId,
            parentRecordId: item.parentRecordId,
            fileFormat: item.fileFormat,
            subObjectId: item.subObjectId,
            subObjectType: item.subObjectType,
            text
        };
    }
}
