import { expect } from "chai";
import sinon from "sinon";
import { onRecordFoundStorageObject } from "../onRecordFoundStorageObject.js";
import { createRecord, expectNoThrowsAsync } from "./helpers.js";
import { BaseSemanticIndexerTest } from "./BaseSemanticIndexerTest.js";
import fs from "fs";
import nock from "nock";
import { tmpdir } from "os";
import { join } from "path";

describe("onRecordFoundStorageObject", () => {
    let testEnv: BaseSemanticIndexerTest;

    beforeEach(() => {
        testEnv = new BaseSemanticIndexerTest({
            suppressConsoleLogs: true
        });
    });

    afterEach(() => {
        testEnv.cleanup();
    });

    it("should handle and index storage object with expected formatType, with autoDownloadFile disabled", async () => {
        testEnv.createEmbeddingTextStub.resolves({
            text: "embedding text: test1"
        });
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"],
            autoDownloadFile: false
        });

        testEnv.chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "csv" },
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: "http://test.com/file.csv"
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );
        await onRecordFound(record, testEnv.registry);

        const expectedDocs = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                parentRecordId: testEnv.DEFAULT_PARENT_RECORD_ID,
                fileFormat: "csv",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 1,
            chunkCallCount: 1,
            embeddingApiCallCount: 1,
            bulkIndexCallCount: 1,
            deleteByQueryCallCount: 1
        });

        testEnv.expectCalledWith(testEnv.createEmbeddingTextStub, 0, {
            record,
            format: "csv",
            filePath: null,
            url: "http://test.com/file.csv",
            readonlyRegistry: testEnv.registry
        });

        testEnv.expectIndexedDocs(expectedDocs);
    });

    it("should handle and index storage object with expected formatType, with autoDownloadFile enabled", async () => {
        const fileContent = "test1";
        nock("http://test.com").get("/file.csv").reply(200, fileContent);

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "csv" },
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: "http://test.com/file.csv"
                }
            }
        });

        let usedFilePath = null;
        testEnv.createEmbeddingTextStub.callsFake(
            async ({ record, format, filePath, url }) => {
                expect(record).to.deep.equal(record);
                expect(format).to.equal("csv");
                expect(fs.existsSync(filePath)).to.be.true;
                expect(url).to.equal("http://test.com/file.csv");
                const content = fs.readFileSync(filePath, "utf-8");
                expect(content).to.equal("test1");
                usedFilePath = filePath;
                return { text: "embedding text: test1" };
            }
        );

        testEnv.chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);

        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"],
            autoDownloadFile: true
        });

        const expectedDocs = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                parentRecordId: testEnv.DEFAULT_PARENT_RECORD_ID,
                fileFormat: "csv",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );
        await onRecordFound(record, testEnv.registry);

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 1,
            chunkCallCount: 1,
            embeddingApiCallCount: 1,
            bulkIndexCallCount: 1,
            deleteByQueryCallCount: 1
        });

        testEnv.expectIndexedDocs(expectedDocs);

        if (usedFilePath) {
            expect(fs.existsSync(usedFilePath)).to.be.false;
        }
        nock.cleanAll();
    });

    it("should successfully download file from minio", async () => {
        const fileContent = "test1";
        const downloadUrl =
            "magda://storage-api/fake-parent-record-id/id1/file.csv";
        const tempDir = tmpdir();
        const tempFilePath = join(tempDir, "file.csv");
        testEnv.minioClient.downloadFile
            .withArgs(downloadUrl)
            .callsFake(async () => {
                fs.writeFileSync(tempFilePath, fileContent);
                return tempFilePath;
            });

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "csv" },
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: downloadUrl
                }
            }
        });

        let usedFilePath = null;
        testEnv.createEmbeddingTextStub.callsFake(
            async ({ record, format, filePath, url }) => {
                expect(record).to.deep.equal(record);
                expect(format).to.equal("csv");
                expect(fs.existsSync(filePath)).to.be.true;
                expect(url).to.equal(downloadUrl);
                const content = fs.readFileSync(filePath, "utf-8");
                expect(content).to.equal("test1");
                usedFilePath = filePath;
                return { text: "embedding text: test1" };
            }
        );

        testEnv.chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);

        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"],
            autoDownloadFile: true
        });

        const expectedDocs = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                parentRecordId: testEnv.DEFAULT_PARENT_RECORD_ID,
                fileFormat: "csv",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );
        await onRecordFound(record, testEnv.registry);

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 1,
            chunkCallCount: 1,
            embeddingApiCallCount: 1,
            bulkIndexCallCount: 1,
            deleteByQueryCallCount: 1
        });

        testEnv.expectIndexedDocs(expectedDocs);

        if (usedFilePath) {
            expect(fs.existsSync(usedFilePath)).to.be.false;
        }
        nock.cleanAll();
    });

    it("should filter out records with unexpected formatType", async () => {
        testEnv.createEmbeddingTextStub.resolves({
            text: "embedding text: test1"
        });
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"],
            autoDownloadFile: false
        });

        testEnv.chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "json" },
                "dcat-distribution-strings": {
                    format: "json",
                    downloadURL: "http://test.com/file.json"
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );

        await onRecordFound(record, testEnv.registry);

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 0,
            chunkCallCount: 0,
            embeddingApiCallCount: 0,
            bulkIndexCallCount: 0,
            deleteByQueryCallCount: 0
        });
    });

    it("should handle and index storage object with multiple expected format types", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv", "json"],
            autoDownloadFile: false
        });

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "csv" },
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: "http://test.com/file.csv"
                }
            }
        });

        testEnv.chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);

        testEnv.createEmbeddingTextStub
            .withArgs({
                record,
                format: "csv",
                filePath: null,
                url: "http://test.com/file.csv",
                readonlyRegistry: testEnv.registry
            })
            .resolves({ text: "embedding text: test1" });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );
        await onRecordFound(record, testEnv.registry);

        const expectedDocs1 = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                parentRecordId: testEnv.DEFAULT_PARENT_RECORD_ID,
                fileFormat: "csv",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0,
                indexerId: userConfig.id,
                createTime: testEnv.getCurrentTimeString(),
                updateTime: testEnv.getCurrentTimeString()
            }
        ];

        testEnv.expectSuccessCalls({
            createEmbeddingTextCallCount: 1,
            chunkCallCount: 1,
            embeddingApiCallCount: 1,
            bulkIndexCallCount: 1,
            deleteByQueryCallCount: 1
        });

        testEnv.expectIndexedDocs(expectedDocs1);
    });

    it("should skip this record when embeddingApiClient throws an error", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "csv" },
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: "http://test.com/file.csv"
                }
            }
        });

        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .rejects(new Error("throw test error"));

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );

        await expectNoThrowsAsync(() =>
            onRecordFound(record, testEnv.registry)
        );
    });

    it("should skip this record when opensearchApiClient throws an error", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "csv" },
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: "http://test.com/file.csv"
                }
            }
        });

        testEnv.opensearchApiClient.bulkIndexDocument
            .withArgs(record, null as any)
            .rejects(new Error("throw test error"));

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );
        await expectNoThrowsAsync(() =>
            onRecordFound(record, testEnv.registry)
        );
    });

    it("should skip this record when createEmbeddingText throws an error", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"],
            createEmbeddingText: sinon
                .stub()
                .rejects(new Error("throw test error"))
        });

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "csv" },
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: "http://test.com/file.csv"
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );
        await expectNoThrowsAsync(() =>
            onRecordFound(record, testEnv.registry)
        );
    });

    it("should skip this record when dataset-distributions aspect not exist", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        const record = createRecord({
            id: "id1",
            aspects: {}
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );
        await expectNoThrowsAsync(() =>
            onRecordFound(record, testEnv.registry)
        );
    });

    it("should skip this record when dcat-distribution-strings is missing downloadURL", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"]
        });

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "csv" },
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: "http://test.com/test.csv"
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );
        await expectNoThrowsAsync(() =>
            onRecordFound(record, testEnv.registry)
        );
    });

    it("should use format from dcat-distribution-strings when dataset-format is missing", async () => {
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"],
            autoDownloadFile: false
        });

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": {},
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: "http://test.com/test.csv"
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );

        await expectNoThrowsAsync(() =>
            onRecordFound(record, testEnv.registry)
        );
        expect(testEnv.createEmbeddingTextStub.firstCall.args[0]).to.deep.equal(
            {
                record,
                format: "csv",
                filePath: null,
                url: "http://test.com/test.csv",
                readonlyRegistry: testEnv.registry
            }
        );
    });

    it("should call deleteByQuery after indexing", async () => {
        testEnv.createEmbeddingTextStub.resolves({
            text: "embedding text: test1"
        });
        const userConfig = testEnv.updateUserConfig({
            itemType: "storageObject",
            formatTypes: ["csv"],
            autoDownloadFile: false
        });

        testEnv.chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        testEnv.embeddingApiClient.get
            .withArgs(["test1"])
            .resolves([[0.1, 0.2, 0.3]]);

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-format": { format: "csv" },
                "dcat-distribution-strings": {
                    format: "csv",
                    downloadURL: "http://test.com/file.csv"
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            testEnv.chunker,
            testEnv.embeddingApiClient,
            testEnv.opensearchApiClient,
            testEnv.minioClient,
            testEnv.registry
        );
        await onRecordFound(record, testEnv.registry);

        testEnv.expectSuccessCalls({
            deleteByQueryCallCount: 1
        });

        testEnv.expectCalledWith(testEnv.opensearchApiClient.deleteByQuery, 0, {
            index: userConfig.argv.semanticIndexerConfig.fullIndexName,
            body: {
                query: {
                    bool: {
                        filter: [
                            { term: { indexerId: userConfig.id } },
                            { term: { recordId: "id1" } },
                            {
                                range: {
                                    createTime: {
                                        lt: testEnv.getCurrentTimeString()
                                    }
                                }
                            }
                        ]
                    }
                }
            },
            wait_for_completion: true,
            conflicts: "proceed",
            timeout: userConfig.timeout
        });
    });
});
