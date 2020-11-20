import { config, DATASETS_BUCKET } from "config";
import urijs from "urijs";

export default function getStorageApiResourceAccessUrl(resourceUrl: string) {
    if (!resourceUrl) {
        return resourceUrl;
    }
    const uri = urijs(resourceUrl);
    if (uri.protocol() === "magda" && uri.hostname() === "storage-api") {
        // --- convert [pseudo storage api resource URL](https://github.com/magda-io/magda/issues/3000) to http access url
        const [datasetId, distributionId, fileName] = uri.segmentCoded();
        const accessUri = urijs(config.storageApiUrl);
        const segments = [
            ...accessUri.segmentCoded(),
            DATASETS_BUCKET,
            datasetId,
            distributionId,
            fileName
        ];
        return accessUri.segmentCoded(segments).toString();
    } else {
        // --- return legacy url directly
        // --- legacy url is a HTTP access url generated when create the resource
        // --- can be used to access storage api directly
        return resourceUrl;
    }
}
