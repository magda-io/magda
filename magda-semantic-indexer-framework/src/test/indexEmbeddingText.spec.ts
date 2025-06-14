import { expect } from "chai";
import sinon from "sinon";
import { indexEmbeddingText } from "../indexEmbeddingText.js";
import { createFakeSemanticIndexerConfig } from "./helpers.js";

describe("indexEmbeddingText", () => {
    let chunker: any;
    let embeddingApiClient: any;
    let opensearchApiClient: any;
    let config: any;

    beforeEach(() => {
        chunker = { chunk: sinon.stub() };
        embeddingApiClient = { get: sinon.stub() };
        opensearchApiClient = { bulkIndexDocument: sinon.stub().resolves() };
    });

    it("should chunk, embed and index user text", async () => {
        const embeddingTextResult = { text: "main text" };
        chunker.chunk.returns([
            { text: "a", length: 1, position: 0, overlap: 0 }
        ]);
        embeddingApiClient.get.resolves([[0.1, 0.2, 0.3]]);
        config = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        await indexEmbeddingText(
            config,
            embeddingTextResult,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            "id1",
            "csv"
        );

        expect(chunker.chunk.calledOnce).to.be.true;
        expect(embeddingApiClient.get.calledOnce).to.be.true;
        expect(opensearchApiClient.bulkIndexDocument.calledOnce).to.be.true;
        const expectedDoc = {
            itemType: config.itemType,
            recordId: "id1",
            fileFormat: "csv",
            index_text_chunk: "a",
            embedding: [0.1, 0.2, 0.3],
            only_one_index_text_chunk: true,
            index_text_chunk_length: 1,
            index_text_chunk_position: 0,
            index_text_chunk_overlap: 0
        };

        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1][0]
        ).to.deep.equal(expectedDoc);
    });

    it("should correctly handle multiple chunks with overlap and index multiple chunks", async () => {
        const embeddingTextResult = {
            text: "long text that needs multiple chunks"
        };
        chunker.chunk.returns([
            { text: "long text", length: 9, position: 0, overlap: 2 },
            { text: "text that", length: 9, position: 7, overlap: 2 },
            { text: "that needs", length: 10, position: 14, overlap: 2 }
        ]);
        embeddingApiClient.get.resolves([
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
            [0.7, 0.8, 0.9]
        ]);
        config = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            formatTypes: ["txt"]
        });
        config.argv.semanticIndexerConfig.semanticIndexer.bulkIndexSize = 3;
        config.argv.semanticIndexerConfig.semanticIndexer.bulkEmbeddingsSize = 3;

        await indexEmbeddingText(
            config,
            embeddingTextResult,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            "id2",
            "txt"
        );

        expect(chunker.chunk.calledOnce).to.be.true;
        expect(embeddingApiClient.get.calledOnce).to.be.true;
        expect(opensearchApiClient.bulkIndexDocument.calledOnce).to.be.true;

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
                index_text_chunk_overlap: 2
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
                index_text_chunk_overlap: 2
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
                index_text_chunk_overlap: 2
            }
        ];

        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1]
        ).to.deep.equal(expectedDocs);
    });

    it("should handle text and subObjects and index into opensearch", async () => {
        chunker.chunk
            .withArgs("main text")
            .returns([
                { text: "main text", length: 9, position: 0, overlap: 0 }
            ]);
        chunker.chunk
            .withArgs("table1")
            .returns([{ text: "table1", length: 6, position: 0, overlap: 0 }]);
        chunker.chunk
            .withArgs("table2")
            .returns([{ text: "table2", length: 6, position: 0, overlap: 0 }]);
        embeddingApiClient.get.resolves([[0.1, 0.2, 0.3]]);
        const embeddingTextResult = {
            text: "main text",
            subObjects: [
                { subObjectId: "1", subObjectType: "table", text: "table1" },
                { subObjectId: "2", subObjectType: "table", text: "table2" }
            ]
        };
        config = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        await indexEmbeddingText(
            config,
            embeddingTextResult,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            "id4",
            "csv"
        );

        expect(chunker.chunk.callCount).to.equal(3);
        expect(embeddingApiClient.get.callCount).to.equal(3);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(3);

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
                index_text_chunk_overlap: 0
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
                index_text_chunk_overlap: 0
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
                index_text_chunk_overlap: 0
            }
        ];

        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1]
        ).to.deep.equal(expectedDocs);
        expect(
            opensearchApiClient.bulkIndexDocument.secondCall.args[1]
        ).to.deep.equal(expectedSubObjectDocs1);
        expect(
            opensearchApiClient.bulkIndexDocument.thirdCall.args[1]
        ).to.deep.equal(expectedSubObjectDocs2);
    });
});
