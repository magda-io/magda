import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import { buildSearchQueryBody } from "./queryBuilder.js";
import { mapSearchResults } from "./resultMapper.js";
import { filterByMinScore, keepTopK } from "./filters.js";
import type {
    SearchParams,
    SearchResultItem,
    SemanticIndexerConfig
} from "../model.js";

export class SemanticSearchService {
    constructor(
        private embeddingApiClient: EmbeddingApiClient,
        private openSearchClient: OpensearchApiClient,
        private semanticIndexerConfig: SemanticIndexerConfig
    ) {}

    async search(searchParams: SearchParams): Promise<SearchResultItem[]> {
        const embeddingVector = await this.embeddingApiClient.get(
            searchParams.query
        );

        const indexName = `${this.semanticIndexerConfig.indexName}-v${this.semanticIndexerConfig.indexVersion}`;
        const inMemoryMode = this.semanticIndexerConfig.mode === "in_memory";
        const fetchSize = inMemoryMode
            ? searchParams.max_num_results
            : searchParams.max_num_results * 2;

        const queryBody = buildSearchQueryBody(
            embeddingVector,
            searchParams,
            fetchSize
        );

        const searchResponse = await this.openSearchClient.search(
            indexName,
            queryBody
        );

        let items = mapSearchResults(searchResponse);

        if (!inMemoryMode) {
            items = filterByMinScore(items, searchParams.minScore);
            items = keepTopK(items, searchParams.max_num_results);
        }

        return items;
    }
}
