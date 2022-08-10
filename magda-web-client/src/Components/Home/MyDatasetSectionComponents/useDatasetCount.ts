import { useAsync } from "react-async-hook";
import {
    fetchRecordsCount,
    FetchRecordsCountOptions,
    DatasetTypes
} from "api-clients/RegistryApis";
import getDatasetAspectQueries from "./getDatasetAspectQueries";

export default function useDatasetCount(
    datasetType: DatasetTypes,
    searchText: string,
    userId: string
) {
    return useAsync(
        async (
            datasetType: DatasetTypes,
            searchText: string,
            userId: string
        ) => {
            const opts: FetchRecordsCountOptions = {
                aspectQueries: getDatasetAspectQueries(datasetType, searchText)
            };

            if (datasetType === "drafts") {
                opts.aspects = ["publishing"];
            } else {
                opts.aspects = ["dcat-dataset-strings"];
            }

            return await fetchRecordsCount(opts);
        },
        [datasetType, searchText, userId]
    );
}
