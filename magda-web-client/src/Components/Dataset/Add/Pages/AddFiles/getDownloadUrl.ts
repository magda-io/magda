import urijs from "urijs";

export default function getDownloadUrl(
    datasetId: string,
    distId: string,
    fileName: string
) {
    return urijs("magda://storage-api")
        .segmentCoded([datasetId, distId, fileName])
        .toString();
}
