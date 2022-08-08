import React, { FunctionComponent } from "react";
import { useAsync } from "react-async-hook";
import {
    fetchRecordsCount,
    FetchRecordsCountOptions,
    DatasetTypes
} from "api-clients/RegistryApis";
import getDatasetAspectQueries from "./getDatasetAspectQueries";

type PropsType = {
    searchText: string;
    datasetType: DatasetTypes;
    userId: string;
};

const DatasetCountLabel: FunctionComponent<PropsType> = (props) => {
    const { result: count, loading, error } = useAsync(
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
        [props.datasetType, props.searchText, props.userId]
    );

    return <>{!loading && !error ? count : null}</>;
};

export default DatasetCountLabel;
