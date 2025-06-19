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
import Registry from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import ServerError from "magda-typescript-common/src/ServerError.js";

// The onRecordFound function passed to minion sdk to handle storage object records
export const onRecordFoundStorageObject = (
    options: SemanticIndexerOptions,
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient
): onRecordFoundType => {
    return async (dist: Record, registry) => {
        try {
            const datasetFormat = dist.aspects?.["dataset-format"]?.format;
            const dcatDist = dist.aspects?.["dcat-distribution-strings"] || {};
            const { format: dcatFormat, downloadURL, accessURL } = dcatDist;
            const fileDownloadURL = downloadURL || accessURL;
            let format = datasetFormat || dcatFormat;
            if (!format && fileDownloadURL) {
                format = new urijs(fileDownloadURL).suffix().toUpperCase();
            }

            // filler record
            if (
                !format ||
                !fileDownloadURL ||
                !options.formatTypes?.some((f) =>
                    format.toLowerCase().includes(f.toLowerCase())
                )
            ) {
                return;
            }

            let embeddingText: EmbeddingText;
            let filePath: string | null = null;

            const parentRecordId = await getParentRecordId(dist.id, registry);
            try {
                if (
                    options.autoDownloadFile === undefined ||
                    options.autoDownloadFile
                ) {
                    filePath = await downloadFileWithRetry(
                        fileDownloadURL,
                        options.argv.minioConfig
                    );
                }

                try {
                    embeddingText = await options.createEmbeddingText({
                        record: dist,
                        format: format,
                        filePath,
                        url: fileDownloadURL
                    });

                    if (!embeddingText.text && !embeddingText.subObjects) {
                        throw new SkipError(
                            "User-provided createEmbeddingText function returned no text or subObjects"
                        );
                    }
                } catch (err) {
                    throw new SkipError(
                        `Error in user-provided createEmbeddingText function: ${
                            (err as Error).message
                        }`
                    );
                }
            } finally {
                if (filePath) {
                    await deleteTempFile(filePath);
                }
            }

            await indexEmbeddingText({
                options,
                chunker,
                embeddingApiClient,
                opensearchApiClient,
                embeddingText,
                metadata: {
                    recordId: dist.id,
                    parentRecordId: parentRecordId,
                    aspectId: dist.aspects["dataset-format"]?.id,
                    fileFormat: format
                }
            });
        } catch (err) {
            if (err instanceof SkipError) {
                console.warn("Skipping distribution because:", err.message);
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
        (err, retries) => {}
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

    let response;
    try {
        response = await fetch(url);
    } catch (err) {
        throw new SkipError(`Failed to download file because network error`);
    }

    if (!response.ok) {
        throw new SkipError(
            `Failed to download file because HTTP error ${response.status}`
        );
    }

    if (!response.body) {
        throw new SkipError("No response body to write to file");
    }

    const tempDir = tmpdir();
    const tempFileName = `${uuidv4()}`;
    const suffix = new urijs(url).suffix();
    const tempFilePath = join(tempDir, `${tempFileName}.${suffix}`);

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
        throw new SkipError(
            `Failed to download file from Minio: ${(err as Error).message}`
        );
    }
}

async function deleteTempFile(filePath: string) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error("Error deleting file");
            }
        });
    }
}

export async function getParentRecordId(
    distributionId: string,
    registry: Registry
): Promise<string | null> {
    try {
        const result = await registry.getRecords<Record>(
            ["dataset-distributions"],
            undefined,
            undefined,
            true,
            undefined,
            ["dataset-distributions.distributions:<|" + distributionId]
        );

        if (result instanceof ServerError) {
            console.error(`Failed to get parent record id: ${result.message}`);
            return null;
        }
        if (!("records" in result)) {
            console.error(`Failed to get parent record id`);
            return null;
        }

        return result.records[0]?.id || null;
    } catch (e) {
        console.error(`Unexpected error when getting parent record id`, e);
        return null;
    }
}
