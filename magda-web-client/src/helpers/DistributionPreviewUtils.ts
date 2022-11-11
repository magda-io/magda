import { config } from "../config";
import getProxiedResourceUrl from "../helpers/getProxiedResourceUrl";
import isStorageApiUrl from "../helpers/isStorageApiUrl";
import { ParsedDistribution } from "./record";

/**
 * Gets the source url from a dataset, checking downloadURL and accessURL. If
 * passed a string, will simply return that string
 **/
export function getSourceUrl(source: ParsedDistribution | string): string {
    if (typeof source === "string") {
        return source;
    }
    if (source.downloadURL) {
        return source.downloadURL;
    }
    if (source.accessURL) {
        return source.accessURL;
    }

    throw new Error(
        `Failed to determine data source url for distribution id: ${source.identifier}`
    );
}
/**
 * Gets the length of the file at a URL by performing a HEAD request and looking
 * at the content-length and content-range headers that come back.
 *
 * @returns the length of the file in bytes, or null if it couldn't be retrieved.
 */
export async function getFileLength(file: ParsedDistribution | string) {
    const sourceUrl = getSourceUrl(file);
    const proxyUrl = getProxiedResourceUrl(sourceUrl, true);

    try {
        const res = await fetch(proxyUrl, {
            method: "HEAD",
            ...(isStorageApiUrl(sourceUrl)
                ? config.credentialsFetchOptions
                : {})
        });

        if (!res.ok) {
            throw new Error(
                `${res.status} Error: ${res.statusText} ${await res.text()}`
            );
        }

        const contentLength = res.headers.get("content-length");
        if (contentLength !== null) {
            return Number(contentLength);
        }

        const contentRange = res.headers.get("content-range");
        if (contentRange !== null) {
            const split = contentRange.split("/");
            const length = split[1];

            if (length !== "*" && !Number.isNaN(Number.parseInt(length))) {
                return Number.parseInt(length);
            }
        }

        return null;
    } catch (e) {
        console.log(`HEAD request to ${proxyUrl} failed:`, e);
        return null;
    }
}

/**
 * The result of checking a distribution to determine whether it shouold be
 * automatically previewed.
 */
export enum FileSizeCheckStatus {
    Oversize,
    Unknown,
    Ok
}

/**
 * {@see FileSizeCheckStatus}, and the size of the file if it was oversize.
 */
export type FileSizeCheckResult = {
    fileSizeCheckStatus: FileSizeCheckStatus;
    fileSize?: number;
};

/**
 * Checks a file's length, and returns whether it's OK to download as a preview
 * according to config, or whether the user should be prompted first
 *
 * @param file Either a URL of a file to check, or a ParsedDistribution.
 */
export async function checkFileForPreview(
    file: ParsedDistribution | string
): Promise<FileSizeCheckResult> {
    const size = await getFileLength(file);

    if (size === null) {
        return { fileSizeCheckStatus: FileSizeCheckStatus.Unknown };
    } else if (size > config.automaticPreviewMaxFileSize) {
        return {
            fileSizeCheckStatus: FileSizeCheckStatus.Oversize,
            fileSize: size
        };
    } else {
        return { fileSizeCheckStatus: FileSizeCheckStatus.Ok };
    }
}
