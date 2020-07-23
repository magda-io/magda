import { config } from "config";
import baseStorageApiPath from "./baseStorageApiPath";

export default function getDownloadUrl(
    datasetId: string,
    distId: string,
    fileName: string
) {
    return `${config.storageApiUrl}${baseStorageApiPath(
        datasetId,
        distId
    )}/${encodeURIComponent(fileName)}`;
}
