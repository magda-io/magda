import URI from "urijs";

export default function getDistInfoFromDownloadUrl(url: string) {
    if (!url) {
        throw new Error("url can't not be empty");
    }
    const uri = new URI(url);

    if (uri.protocol() === "magda" && uri.hostname() === "storage-api") {
        // [pseudo storage api resource URL](https://github.com/magda-io/magda/issues/3000)
        const [datasetId, distId, fileName] = uri.segmentCoded();
        return {
            datasetId,
            distId,
            fileName
        };
    } else {
        // legacy storage api resource URL
        const parts = uri.segmentCoded();
        if (parts.length < 3) {
            throw new Error(`Invalid file storage API: url: ${url}`);
        }
        const fileName = parts[parts.length - 1];
        const distId = parts[parts.length - 2];
        const datasetId = parts[parts.length - 3];

        return {
            datasetId,
            distId,
            fileName
        };
    }
}
