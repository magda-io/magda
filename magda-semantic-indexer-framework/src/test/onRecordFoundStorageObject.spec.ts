import { expect } from "chai";
import sinon, { SinonStub, stub } from "sinon";
import { onRecordFoundStorageObject } from "../onRecordFoundStorageObject.js";
import {
    createFakeSemanticIndexerConfig,
    createRecord,
    expectNoThrowsAsync
} from "./helpers.js";
import fs from "fs";
import nock from "nock";
import { tmpdir } from "os";
import { join } from "path";

describe("onRecordFoundStorageObject", () => {
    let userConfig: any;
    let chunker: any;
    let embeddingApiClient: any;
    let opensearchApiClient: any;
    let minioClient: any;
    let createEmbeddingTextStub: SinonStub;
    let consoleLogStub: SinonStub;
    let consoleWarnStub: SinonStub;
    let consoleErrorStub: SinonStub;
    let registry: any;

    beforeEach(() => {
        chunker = { chunk: sinon.stub() };
        embeddingApiClient = { get: sinon.stub() };
        opensearchApiClient = { bulkIndexDocument: sinon.stub().resolves() };
        minioClient = { downloadFile: sinon.stub().resolves() };
        createEmbeddingTextStub = sinon
            .stub()
            .returns({ text: "embedding text" });
        consoleLogStub = stub(console, "log");
        consoleWarnStub = stub(console, "warn");
        consoleErrorStub = stub(console, "error");
        registry = {
            getRecords: sinon.stub().resolves({
                records: [{ id: "fake-parent-record-id" }]
            })
        };
    });

    afterEach(() => {
        consoleLogStub.restore();
        consoleWarnStub.restore();
        consoleErrorStub.restore();
    });

    it("should handle and index storage object with expected formatType, with autoDownloadFile disabled", async () => {
        createEmbeddingTextStub.resolves({ text: "embedding text: test1" });
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
            formatTypes: ["csv"],
            autoDownloadFile: false
        });

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);

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
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );
        await onRecordFound(record, registry);

        const expectedDocs = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                parentRecordId: "fake-parent-record-id",
                fileFormat: "csv",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0
            }
        ];

        expect(createEmbeddingTextStub.callCount).to.equal(1);
        expect(
            createEmbeddingTextStub.firstCall.calledWith({
                record,
                format: "csv",
                filePath: null,
                url: "http://test.com/file.csv"
            })
        ).to.be.true;
        expect(chunker.chunk.callCount).to.equal(1);
        expect(embeddingApiClient.get.callCount).to.equal(1);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(1);
        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1]
        ).to.deep.equal(expectedDocs);
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
        createEmbeddingTextStub.callsFake(
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

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);

        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
            formatTypes: ["csv"],
            autoDownloadFile: true
        });

        const expectedDocs = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                parentRecordId: "fake-parent-record-id",
                fileFormat: "csv",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0
            }
        ];

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );
        await onRecordFound(record, registry);
        expect(createEmbeddingTextStub.callCount).to.equal(1);
        expect(chunker.chunk.callCount).to.equal(1);
        expect(embeddingApiClient.get.callCount).to.equal(1);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(1);
        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1]
        ).to.deep.equal(expectedDocs);
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
        minioClient.downloadFile.withArgs(downloadUrl).callsFake(async () => {
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
        createEmbeddingTextStub.callsFake(
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

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);

        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
            formatTypes: ["csv"],
            autoDownloadFile: true
        });

        const expectedDocs = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                parentRecordId: "fake-parent-record-id",
                fileFormat: "csv",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0
            }
        ];

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );
        await onRecordFound(record, registry);

        expect(createEmbeddingTextStub.callCount).to.equal(1);
        expect(chunker.chunk.callCount).to.equal(1);
        expect(embeddingApiClient.get.callCount).to.equal(1);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(1);
        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1]
        ).to.deep.equal(expectedDocs);
        if (usedFilePath) {
            expect(fs.existsSync(usedFilePath)).to.be.false;
        }
        nock.cleanAll();
    });

    it("should filter out records with unexpected formatType", async () => {
        createEmbeddingTextStub.resolves({ text: "embedding text: test1" });
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
            formatTypes: ["csv"],
            autoDownloadFile: false
        });

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);

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
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );

        await onRecordFound(record, registry);

        expect(createEmbeddingTextStub.callCount).to.equal(0);
        expect(chunker.chunk.callCount).to.equal(0);
        expect(embeddingApiClient.get.callCount).to.equal(0);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(0);
    });

    it("should handle and index storage object with multiple expected format types", async () => {
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
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

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);

        createEmbeddingTextStub
            .withArgs({
                record,
                format: "csv",
                filePath: null,
                url: "http://test.com/file.csv"
            })
            .resolves({ text: "embedding text: test1" });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );
        await onRecordFound(record, registry);

        const expectedDocs1 = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                parentRecordId: "fake-parent-record-id",
                fileFormat: "csv",
                index_text_chunk: "test1",
                embedding: [0.1, 0.2, 0.3],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0
            }
        ];

        expect(createEmbeddingTextStub.callCount).to.equal(1);
        expect(chunker.chunk.callCount).to.equal(1);
        expect(embeddingApiClient.get.callCount).to.equal(1);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(1);
        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1]
        ).to.deep.equal(expectedDocs1);
    });

    it("should skip this record when embeddingApiClient throws an error", async () => {
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
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

        embeddingApiClient.get
            .withArgs(["test1"])
            .rejects(new Error("throw test error"));

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );

        await expectNoThrowsAsync(() => onRecordFound(record, registry));
    });

    it("should skip this record when opensearchApiClient throws an error", async () => {
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
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

        opensearchApiClient.bulkIndexDocument
            .withArgs(record, null as any)
            .rejects(new Error("throw test error"));

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );
        await expectNoThrowsAsync(() => onRecordFound(record, registry));
    });

    it("should skip this record when createEmbeddingText throws an error", async () => {
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
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

        createEmbeddingTextStub
            .withArgs({})
            .rejects(new Error("throw test error"));

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );
        await expectNoThrowsAsync(() => onRecordFound(record, registry));
    });

    it("should skip this record when dataset-distributions aspect not exist", async () => {
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
            formatTypes: ["csv"]
        });

        const record = createRecord({
            id: "id1",
            aspects: {}
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );
        await expectNoThrowsAsync(() => onRecordFound(record, registry));
    });

    it("should skip this record when dcat-distribution-strings is missing downloadURL", async () => {
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
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
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );
        await expectNoThrowsAsync(() => onRecordFound(record, registry));
    });

    it("should use format from dcat-distribution-strings when dataset-format is missing", async () => {
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
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
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            minioClient
        );

        await expectNoThrowsAsync(() => onRecordFound(record, registry));
        expect(createEmbeddingTextStub.firstCall.args[0]).to.deep.equal({
            record,
            format: "csv",
            filePath: null,
            url: "http://test.com/test.csv"
        });
    });
});
