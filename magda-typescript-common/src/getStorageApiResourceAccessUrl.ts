import urijs from "urijs";

/**
 * Get the access url of a storage api resource from [pseudo storage api resource URL](https://github.com/magda-io/magda/issues/3000)
 * If the input url is not a pseudo storage api resource URL, return the input url directly
 *
 * @export
 * @param {string} resourceUrl pseudo storage api resource URL or ordinary HTTP access url
 * @param {string} storageApiBaseUrl storage api base url
 * @param {string} datasetsBucket datasets storage bucket name
 * @return {*}
 */
export default function getStorageApiResourceAccessUrl(
    resourceUrl: string,
    storageApiBaseUrl: string,
    datasetsBucket: string
) {
    if (!resourceUrl) {
        return resourceUrl;
    }
    const uri = urijs(resourceUrl);
    if (uri.protocol() === "magda" && uri.hostname() === "storage-api") {
        // --- convert [pseudo storage api resource URL](https://github.com/magda-io/magda/issues/3000) to http access url
        const [datasetId, distributionId, fileName] = uri.segmentCoded();
        const accessUri = urijs(storageApiBaseUrl);
        const segments = [
            ...accessUri.segmentCoded(),
            datasetsBucket,
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
