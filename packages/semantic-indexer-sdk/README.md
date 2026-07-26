### MAGDA Semantic Indexer SDK

A semantic indexer is a [Magda](https://github.com/magda-io/magda) minion that turns a chosen source — a distribution's file content, a registry record's aspects, or an external API — into vector-indexed text, so it can be retrieved by *meaning* rather than by keyword. The resulting vectors are written to Magda's semantic index and served by the semantic search query API (`magda-semantic-search-api`), which powers meaning-based retrieval for AI agents and the in-browser chatbot.

This SDK provides the framework — the minion lifecycle, chunking, embedding, and OpenSearch indexing — so you can focus on the one decision that matters: **what text should represent your source**.

> 📖 **Full guide:** [How to build a semantic indexer](https://github.com/magda-io/magda/blob/main/docs/docs/how-to-build-a-semantic-indexer.md) — the concepts, the representation mindset (designing the text backward from how it will be searched), and a complete walkthrough.

### Get Started

```ts
import semanticIndexer, {
    commonYargs,
    CreateEmbeddingText
} from "@magda/semantic-indexer-sdk";

const ID = "custom-notes-semantic-indexer";

// What text should represent this source? That is the core design decision —
// see the "Designing your representation" section of the guide.
const createEmbeddingText: CreateEmbeddingText = async ({ record }) => {
    const notes =
        (record.aspects && record.aspects["custom-dataset-notes"]) || {};
    const parts = [notes.summary, notes.usageNotes].filter(Boolean);
    return { text: parts.join("\n\n") };
};

const argv = commonYargs(6122, "http://localhost:6122");

semanticIndexer({
    argv,
    id: ID,
    // "registryRecord" indexes registry metadata / custom aspects;
    // use "storageObject" (with `formatTypes`) to index distribution file content.
    itemType: "registryRecord",
    aspects: ["custom-dataset-notes"],
    createEmbeddingText
}).catch((e: Error) => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
```

The `itemType` selects what you index (`registryRecord` for metadata/custom aspects, `storageObject` for distribution file content), and `createEmbeddingText` returns the text to embed. The framework then chunks, embeds, and indexes it. See the guide for the full option reference and chunking controls.

### Learn more

- [How to build a semantic indexer](https://github.com/magda-io/magda/blob/main/docs/docs/how-to-build-a-semantic-indexer.md) — the full how-to guide.
- [Semantic Search & Semantic Indexers](https://github.com/magda-io/magda/blob/main/docs/docs/architecture/Guide%20to%20Magda%20Internals.md#semantic-search--semantic-indexers) — where semantic indexers fit in Magda's architecture.
- Example indexers: [`magda-pdf-semantic-indexer`](https://github.com/magda-io/magda-pdf-semantic-indexer) and [`magda-csv-semantic-indexer`](https://github.com/magda-io/magda-csv-semantic-indexer).
