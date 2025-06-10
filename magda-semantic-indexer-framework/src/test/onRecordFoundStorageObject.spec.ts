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

describe("onRecordFoundStorageObject", () => {
    let userConfig: any;
    let chunker: any;
    let embeddingApiClient: any;
    let opensearchApiClient: any;
    let createEmbeddingTextStub: SinonStub;
    let consoleLogStub: SinonStub;
    let consoleWarnStub: SinonStub;
    let consoleErrorStub: SinonStub;

    beforeEach(() => {
        chunker = { chunk: sinon.stub() };
        embeddingApiClient = { get: sinon.stub() };
        opensearchApiClient = { bulkIndexDocument: sinon.stub().resolves() };
        createEmbeddingTextStub = sinon.stub();
        consoleLogStub = stub(console, "log");
        consoleWarnStub = stub(console, "warn");
        consoleErrorStub = stub(console, "error");
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
                "dataset-distributions": {
                    distributions: [
                        {
                            aspects: {
                                "dataset-format": { format: "csv" },
                                "dcat-distribution-strings": {
                                    format: "csv",
                                    downloadURL: "http://test.com/file.csv"
                                }
                            }
                        }
                    ]
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );
        await onRecordFound(record, null as any);

        const expectedDocs = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
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
                "dataset-distributions": {
                    distributions: [
                        {
                            aspects: {
                                "dataset-format": { format: "csv" },
                                "dcat-distribution-strings": {
                                    format: "csv",
                                    downloadURL: "http://test.com/file.csv"
                                }
                            }
                        }
                    ]
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
            opensearchApiClient
        );
        await onRecordFound(record, null as any);

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
                "dataset-distributions": {
                    distributions: [
                        {
                            aspects: {
                                "dataset-format": { format: "json" },
                                "dcat-distribution-strings": {
                                    format: "json",
                                    downloadURL: "http://test.com/file.json"
                                }
                            }
                        },
                        {
                            aspects: {
                                "dataset-format": { format: "csv" },
                                "dcat-distribution-strings": {
                                    format: "csv",
                                    downloadURL: "http://test.com/file.csv"
                                }
                            }
                        }
                    ]
                }
            }
        });

        const expectedDocs = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
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
            opensearchApiClient
        );

        await onRecordFound(record, null as any);

        expect(createEmbeddingTextStub.callCount).to.equal(1);
        expect(chunker.chunk.callCount).to.equal(1);
        expect(embeddingApiClient.get.callCount).to.equal(1);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(1);
        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1]
        ).to.deep.equal(expectedDocs);
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
                "dataset-distributions": {
                    distributions: [
                        {
                            aspects: {
                                "dataset-format": { format: "csv" },
                                "dcat-distribution-strings": {
                                    format: "csv",
                                    downloadURL: "http://test.com/file.csv"
                                }
                            }
                        },
                        {
                            aspects: {
                                "dataset-format": { format: "json" },
                                "dcat-distribution-strings": {
                                    format: "json",
                                    downloadURL: "http://test.com/file.json"
                                }
                            }
                        }
                    ]
                }
            }
        });

        chunker.chunk
            .withArgs("embedding text: test1")
            .returns([{ text: "test1", length: 5, position: 0, overlap: 0 }]);
        chunker.chunk
            .withArgs("embedding text: test2")
            .returns([{ text: "test2", length: 5, position: 0, overlap: 0 }]);
        embeddingApiClient.get.withArgs(["test1"]).resolves([[0.1, 0.2, 0.3]]);
        embeddingApiClient.get.withArgs(["test2"]).resolves([[0.4, 0.5, 0.6]]);

        createEmbeddingTextStub
            .withArgs({
                record,
                format: "csv",
                filePath: null,
                url: "http://test.com/file.csv"
            })
            .resolves({ text: "embedding text: test1" });

        createEmbeddingTextStub
            .withArgs({
                record,
                format: "json",
                filePath: null,
                url: "http://test.com/file.json"
            })
            .resolves({ text: "embedding text: test2" });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );
        await onRecordFound(record, null as any);

        const expectedDocs1 = [
            {
                itemType: userConfig.itemType,
                recordId: "id1",
                fileFormat: "csv",
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
                recordId: "id1",
                fileFormat: "json",
                index_text_chunk: "test2",
                embedding: [0.4, 0.5, 0.6],
                only_one_index_text_chunk: true,
                index_text_chunk_length: 5,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0
            }
        ];

        expect(createEmbeddingTextStub.callCount).to.equal(2);
        expect(chunker.chunk.callCount).to.equal(2);
        expect(embeddingApiClient.get.callCount).to.equal(2);
        expect(opensearchApiClient.bulkIndexDocument.callCount).to.equal(2);
        expect(
            opensearchApiClient.bulkIndexDocument.firstCall.args[1]
        ).to.deep.equal(expectedDocs1);
        expect(
            opensearchApiClient.bulkIndexDocument.secondCall.args[1]
        ).to.deep.equal(expectedDocs2);
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
                "dataset-distributions": {
                    distributions: [
                        {
                            aspects: {
                                "dataset-format": { format: "csv" },
                                "dcat-distribution-strings": {
                                    format: "csv",
                                    downloadURL: "http://test.com/file.csv"
                                }
                            }
                        }
                    ]
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
            opensearchApiClient
        );

        await expectNoThrowsAsync(() => onRecordFound(record, null as any));
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
                "dataset-distributions": {
                    distributions: [
                        {
                            aspects: {
                                "dataset-format": { format: "csv" },
                                "dcat-distribution-strings": {
                                    format: "csv",
                                    downloadURL: "http://test.com/file.csv"
                                }
                            }
                        }
                    ]
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
            opensearchApiClient
        );
        await expectNoThrowsAsync(() => onRecordFound(record, null as any));
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
                "dataset-distributions": {
                    distributions: [
                        {
                            aspects: {
                                "dataset-format": { format: "csv" },
                                "dcat-distribution-strings": {
                                    format: "csv",
                                    downloadURL: "http://test.com/file.csv"
                                }
                            }
                        }
                    ]
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
            opensearchApiClient
        );
        await expectNoThrowsAsync(() => onRecordFound(record, null as any));
    });

    it("should skip this record when no distributions", async () => {
        userConfig = createFakeSemanticIndexerConfig({
            itemType: "storageObject",
            createEmbeddingText: createEmbeddingTextStub,
            formatTypes: ["csv"]
        });

        const record = createRecord({
            id: "id1",
            aspects: {
                "dataset-distributions": {
                    distributions: []
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );
        await expectNoThrowsAsync(() => onRecordFound(record, null as any));
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
            opensearchApiClient
        );
        await expectNoThrowsAsync(() => onRecordFound(record, null as any));
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
                "dataset-distributions": {
                    distributions: [
                        {
                            aspects: {
                                "dcat-distribution-strings": {
                                    format: "csv"
                                }
                            }
                        }
                    ]
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );
        await expectNoThrowsAsync(() => onRecordFound(record, null as any));
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
                "dataset-distributions": {
                    distributions: [
                        {
                            aspects: {
                                "dataset-format": {},
                                "dcat-distribution-strings": {
                                    format: "csv",
                                    downloadURL: "http://test.com/test.csv"
                                }
                            }
                        }
                    ]
                }
            }
        });

        const onRecordFound = onRecordFoundStorageObject(
            userConfig,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );

        await expectNoThrowsAsync(() => onRecordFound(record, null as any));
        expect(createEmbeddingTextStub.firstCall.args[0]).to.deep.equal({
            record,
            format: "csv",
            filePath: null,
            url: "http://test.com/test.csv"
        });
    });
});
