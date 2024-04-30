import { config, DATASETS_BUCKET } from "../config";
import { default as getStorageApiResourceAccessUrlOriginal } from "@magda/typescript-common/dist/getStorageApiResourceAccessUrl.js";

export default function getStorageApiResourceAccessUrl(resourceUrl: string) {
    return getStorageApiResourceAccessUrlOriginal(
        resourceUrl,
        config.storageApiBaseUrl,
        DATASETS_BUCKET
    );
}
