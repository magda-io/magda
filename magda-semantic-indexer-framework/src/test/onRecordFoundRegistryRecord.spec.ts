import sinon from "sinon";
import { onRecordFoundRegistryRecord } from "../onRecordFoundRegistryRecord.js";
import { createRecord, expectNoThrowsAsync } from "./helpers.js";
import { BaseSemanticIndexerTest } from "./BaseSemanticIndexerTest.js";

describe("onRecordFoundRegistryRecord", () => {
    let testEnv: BaseSemanticIndexerTest;

    beforeEach(() => {
        testEnv = new BaseSemanticIndexerTest();
    });

    afterEach(() => {
        testEnv.cleanup();
    });

    it("Should handle and index records with expected aspects", async () => {
        testEnv.createEmbeddingTextStub.callsFake((params: any) => {
            return Promise.resolve({
                text:
                    "embedding text: " +
                    params.record.aspects["test-aspect"].text
            });
        });

        const userConfig = testEnv.updateUserConfig({
            aspects: ["test-aspect"]
        });

        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.registry
        );

        testEnv.chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.chunker.chunk
            .withArgs("embedding text: test2")
            .returns([{ text: "test2", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);
        testEnv.embeddingApiClient.get
            .withArgs(["test2"])
            .resolves([[0.4, 0.5, 0.6]]);

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

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 2,
            chunkCallCount: 2,
            embeddingApiCallCount: 2,
            bulkIndexCallCount: 2,
            deleteByQueryCallCount: 2
        });

        const expectedDocs1 = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
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
                index_text_chunk_overlap: 0,
                indexerId: testEnv.userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        testEnv.expectIndexedDocs(expectedDocs1, 0);
        testEnv.expectIndexedDocs(expectedDocs2, 1);
    });

    it("should not handle records without expected aspects", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "registryRecord",
            aspects: ["test-aspect"]
        });

        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.registry
        );

        testEnv.chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);

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

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 0,
            chunkCallCount: 0,
            embeddingApiCallCount: 0,
            bulkIndexCallCount: 0,
            deleteByQueryCallCount: 0
        });
    });

    it("should skip this record when embeddingApiClient throws an error", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "registryRecord",
            aspects: ["test-aspect"]
        });

        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.registry
        );

        testEnv.chunker.chunk
            .withArgs(testEnv.DEFAULT_CREATE_EMBEDDING_TEXT_RESULT.text)
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
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
        const userConfig = testEnv.updateUserConfig({
            itemType: "registryRecord",
            aspects: ["test-aspect"]
        });

        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.registry
        );

        testEnv.chunker.chunk
            .withArgs(testEnv.DEFAULT_CREATE_EMBEDDING_TEXT_RESULT.text)
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);
        testEnv.opensearchApiClient.bulkIndexDocument.rejects(
            new Error("index error")
        );

        await expectNoThrowsAsync(() =>
            onRecordFound(
                createRecord({ id: "id1", aspects: { "test-aspect": {} } }),
                null as any
            )
        );
    });

    it("should skip this record when createEmbeddingText throws an error", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "registryRecord",
            aspects: ["test-aspect"],
            createEmbeddingText: sinon
                .stub()
                .rejects(new Error("create embedding text error"))
        });

        const onRecordFound = onRecordFoundRegistryRecord(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.registry
        );

        testEnv.chunker.chunk
            .withArgs(testEnv.DEFAULT_CREATE_EMBEDDING_TEXT_RESULT.text)
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);
        testEnv.opensearchApiClient.bulkIndexDocument.resolves();

        await expectNoThrowsAsync(() =>
            onRecordFound(
                createRecord({ id: "id1", aspects: { "test-aspect": {} } }),
                null as any
            )
        );
    });
});
