import sinon, { SinonStub, SinonFakeTimers } from "sinon";
import { expect } from "chai";
import SemanticIndexerOptions from "../semanticIndexerOptions.js";
import { ItemType } from "../indexSchema.js";
import { CreateEmbeddingText } from "../createEmbeddingText.js";
import { SemanticIndexerArguments } from "../commonYargs.js";

export class BaseSemanticIndexerTest {
    public chunker: any;
    public embeddingApiClient: any;
    public opensearchApiClient: any;
    public minioClient: any;
    public registry: any;
    public createEmbeddingTextStub: SinonStub;

    public consoleLogStub: SinonStub;
    public consoleWarnStub: SinonStub;
    public consoleErrorStub: SinonStub;

    public clock: SinonFakeTimers;
    public DEFAULT_FAKE_TIME = new Date("2023-01-01T00:00:00.000Z");
    public DEFAULT_PARENT_RECORD_ID = "fake-parent-record-id";
    public DEFAULT_CREATE_EMBEDDING_TEXT_RESULT = { text: "embedding text" }; // result of user-provided createEmbeddingText function
    public userConfig: any;

    constructor({
        createEmbeddingTextResult,
        fakeTime,
        overridesConfig,
        suppressConsoleLogs
    }: {
        createEmbeddingTextResult?: any;
        fakeTime?: Date;
        overridesConfig?: Partial<SemanticIndexerOptions>;
        suppressConsoleLogs?: boolean;
    } = {}) {
        this.chunker = { chunk: sinon.stub() };
        this.embeddingApiClient = { get: sinon.stub() };
        this.opensearchApiClient = {
            bulkIndexDocument: sinon.stub().resolves(),
            deleteByQuery: sinon.stub().resolves({
                body: { version_conflicts: 0, timed_out: false }
            })
        };
        this.minioClient = { downloadFile: sinon.stub().resolves() };
        this.registry = {
            getRecords: sinon.stub().resolves({
                records: [{ id: this.DEFAULT_PARENT_RECORD_ID }]
            })
        };

        this.clock = sinon.useFakeTimers(
            fakeTime?.getTime() || this.DEFAULT_FAKE_TIME.getTime()
        );

        this.createEmbeddingTextStub = sinon
            .stub()
            .resolves(
                createEmbeddingTextResult ||
                    this.DEFAULT_CREATE_EMBEDDING_TEXT_RESULT
            );

        if (suppressConsoleLogs === undefined || suppressConsoleLogs) {
            this.consoleLogStub = sinon.stub(console, "log");
            this.consoleWarnStub = sinon.stub(console, "warn");
            this.consoleErrorStub = sinon.stub(console, "error");
        }

        this.userConfig = createFakeSemanticIndexerConfig({
            createEmbeddingText: this.createEmbeddingTextStub,
            ...overridesConfig
        });
    }

    cleanup() {
        this.clock?.restore();
        this.consoleLogStub?.restore();
        this.consoleWarnStub?.restore();
        this.consoleErrorStub?.restore();
    }

    updateUserConfig(overrides: Partial<SemanticIndexerOptions> = {}) {
        this.userConfig = createFakeSemanticIndexerConfig({
            createEmbeddingText: this.createEmbeddingTextStub,
            ...overrides
        });
        return this.userConfig;
    }

    getCurrentTimeString(): string {
        return this.DEFAULT_FAKE_TIME.toISOString();
    }

    expectCalledWith(
        stub: SinonStub,
        callIndex: number,
        ...expectedArgs: any[]
    ): void {
        expect(stub.getCall(callIndex).calledWith(...expectedArgs)).to.be.true;
    }

    expectSuccessCalls(
        options: {
            createEmbeddingTextCallCount?: number;
            chunkCallCount?: number;
            embeddingApiCallCount?: number;
            bulkIndexCallCount?: number;
            deleteByQueryCallCount?: number;
        } = {}
    ) {
        if (options.createEmbeddingTextCallCount) {
            expect(this.createEmbeddingTextStub.callCount).to.equal(
                options.createEmbeddingTextCallCount
            );
        }
        if (options.chunkCallCount) {
            expect(this.chunker.chunk.callCount).to.equal(
                options.chunkCallCount
            );
        }
        if (options.embeddingApiCallCount) {
            expect(this.embeddingApiClient.get.callCount).to.equal(
                options.embeddingApiCallCount
            );
        }
        if (options.bulkIndexCallCount) {
            expect(
                this.opensearchApiClient.bulkIndexDocument.callCount
            ).to.equal(options.bulkIndexCallCount);
        }
        if (options.deleteByQueryCallCount) {
            expect(this.opensearchApiClient.deleteByQuery.callCount).to.equal(
                options.deleteByQueryCallCount
            );
        }
    }

    expectIndexedDoc(expectedDoc: any, callIndex: number = 0) {
        const actualDocs = this.opensearchApiClient.bulkIndexDocument.getCall(
            callIndex
        ).args[1];
        expect(actualDocs).to.deep.equal([expectedDoc]);
    }

    expectIndexedDocs(expectedDocs: any[], callIndex: number = 0) {
        const actualDocs = this.opensearchApiClient.bulkIndexDocument.getCall(
            callIndex
        ).args[1];
        expect(actualDocs).to.deep.equal(expectedDocs);
    }

    getIndexedDocs(callIndex: number = 0): any[] {
        return this.opensearchApiClient.bulkIndexDocument.getCall(callIndex)
            .args[1];
    }
}

export function createFakeSemanticIndexerConfig(
    overrideConfig: Partial<SemanticIndexerOptions> = {}
): SemanticIndexerOptions {
    const originalEnv = process.env;
    process.env = {
        ...originalEnv,
        JWT_SECRET: "test-secret",
        USER_ID: "test-user"
    };

    const commonArgs: SemanticIndexerArguments = {
        listenPort: 6100,
        internalUrl: "http://localhost:6100",
        jwtSecret: "test-secret",
        userId: "test-user",
        registryUrl: "http://localhost:6101",
        minioConfig: {
            endPoint: "localhost",
            port: 9000,
            useSSL: false,
            region: "us-east-1",
            defaultDatasetBucket: "test-bucket"
        },
        minioAccessKey: "minioadmin",
        minioSecretKey: "minioadmin",
        enableMultiTenant: false,
        tenantUrl: "http://localhost:6101",
        retries: 3,
        semanticIndexerConfig: {
            numberOfShards: 1,
            numberOfReplicas: 0,
            indexName: "semantic-index",
            indexVersion: 1,
            chunkSizeLimit: 512,
            overlap: 64,
            bulkEmbeddingsSize: 1,
            bulkIndexSize: 50,
            fullIndexName: "semantic-index-v1",
            knnVectorFieldConfig: {
                mode: "in_memory",
                dimension: 768,
                spaceType: "l2",
                efConstruction: 100,
                efSearch: 100,
                m: 16,
                encoder: {
                    name: "sq",
                    type: "fp16",
                    clip: false
                }
            }
        },
        opensearchApiURL: "http://localhost:9200",
        embeddingApiURL: "http://localhost:3000",
        registryReadonlyURL: "http://localhost:6101"
    };

    const defaultConfig: SemanticIndexerOptions = {
        argv: commonArgs,
        id: "test-minion",
        itemType: (overrideConfig.itemType ?? "registryRecord") as ItemType,
        aspects: ["test-aspect"],
        optionalAspects: [],
        formatTypes: ["txt"],
        createEmbeddingText: (overrideConfig.createEmbeddingText ??
            ((input: any) =>
                Promise.resolve({
                    text: "This is a test text"
                }))) as CreateEmbeddingText,
        chunkSizeLimit: 100,
        overlap: 0,
        autoDownloadFile: false,
        timeout: "3m"
    };
    return { ...defaultConfig, ...overrideConfig };
}
