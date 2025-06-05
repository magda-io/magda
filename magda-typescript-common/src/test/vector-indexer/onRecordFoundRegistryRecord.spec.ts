import { expect } from "chai";
import sinon from "sinon";
import { onRecordFoundRegistryRecord } from "../../semantic-indexer/onRecordFoundRegistryRecord.js";
import {
    createFakeSemanticIndexerConfig,
    createRecord,
    expectNoThrowsAsync
} from "./util.js";

describe("onRecordFoundRegistryRecord", () => {
    let userConfig: any;
    let chunker: any;
    let embeddingApiClient: any;
    let opensearchApiClient: any;
    let createEmbeddingTextStub: any;
    let consoleLogStub: any;
    let consoleWarnStub: any;
    let consoleErrorStub: any;

    beforeEach(() => {
        chunker = { chunk: sinon.stub() };
        embeddingApiClient = { get: sinon.stub() };
        opensearchApiClient = opensearchApiClient = {
            bulkIndexDocument: sinon.stub().resolves()
        };
        createEmbeddingTextStub = sinon.stub();
        consoleLogStub = sinon.stub(console, "log");
        consoleWarnStub = sinon.stub(console, "warn");
        consoleErrorStub = sinon.stub(console, "error");
    });

    afterEach(() => {
        consoleLogStub.restore();
        consoleWarnStub.restore();
        consoleErrorStub.restore();
    });

    it("Should handle and index records with expected aspects", async () => {
        createEmbeddingTextStub.callsFake((params: any) => {
            return Promise.resolve({
                text:
                    "embedding text: " +
                    params.record.aspects["test-aspect"].text
            });
        });
        userConfig = createFakeSemanticIndexerConfig({
            aspects: ["test-aspect"],
            createEmbeddingText: createEmbeddingTextStub
        });
        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        chunker.chunk
            .withArgs("embedding text: test2")
            .returns([{ text: "test2", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);
        embeddingApiClient.get.withArgs(["test2"]).resolves([[0.4, 0.5, 0.6]]);
        await onRecordFound(
            createRecord({
                id: "id1",
                aspects: { "test-aspect": { text: "test1" } }
            }),
            null as any
        );
        await onRecordFound(
            createRecord({
                id: "id2",
                aspects: { "test-aspect": { text: "test2" } }
            }),
            null as any
        );

        expect(createEmbeddingTextStub.callCount).to.equal(2);
        expect(chunker.chunk.callCount).to.equal(2);
        expect(embeddingApiClient.get.callCount).to.equal(2);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(2);
        const expectedDocs1 = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0
            }
        ];

        const expectedDocs2 = [
            {
                itemType: userConfig.itemType,
                recordId: "id2",
                index_text_chunk: "test2",
                embedding: [0.4, 0.5, 0.6],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0
            }
        ];

        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1]
        ).to.deep.equal(expectedDocs1);
        expect(
            opensearchApiClient.bulkIndexDocument.secondCall.args[1]
        ).to.deep.equal(expectedDocs2);
    });

    it("should not handle records without expected aspects", async () => {
        const userConfig = createFakeSemanticIndexerConfig({
            itemType: "registryRecord",
            aspects: ["test-aspect"]
        });

        const createEmbeddingTextStub = sinon.stub().resolves({
            text: "embedding text: test1"
        });
        userConfig.createEmbeddingText = createEmbeddingTextStub;

        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);

        await onRecordFound(
            createRecord({ id: "id1", aspects: {} }),
            null as any
        );
        await onRecordFound(
            createRecord({ id: "id2", aspects: { "other-aspect": {} } }),
            null as any
        );
        await onRecordFound(
            createRecord({ id: "id3", aspects: null }),
            null as any
        );

        expect(createEmbeddingTextStub.callCount).to.equal(0);
        expect(chunker.chunk.callCount).to.equal(0);
        expect(embeddingApiClient.get.callCount).to.equal(0);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(0);
    });

    it("should skip this record when embeddingApiClient throws an error", async () => {
        const userConfig = createFakeSemanticIndexerConfig({
            itemType: "registryRecord",
            aspects: ["test-aspect"]
        });

        const createEmbeddingTextStub = sinon.stub().resolves({
            text: "embedding text: test1"
        });
        userConfig.createEmbeddingText = createEmbeddingTextStub;

        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get
            .withArgs(["test1"])
            .rejects(new Error("throw test error"));

        await expectNoThrowsAsync(() =>
            onRecordFound(
                createRecord({ id: "id1", aspects: { "test-aspect": {} } }),
                null as any
            )
        );
    });

    it("should skip this record when opensearchApiClient throws an error", async () => {
        const userConfig = createFakeSemanticIndexerConfig({
            itemType: "registryRecord",
            aspects: ["test-aspect"]
        });

        const createEmbeddingTextStub = sinon.stub().resolves({
            text: "embedding text: test1"
        });
        userConfig.createEmbeddingText = createEmbeddingTextStub;

        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);
        opensearchApiClient.bulkIndexDocument.rejects(new Error("index error"));

        await expectNoThrowsAsync(() =>
            onRecordFound(
                createRecord({ id: "id1", aspects: { "test-aspect": {} } }),
                null as any
            )
        );
    });

    it("should skip this record when createEmbeddingText throws an error", async () => {
        const userConfig = createFakeSemanticIndexerConfig({
            itemType: "registryRecord",
            aspects: ["test-aspect"]
        });

        const createEmbeddingTextStub = sinon
            .stub()
            .rejects(new Error("create embedding text error"));
        userConfig.createEmbeddingText = createEmbeddingTextStub;

        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);
        opensearchApiClient.bulkIndexDocument.resolves();

        await expectNoThrowsAsync(() =>
            onRecordFound(
                createRecord({ id: "id1", aspects: { "test-aspect": {} } }),
                null as any
            )
        );
    });
});
