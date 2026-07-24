### What & when

A semantic indexer is a minion that turns a chosen source — a distribution's content, a custom aspect, an external API — into vector-indexed text so it can be retrieved by *meaning* rather than by keyword. It listens for records the same way any other minion does, but instead of writing an aspect back to the registry, it produces text, has that text embedded, and writes the resulting vectors to Magda's semantic index. That index is what powers meaning-based retrieval for AI agents and the in-browser chatbot.

It helps to keep two tiers in mind (see [Semantic Search & Semantic Indexers](<./architecture/Guide to Magda Internals.md#semantic-search--semantic-indexers>) for the full picture). `magda-indexer` is fixed to the dataset **metadata** model — titles, descriptions, keywords, publishers — and you do not need to touch it to get semantic search over that metadata. Build a semantic indexer when you need to make something *else* semantically searchable: the actual **content** inside a distribution (a PDF, a CSV), or a **custom aspect** your own connectors or minions have written. If all you want is meaning-based search over standard dataset metadata, rely on `magda-indexer` and stop here.

### Designing your representation

This is the part that matters most, and the part no framework can do for you. The text your indexer emits *is* its product. Everything downstream — the embedding model, the vector index, the ranking — operates on that text and nothing else. If the text does not contain the meaning someone will later search for, no amount of tuning recovers it.

So design the text backward from the query. Picture the AI agent that will eventually search for it: it sends a natural-language query to `/search`, then calls `/retrieve` for the fuller passage once a hit looks promising. What question is it asking, and in what words? The text you emit should read like a good answer to that question. A row of coordinates is not searchable by "flood risk near the river"; a sentence that says "elevation samples along the Yarra River floodplain" is. You are not archiving the source faithfully — you are writing the description of the source that you wish existed when someone goes looking for it.

Crucially, think beyond files. It is tempting to assume a "source" is a document you can read top to bottom, but as argued in ["Data is available — can your AI assistant help you actually use it?"](https://jacky-jiang.medium.com/data-is-available-can-your-ai-assistant-help-you-actually-use-it-464241e996ce), the most valuable data usually is *not* prose, and each format demands its own representation strategy:

- **BIM / 3D models** carry their meaning in structured element schedules, space names, and system classifications — not in geometry.
- **Images** may have no embedded text at all; their meaning lives in captions, alt text, and the surrounding document that refers to them — or in a description you generate for them (see below).
- **Audio / video** need a transcript or a scene/segment summary before there is anything to embed — typically produced by a speech-to-text or captioning model.
- **Tabular data** is defined by its columns, units, coverage, and a sample of representative values — not by dumping every cell.
- **APIs** are described by what they return and the questions they answer, not by their raw payloads.

**Generate the representation when the source doesn't carry one.** For media with little or no usable text, `createEmbeddingText` can *produce* the description with a model rather than only extracting text that already exists. Run a vision-language model (e.g. Qwen3-Omni) over an image to emit a structured caption — objects, scene, attributes, and any on-screen text — and an OCR engine (e.g. Tesseract) to capture embedded text verbatim; run a speech/audio model (e.g. Whisper or Qwen2-Audio) over audio and video for a transcript or a scene-by-scene summary. You then index the model's output, so keep its prompt search-oriented (ask for specific objects, attributes, counts, and verbatim visible text rather than free-form prose) — that generated text is all the retriever ever sees.

A few concrete prompts to reason it through before you write any code:

- *What would you index for a BIM file?* The element schedule (walls, doors, HVAC), the named spaces and levels, and a plain-language summary of what the building/asset is and what disciplines it covers.
- *What would you index for a chart image?* The caption, and the nearby text that mentions it — "Figure 3 shows quarterly rainfall for the Murray-Darling Basin, 2010–2020" is far more retrievable than the pixels.
- *What would you index for a tabular dataset?* The column names and units, the temporal and spatial coverage, and a short natural-language summary of what one row represents.

Write these decisions down before you touch the SDK. Everything after this is plumbing.

### The SDK & the indexer contract

You build a semantic indexer with `@magda/semantic-indexer-sdk`. Its default export, `semanticIndexer(userConfig)`, wires up the minion lifecycle, and `commonYargs(defaultPort, defaultInternalUrl)` builds the standard argument set (registry, embedding API, OpenSearch, storage) shared by all indexers — exactly like `@magda/minion-sdk`'s `commonYargs`.

Configuration is a `SemanticIndexerOptions` object:

```ts
interface SemanticIndexerOptions {
    argv: SemanticIndexerArguments;
    id: string;
    itemType: ItemType;                  // "registryRecord" | "storageObject"
    aspects?: string[];                  // required when itemType === "registryRecord"
    optionalAspects?: string[];
    formatTypes?: string[];              // required when itemType === "storageObject"
    createEmbeddingText: CreateEmbeddingText;
    chunkStrategy?: ChunkStrategyType;
    chunkSizeLimit?: number;
    overlap?: number;
    autoDownloadFile?: boolean;          // storageObject only
    timeout?: string;
}
```

The heart of the contract is `createEmbeddingText` — this is where your representation design from the previous section becomes code:

```ts
type EmbeddingText = {
    text: string;
    subObjects?: Array<{
        subObjectId?: string;
        subObjectType?: string;
        text: string;
    }>;
};

type CreateEmbeddingTextParams = {
    record: Record;
    format: string | null;
    filePath: string | null;
    url: string | null;
    readonlyRegistry: Registry;
};

type CreateEmbeddingText = (
    params: CreateEmbeddingTextParams
) => Promise<EmbeddingText>;
```

You are handed the triggering `record`, and — depending on the item type — the resolved `format`, a local `filePath` (if a file was downloaded), the source `url`, and a read-only registry client for pulling in related records. You return the `text` to embed, optionally broken into `subObjects` when a single source naturally contains several independently-retrievable pieces (e.g. the sheets of a workbook, or the sections of a document).

**Chunking.** Embedding models have a bounded input window, so long text is split before embedding. By default the framework applies a recursive strategy governed by `chunkSizeLimit` (the maximum chunk size) and `overlap` (how much adjacent chunks share, so meaning that straddles a boundary is not lost — it must be less than half of `chunkSizeLimit`). Supply your own `chunkStrategy` if you have a smarter, format-aware way to split (for example, one chunk per table or per document section) rather than blind character-count slicing.

**`autoDownloadFile`.** This applies to `storageObject` indexers only. When set, the framework downloads the distribution's file from Magda's internal storage ahead of time and passes you the local `filePath`, so your `createEmbeddingText` can open and parse the file directly instead of fetching it itself. Registry-record indexers never touch files, so this option has no effect there.

### Worked example: a `registryRecord` indexer for a custom aspect

```ts
import semanticIndexer, {
    commonYargs,
    CreateEmbeddingText
} from "@magda/semantic-indexer-sdk";

const ID = "custom-notes-semantic-indexer";

// Turn a custom "custom-dataset-notes" aspect into the text we want retrievable.
// What you put here is a representation decision — see "Designing your representation".
const createEmbeddingText: CreateEmbeddingText = async ({ record }) => {
    const notes = (record.aspects && record.aspects["custom-dataset-notes"]) || {};
    const parts = [notes.summary, notes.usageNotes].filter(Boolean);
    return { text: parts.join("\n\n") };
};

const argv = commonYargs(6122, "http://localhost:6122");

semanticIndexer({
    argv,
    id: ID,
    itemType: "registryRecord",
    aspects: ["custom-dataset-notes"],
    createEmbeddingText
});
```

Because `itemType` is `"registryRecord"`, the `aspects` list must be non-empty — these are the aspects that both *trigger* the indexer (a change to any of them re-runs it) and *feed* it (they are the data your `createEmbeddingText` reads). From there the framework does the rest: it chunks the returned `text`, embeds each chunk via the embedding API, and writes the vectors to the semantic index. Whatever string you return in `text` is exactly what gets embedded — no more, no less.

### Deploy & register

A semantic indexer is packaged and deployed like any other minion: build a Docker image, wrap it in a Helm chart, and add it to your deployment's dependencies. Rather than repeat those steps here, follow [How to build your own connectors/minions](./how-to-build-your-own-connectors-minions.md) — the packaging, CI, and chart-publishing flow is identical. Once deployed, the indexer processes records as they change; to build (or rebuild) the index over data that already exists, trigger the minion `recrawl` interface for a global reindex.

### Verify via the query API

With the indexer running, confirm results are searchable by querying `magda-semantic-search-api`:

```bash
# Port-forward the gateway (see the e2e cluster deployment test doc), then
# run a natural-language query against /search:
curl -s -X POST "$BASE/api/v0/semantic-search/search" \
  -H "Content-Type: application/json" -H "X-Magda-Session: $JWT" \
  -d '{"query":"budget notes for the smoke test dataset","max_num_results":5}'
```

`/search` returns scored chunks, each with the matching `text` and the `recordId` it came from — this is the discovery step. An agent typically searches first, then calls `/retrieve` with the IDs it cares about to pull the full text, or the surrounding chunks (via `mode` / `precedingChunksNum` / `subsequentChunksNum`), when it needs more context. Results are access-filtered for the current user (the two-phase filtering — Phase 1 / Phase 2 — is described in the [architecture section](<./architecture/Guide to Magda Internals.md#semantic-search--semantic-indexers>)), so you only get back what that user is allowed to see. The `/api/v0/semantic-search` prefix comes from the gateway route mapping (`deploy/helm/internal-charts/gateway/values.yaml`: route key `semantic-search` → `http://semantic-search-api/v0`).

### Going further: content indexers

For a source that is a **file** rather than an aspect, look at [`magda-pdf-semantic-indexer`](https://github.com/magda-io/magda-pdf-semantic-indexer) and [`magda-csv-semantic-indexer`](https://github.com/magda-io/magda-csv-semantic-indexer) as `storageObject` examples. Both set `autoDownloadFile` so the framework hands them the downloaded file, key their parsing strategy off the distribution's format via `formatTypes`, and turn the file's content — PDF text, CSV columns and rows — into the representation they emit. They are the natural template when you want to index distribution content instead of registry metadata.

### See also

- [Semantic Search & Semantic Indexers](<./architecture/Guide to Magda Internals.md#semantic-search--semantic-indexers>) — the conceptual overview and the two-tier model.
- [Magda's hybrid search engine](./hybrid-search-engine.md) — how lexical and semantic search combine.
- ["Data is available — can your AI assistant help you actually use it?"](https://jacky-jiang.medium.com/data-is-available-can-your-ai-assistant-help-you-actually-use-it-464241e996ce) — why representation, not files, is the real problem.
- ["Magda v5.0.0 release: introducing hybrid search, in-browser LLM chatbot & SQL Console"](https://jacky-jiang.medium.com/magda-v5-0-0-release-introducing-hybrid-search-in-browser-llm-chatbot-sqlconsole-84c043dd461b) — the release that introduced hybrid search over metadata.
- Example repositories: [`magda-pdf-semantic-indexer`](https://github.com/magda-io/magda-pdf-semantic-indexer) and [`magda-csv-semantic-indexer`](https://github.com/magda-io/magda-csv-semantic-indexer).
