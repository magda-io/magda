import type { SearchResultItem } from "../model.js";

export function filterByMinScore(
    results: SearchResultItem[],
    minScore?: number
): SearchResultItem[] {
    if (!minScore || minScore <= 0 || minScore > 1) {
        return results;
    }
    return results.filter((item) => item.score >= minScore);
}

export function keepTopK(
    items: SearchResultItem[],
    k: number
): SearchResultItem[] {
    if (typeof k !== "number" || isNaN(k) || k < 0) {
        throw new Error("k must be a valid non-negative integer");
    }

    return [...items].sort((a, b) => b.score - a.score).slice(0, k);
}
