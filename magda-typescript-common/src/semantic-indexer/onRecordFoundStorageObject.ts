import { onRecordFoundType } from "@magda/minion-sdk";
import { Chunker } from "./chunker.js";
import EmbeddingApiClient from "../EmbeddingApiClient.js";
import OpensearchApiClient from "../OpensearchApiClient.js";
import SemanticIndexerOptions from "./semanticIndexerOptions.js";
import { indexEmbeddingText } from "./indexEmbeddingText.js";
import { EmbeddingText } from "./createEmbeddingText.js";
import { Record } from "../generated/registry/api.js";
import fetch from "node-fetch";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { SkipError } from "./skipError.js";
import retry from "../retry.js";

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
                    const { format: dcatFormat, downloadURL, mediaType } =
                        dcatDist || {};
                    if (datasetFormat) {
                        format = datasetFormat;
                    } else if (dcatFormat) {
                        format = dcatFormat;
                    } else {
                        format = mediaType;
                    }

                    if (
                        !format ||
                        !downloadURL ||
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
                            try {
                                filePath = await downloadFileWithRetry(
                                    downloadURL
                                );
                            } catch (err) {
                                throw new SkipError(
                                    `Failed to download file, error: ${
                                        (err as Error).message
                                    }`
                                );
                            }
                            embeddingText = await userConfig.createEmbeddingText(
                                {
                                    record,
                                    format: format,
                                    filePath: filePath,
                                    url: downloadURL
                                }
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
                            url: downloadURL
                        });
                    }
                    try {
                        await indexEmbeddingText(
                            userConfig,
                            embeddingText,
                            {
                                recordId: record.id,
                                fileFormat: format
                            },
                            chunker,
                            embeddingApiClient,
                            opensearchApiClient
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

async function downloadFileWithRetry(url: string): Promise<string> {
    return retry(
        () => downloadFile(url),
        1,
        5,
        (err, retries) => {
            console.warn(
                `Failed to download file, error: ${err.message}, retries: ${retries}`
            );
        }
    );
}

async function downloadFile(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new SkipError(`${response.status} ${response.statusText}`);
    }

    const tempDir = tmpdir();
    const tempFileName = `${uuidv4()}`;
    const tempFilePath = join(tempDir, tempFileName);

    const fileStream = await fs.open(tempFilePath, "w");
    await fileStream.write(Buffer.from(await response.arrayBuffer()));
    await fileStream.close();

    return tempFilePath;
}

async function deleteTempFile(filePath: string) {
    try {
        await fs.unlink(filePath);
    } catch (err) {
        console.warn(`Failed to delete temp file: ${filePath}`, err);
    }
}
