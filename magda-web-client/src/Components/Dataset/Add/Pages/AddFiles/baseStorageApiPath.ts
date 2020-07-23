/** The bucket in the storage API where datasets are stored */
const DATASETS_BUCKET = "magda-datasets";

const baseStorageApiPath = (datasetId: string, distId: string) =>
    `${DATASETS_BUCKET}/${datasetId}/${distId}`;

export default baseStorageApiPath;
