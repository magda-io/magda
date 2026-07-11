import { Command } from "commander";
import { clientFromProfile } from "../client.js";
import { SEARCH_DATASETS, SEMANTIC_SEARCH } from "../endpoints.js";
import { MgdApiError } from "../errors.js";
import { note, printData, resolveMode } from "../output.js";

// The semantic search API is absent (404) on sites without the feature, but a
// deployed-yet-unindexed site instead 500s with an OpenSearch "no such index
// [semantic-index-v1]" message until a semantic indexer runs. Treat both as
// "unavailable" so agents get the documented structured error either way.
function isSemanticUnavailable(e: MgdApiError): boolean {
    if (e.status === 404) return true;
    return (
        e.status >= 500 &&
        /no such index|index not found|semantic-index/i.test(e.message)
    );
}

export function registerSearchCommands(program: Command): void {
    const search = program.command("search").description("Search the catalog");

    search
        .command("datasets <query>")
        .description("Keyword dataset search")
        .option("--limit <n>", "max results", "10")
        .option("--offset <n>", "result offset", "0")
        .option("--json", "output full response as JSON")
        .option("--jsonl", "output one dataset per line")
        .action(async (query: string, opts) => {
            const client = await clientFromProfile();
            const result = await client.json<any>("GET", SEARCH_DATASETS, {
                query: {
                    query,
                    start: Number(opts.offset),
                    limit: Number(opts.limit)
                }
            });
            const mode = resolveMode(opts);
            if (mode === "human") {
                for (const ds of result.dataSets ?? []) {
                    process.stdout.write(`${ds.identifier}\t${ds.title}\n`);
                }
                note(
                    `${result.dataSets?.length ?? 0} of ${
                        result.hitCount
                    } results`
                );
            } else {
                printData(mode, result, result.dataSets ?? []);
            }
        });

    search
        .command("semantic <query>")
        .description("Semantic (embedding) dataset/content search")
        .option("--limit <n>", "max results", "10")
        .option("--json", "output full response as JSON")
        .option("--jsonl", "output one result per line")
        .action(async (query: string, opts) => {
            const client = await clientFromProfile();
            let results: any[];
            try {
                results = await client.json<any[]>("GET", SEMANTIC_SEARCH, {
                    query: { query, max_num_results: Number(opts.limit) }
                });
            } catch (e) {
                if (e instanceof MgdApiError && isSemanticUnavailable(e)) {
                    throw new MgdApiError(
                        "Semantic search is not available on this MAGDA site.",
                        501,
                        "semantic-search-unavailable",
                        "Use `mgd search datasets` instead."
                    );
                }
                throw e;
            }
            const mode = resolveMode(opts);
            if (mode === "human") {
                for (const r of results) {
                    const text = String(r.text ?? "").replace(/\s+/g, " ");
                    process.stdout.write(
                        `${r.recordId}\t${
                            r.score?.toFixed?.(3) ?? r.score
                        }\t${text.slice(0, 80)}\n`
                    );
                }
                note(`${results.length} results`);
            } else {
                printData(mode, results);
            }
        });
}
