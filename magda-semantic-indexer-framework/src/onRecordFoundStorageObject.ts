import { onRecordFoundType } from "magda-minion-framework/src/MinionOptions.js";
import { Chunker } from "./chunker.js";
import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import SemanticIndexerOptions from "./semanticIndexerOptions.js";
import { indexEmbeddingText } from "./indexEmbeddingText.js";
import { EmbeddingText } from "./createEmbeddingText.js";
import { Record } from "magda-typescript-common/src/generated/registry/api.js";
import retry from "magda-typescript-common/src/retry.js";
import fetch from "node-fetch";
import * as fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { SkipError } from "./SkipError.js";
import * as Minio from "minio";
import urijs from "urijs";
import { MinioConfig } from "./configType.js";
import { pipeline } from "stream/promises";

export const onRecordFoundStorageObject = (
    userConfig: SemanticIndexerOptions,
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient
): onRecordFoundType => {
    return async (record: Record, _registry) => {
        try {
            const distributions =
                record.aspects["dataset-distributions"]?.distributions || [];
            const tasks = distributions.map(async (dist: any) => {
                try {
                    let format: string | null = null;
                    const datasetFormat =
                        dist.aspects?.["dataset-format"]?.format;
                    const dcatDist =
                        dist.aspects?.["dcat-distribution-strings"];
                    const {
                        format: dcatFormat,
                        downloadURL,
                        mediaType,
                        accessURL
                    } = dcatDist || {};
                    const fileDownloadURL = downloadURL
                        ? downloadURL
                        : accessURL;
                    format = datasetFormat || dcatFormat || mediaType;

                    if (
                        !format ||
                        !fileDownloadURL ||
                        !userConfig.formatTypes?.some((f) =>
                            format.toLowerCase().includes(f.toLowerCase())
                        )
                    ) {
                        return;
                    }

                    let embeddingText: EmbeddingText;
                    let filePath: string | null = null;
                    if (userConfig.autoDownloadFile) {
                        try {
                            filePath = await downloadFileWithRetry(
                                fileDownloadURL,
                                userConfig.argv.minioConfig
                            );
                            embeddingText = await userConfig.createEmbeddingText(
                                {
                                    record,
                                    format: format,
                                    filePath: filePath,
                                    url: fileDownloadURL
                                }
                            );
                        } catch (err) {
                            throw new SkipError(
                                `Failed to create embedding text, error: ${
                                    (err as Error).message
                                }`
                            );
                        } finally {
                            if (filePath) {
                                await deleteTempFile(filePath);
                            }
                        }
                    } else {
                        embeddingText = await userConfig.createEmbeddingText({
                            record,
                            format: format,
                            filePath: null,
                            url: fileDownloadURL
                        });
                    }

                    try {
                        await indexEmbeddingText(
                            userConfig,
                            embeddingText,
                            chunker,
                            embeddingApiClient,
                            opensearchApiClient,
                            record.id,
                            format
                        );
                    } catch (err) {
                        throw new SkipError(
                            `Failed to index embedding text, error: ${
                                (err as Error).message
                            }`
                        );
                    }
                } catch (err) {
                    if (err instanceof SkipError) {
                        console.warn("Skipping record because:", err.message);
                        return;
                    }
                    throw err;
                }
            });
            await Promise.all(tasks);
        } catch (err) {
            if (err instanceof SkipError) {
                console.warn("Skipping record because:", err.message);
                return;
            }
            throw err;
        }
    };
};

async function downloadFileWithRetry(
    url: string,
    minioConfig: MinioConfig
): Promise<string> {
    return retry(
        () => downloadFile(url, minioConfig),
        1,
        5,
        (err, retries) => {
            console.warn(
                `Failed to download file, error: ${err.message}, retries: ${retries}`
            );
        }
    );
}

async function downloadFile(
    url: string,
    minioConfig: MinioConfig
): Promise<string> {
    const uri = urijs(url);
    if (uri.protocol() === "magda" && uri.hostname() === "storage-api") {
        return downloadFileFromMinio(url, minioConfig);
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new SkipError(`${response.status} ${response.statusText}`);
    }

    if (!response.body) {
        throw new SkipError("No response body to write to file");
    }

    const tempDir = tmpdir();
    const tempFileName = `${uuidv4()}`;
    const tempFilePath = join(tempDir, tempFileName);

    try {
        const writeStream = fs.createWriteStream(tempFilePath);
        await pipeline(response.body, writeStream);
        return tempFilePath;
    } catch (err) {
        await deleteTempFile(tempFilePath);
        throw new SkipError(`Failed to write file`);
    }
}

let minioClientInstance: Minio.Client | null = null;

function getMinioClient(config: MinioConfig): Minio.Client {
    if (!minioClientInstance) {
        minioClientInstance = new Minio.Client({
            endPoint: config.endPoint,
            port: config.port,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
            useSSL: config.useSSL,
            region: config.region
        });
    }
    return minioClientInstance;
}

async function downloadFileFromMinio(
    url: string,
    minioConfig: MinioConfig
): Promise<string> {
    const uri = urijs(url);
    const [datasetId, distributionId, fileName] = uri.segmentCoded();

    const minioClient = getMinioClient(minioConfig);
    const objectName = `${datasetId}/${distributionId}/${fileName}`;

    const tempDir = tmpdir();
    const tempFileName = `${uuidv4()}`;
    const tempFilePath = join(tempDir, tempFileName);

    try {
        await minioClient.fGetObject(
            minioConfig.defaultDatasetBucket,
            objectName,
            tempFilePath
        );
        return tempFilePath;
    } catch (err) {
        await deleteTempFile(tempFilePath);
        throw err;
    }
}

async function deleteTempFile(filePath: string) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error("Error deleting file:", err);
            }
        });
    }
}
