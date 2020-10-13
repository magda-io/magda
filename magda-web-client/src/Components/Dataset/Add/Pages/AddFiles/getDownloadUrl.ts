import URI from "urijs";

export default function getDownloadUrl(
    datasetId: string,
    distId: string,
    fileName: string
) {
    return URI("magda://storage-api")
        .segmentCoded([datasetId, distId, fileName])
        .toString();
}
