import URI from "urijs";

export default function getDistInfoFromDownloadUrl(url: string) {
    if (!url) {
        throw new Error("url can't not be empty");
    }
    const uri = new URI(url);
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
