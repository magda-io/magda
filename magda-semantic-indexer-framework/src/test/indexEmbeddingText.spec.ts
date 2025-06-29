import { indexEmbeddingText } from "../indexEmbeddingText.js";
import { BaseSemanticIndexerTest } from "./BaseSemanticIndexerTest.js";

describe("indexEmbeddingText", () => {
    let testEnv: BaseSemanticIndexerTest;

    beforeEach(() => {
        testEnv = new BaseSemanticIndexerTest();
    });

    afterEach(() => {
        testEnv.cleanup();
    });

    it("should chunk, embed and index user text", async () => {
        const embeddingTextResult = { text: "main text" };
        testEnv.chunker.chunk.returns([
            { text: "a", length: 1, position: 0, overlap: 0 }
        ]);
        testEnv.embeddingApiClient.get.resolves([[0.1, 0.2, 0.3]]);

        const config = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        await indexEmbeddingText({
            options: config,
            embeddingText: embeddingTextResult,
            chunker: testEnv.chunker,
            embeddingApiClient: testEnv.embeddingApiClient,
            opensearchApiClient: testEnv.opensearchApiClient,
            metadata: {
                recordId: "id1",
                fileFormat: "csv"
            }
        });

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 0,
            chunkCallCount: 1,
            embeddingApiCallCount: 1,
            bulkIndexCallCount: 1,
            deleteByQueryCallCount: 1
        });

        const expectedDoc = {
            itemType: config.itemType,
            recordId: "id1",
            fileFormat: "csv",
            index_text_chunk: "a",
            embedding: [0.1, 0.2, 0.3],
            only_one_index_text_chunk: true,
            index_text_chunk_length: 1,
            index_text_chunk_position: 0,
            index_text_chunk_overlap: 0,
            indexerId: testEnv.userConfig.id,
            createTime: testEnv.getCurrentTimeString(),
            updateTime: testEnv.getCurrentTimeString()
        };

        testEnv.expectIndexedDoc(expectedDoc);
    });

    it("should correctly handle multiple chunks with overlap and index multiple chunks", async () => {
        const embeddingTextResult = {
            text: "long text that needs multiple chunks"
        };
        testEnv.chunker.chunk.returns([
            { text: "long text", length: 9, position: 0, overlap: 2 },
            { text: "text that", length: 9, position: 7, overlap: 2 },
            { text: "that needs", length: 10, position: 14, overlap: 2 }
        ]);
        testEnv.embeddingApiClient.get.resolves([
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
            [0.7, 0.8, 0.9]
        ]);

        const config = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["txt"]
        });
        config.argv.semanticIndexerConfig.bulkIndexSize = 3;
        config.argv.semanticIndexerConfig.bulkEmbeddingsSize = 3;

        await indexEmbeddingText({
            options: config,
            embeddingText: embeddingTextResult,
            chunker: testEnv.chunker,
            embeddingApiClient: testEnv.embeddingApiClient,
            opensearchApiClient: testEnv.opensearchApiClient,
            metadata: {
                recordId: "id2",
                fileFormat: "txt"
            }
        });

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 0,
            chunkCallCount: 1,
            embeddingApiCallCount: 1,
            bulkIndexCallCount: 1,
            deleteByQueryCallCount: 1
        });

        const expectedDocs = [
            {
                itemType: config.itemType,
                recordId: "id2",
                fileFormat: "txt",
                index_text_chunk: "long text",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: false,
                index_text_chunk_length: 9,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 2,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            },
            {
                itemType: config.itemType,
                recordId: "id2",
                fileFormat: "txt",
                index_text_chunk: "text that",
                embedding: [0.4, 0.5, 0.6],
                only_one_index_text_chunk: false,
                index_text_chunk_length: 9,
                index_text_chunk_position: 7,
                index_text_chunk_overlap: 2,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            },
            {
                itemType: config.itemType,
                recordId: "id2",
                fileFormat: "txt",
                index_text_chunk: "that needs",
                embedding: [0.7, 0.8, 0.9],
                only_one_index_text_chunk: false,
                index_text_chunk_length: 10,
                index_text_chunk_position: 14,
                index_text_chunk_overlap: 2,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        testEnv.expectIndexedDocs(expectedDocs);
    });

    it("should handle text and subObjects and index into opensearch", async () => {
        testEnv.chunker.chunk
            .withArgs("main text")
            .returns([
                { text: "main text", length: 9, position: 0, overlap: 0 }
            ]);
        testEnv.chunker.chunk
            .withArgs("table1")
            .returns([{ text: "table1", length: 6, position: 0, overlap: 0 }]);
        testEnv.chunker.chunk
            .withArgs("table2")
            .returns([{ text: "table2", length: 6, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get.resolves([[0.1, 0.2, 0.3]]);

        const embeddingTextResult = {
            text: "main text",
            subObjects: [
                { subObjectId: "1", subObjectType: "table", text: "table1" },
                { subObjectId: "2", subObjectType: "table", text: "table2" }
            ]
        };

        const config = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        await indexEmbeddingText({
            options: config,
            embeddingText: embeddingTextResult,
            chunker: testEnv.chunker,
            embeddingApiClient: testEnv.embeddingApiClient,
            opensearchApiClient: testEnv.opensearchApiClient,
            metadata: {
                recordId: "id4",
                fileFormat: "csv"
            }
        });

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 0,
            chunkCallCount: 3,
            embeddingApiCallCount: 3,
            bulkIndexCallCount: 3,
            deleteByQueryCallCount: 3
        });

        const expectedDocs = [
            {
                itemType: config.itemType,
                recordId: "id4",
                fileFormat: "csv",
                index_text_chunk: "main text",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 9,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        const expectedSubObjectDocs1 = [
            {
                itemType: config.itemType,
                recordId: "id4",
                fileFormat: "csv",
                subObjectId: "1",
                subObjectType: "table",
                index_text_chunk: "table1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 6,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        const expectedSubObjectDocs2 = [
            {
                itemType: config.itemType,
                recordId: "id4",
                fileFormat: "csv",
                subObjectId: "2",
                subObjectType: "table",
                index_text_chunk: "table2",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 6,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        testEnv.expectIndexedDocs(expectedDocs, 0);
        testEnv.expectIndexedDocs(expectedSubObjectDocs1, 1);
        testEnv.expectIndexedDocs(expectedSubObjectDocs2, 2);
    });
});
