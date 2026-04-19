import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import RegistryClient from "magda-typescript-common/src/registry/RegistryClient.js";
import SearchApiClient from "magda-typescript-common/src/SearchApiClient.js";
import RedisClient from "magda-typescript-common/src/redis/RedisClient.js";
import {
    buildSearchQueryBody,
    buildSingleRetrieveQueryBody,
    getIndexItemsByIdsQueryBody
} from "./queryBuilder.js";
import { mapSearchResults, mapToIndexItem } from "./resultMapper.js";
import { filterByMinScore, keepTopK } from "./filters.js";
import type {
    IndexItem,
    RetrieveParams,
    RetrieveResultItem,
    SearchParams,
    SearchResultItem,
    SemanticIndexerConfig
} from "../model.js";

const DEFAULT_MAX_NUM_RESULTS = 100;

export class SemanticSearchService {
    private indexName: string;

    constructor(
        private embeddingApiClient: EmbeddingApiClient,
        private openSearchClient: OpensearchApiClient,
        private registryClient: RegistryClient,
        private searchApiClient: SearchApiClient,
        private redisClient: RedisClient,
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
            // minScore is not used in on_disk mode
            tempSearchParams.minScore = undefined;
            // fetch more results to filter by minScore
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

        const registryResponse = await this.registryClient.filterRecordsByAccess(
            recordIds,
            searchParams.jwt,
            searchParams.tenantId
        );

        const allowedRecordIds = this._toAllowedRecordIds(registryResponse);
        items = items.filter((item) => allowedRecordIds.has(item.recordId));

        // Phase 2: Access-Aware Narrowed Vector Search
        if (items.length === 0) {
            const searchDatasetResponse = await this.searchApiClient.searchDatasets(
                {
                    query: searchParams.query,
                    start: 0,
                    limit: 500
                },
                searchParams.jwt,
                searchParams.tenantId
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
        if (!inMemoryMode) {
            items = filterByMinScore(items, searchParams.minScore);
            items = keepTopK(items, searchParams.max_num_results);
        }
        return items;
    }

    private async executeVectorSearch(
        embeddingVector: number[],
        searchParams: SearchParams,
        recordIds?: string[]
    ): Promise<SearchResultItem[]> {
        const queryBody = recordIds?.length
            ? buildSearchQueryBody(embeddingVector, searchParams, recordIds)
            : buildSearchQueryBody(embeddingVector, searchParams);

        const searchResponse = await this.openSearchClient.search(
            this.indexName,
            queryBody
        );
        return mapSearchResults(searchResponse);
    }

    async searchAlt(searchParams: SearchParams): Promise<SearchResultItem[]> {
        // Step 1: Get the Redis cache key for accessible record ids
        const dataKeyResponse = await this.registryClient.getAccessibleIdsCacheKey(
            searchParams.jwt,
            searchParams.tenantId
        );

        if (typeof dataKeyResponse !== "string" || !dataKeyResponse.trim()) {
            console.warn(
                "[searchAlt] Failed to resolve accessible ids cache key, fallback to default search"
            );
            return this.search(searchParams);
        }

        const dataKey = dataKeyResponse;

        // Step 2: Fetch record ids from Redis using the data key
        let accessibleRecordIds: string[] = [];
        try {
            const cachedJson = await this.redisClient.get(dataKey);
            if (cachedJson) {
                accessibleRecordIds = JSON.parse(cachedJson);
            }
        } catch (e) {
            console.warn(
                `[searchAlt] Failed to fetch/parse accessible ids from Redis for key ${dataKey}:`,
                e
            );
            // Fallback: if Redis fails, fall back to the original search method
            return this.search(searchParams);
        }

        if (!accessibleRecordIds || accessibleRecordIds.length === 0) {
            console.warn(
                `[searchAlt] No accessible record ids found for key ${dataKey}, returning empty results`
            );
            return [];
        }

        // Step 3: Get the embedding vector for the query
        const embeddingVector = await this.embeddingApiClient.get(
            searchParams.query
        );

        // Step 4: Adjust search params based on index mode
        const inMemoryMode = this.semanticIndexerConfig.mode === "in_memory";
        const tempSearchParams = { ...searchParams };

        if (!inMemoryMode) {
            tempSearchParams.minScore = undefined;
            tempSearchParams.max_num_results =
                (searchParams.max_num_results ?? DEFAULT_MAX_NUM_RESULTS) * 2;
        }

        // Step 5: Execute vector search with pre-filtered record ids
        let items = await this.executeVectorSearch(
            embeddingVector,
            tempSearchParams,
            accessibleRecordIds
        );

        // Step 6: Apply score filtering and result limiting for on-disk mode
        if (!inMemoryMode) {
            items = filterByMinScore(items, searchParams.minScore);
            items = keepTopK(items, searchParams.max_num_results);
        }

        return items;
    }

    private _toAllowedRecordIds(registryResponse: unknown): Set<string> {
        if (!Array.isArray(registryResponse)) {
            throw new Error(
                "Invalid filterByAccess response: expected string[]"
            );
        }
        return new Set(
            registryResponse.filter(
                (id): id is string => typeof id === "string" && id.length > 0
            )
        );
    }

    async retrieve(_params: RetrieveParams): Promise<RetrieveResultItem[]> {
        const {
            ids,
            mode = "full",
            precedingChunksNum = 0,
            subsequentChunksNum = 0,
            jwt,
            tenantId
        } = _params;

        // fetch recordIds
        const indexItems = await this._fetchIndexItemsByIds(ids);

        // filter access - only keep items whose recordId is accessible
        const recordIds = [
            ...new Set(
                indexItems
                    .map((item) => item.recordId)
                    .filter((id): id is string => !!id)
            )
        ];

        const registryResponse = await this.registryClient.filterRecordsByAccess(
            recordIds,
            jwt,
            tenantId
        );

        const allowedRecordIds = this._toAllowedRecordIds(registryResponse);

        const results: RetrieveResultItem[] = [];
        for (const item of indexItems) {
            if (!item.recordId || !allowedRecordIds.has(item.recordId)) {
                continue;
            }
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
