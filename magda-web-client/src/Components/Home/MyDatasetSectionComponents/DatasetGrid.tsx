import React, { FunctionComponent, useState } from "react";
import { Link } from "react-router-dom";
import editIcon from "assets/edit.svg";
import "./DatasetGrid.scss";
import { useAsync } from "react-async-hook";
import getMyDatasetAspectQueries from "./getMyDatasetAspectQueries";
import {
    Record,
    fetchRecords,
    FetchRecordsOptions,
    DatasetTypes
} from "api-clients/RegistryApis";
import moment from "moment";
import { BsFillTrashFill } from "react-icons/bs";
import ConfirmDialog from "../../Settings/ConfirmDialog";
import { deleteDataset } from "../../Dataset/Add/DatasetAddCommon";

const PAGE_SIZE = 10;

type PropsType = {
    searchText: string;
    datasetType: DatasetTypes;
    userId: string;
};

function createRows(
    datasetType: DatasetTypes,
    records: Record[] | undefined,
    loading: boolean,
    error?: any
) {
    if (loading) {
        return (
            <tr>
                <td colSpan={3} align="center">
                    Loading...
                </td>
            </tr>
        );
    } else if (!loading && error) {
        return (
            <tr>
                <td colSpan={3} align="center">
                    {`Failed to fetch dataset: ${error}`}
                </td>
            </tr>
        );
    } else if (records?.length) {
        return records.map((record, idx) => (
            <tr key={idx}>
                <td>{getTitle(datasetType, record)}</td>
                <td className="date-col">{getDate(datasetType, record)}</td>
                <td className="action-buttons-col">
                    <Link
                        className="edit-button"
                        to={`/dataset/${
                            record?.aspects?.["dataset-draft"]?.data ||
                            !record?.aspects?.["dcat-dataset-strings"]
                                ? "add/metadata"
                                : "edit"
                        }/${encodeURIComponent(record.id)}`}
                    >
                        <img src={editIcon} alt="edit button" />
                    </Link>

                    <button className="delete-button">
                        <BsFillTrashFill
                            onClick={() =>
                                ConfirmDialog.open({
                                    confirmMsg: `Are you sure you want to delete the dataset "${getTitle(
                                        datasetType,
                                        record
                                    )}"?`,
                                    headingText: "Confirm to Delete?",
                                    confirmHandler: () =>
                                        deleteDataset(record.id)
                                })
                            }
                        />
                    </button>
                </td>
            </tr>
        ));
    } else {
        return (
            <tr>
                <td colSpan={3} align="center">
                    Cannot locate any datasets!
                </td>
            </tr>
        );
    }
}

function getTitle(datasetType: DatasetTypes, record: Record) {
    let titleText: string;
    if (datasetType === "drafts") {
        titleText = record?.aspects?.["dataset-draft"]?.["dataset"]?.title;
    } else {
        titleText = record?.aspects?.["dcat-dataset-strings"]?.title;
    }
    if (!titleText) {
        titleText = record?.name;
    }
    titleText = titleText ? titleText : "Untitled Dataset";

    return datasetType === "drafts" ? (
        titleText
    ) : (
        <Link to={`/dataset/${encodeURIComponent(record.id)}`}>
            {titleText}
        </Link>
    );
}

function getDate(datasetType: DatasetTypes, record: Record) {
    let dateString;
    if (datasetType === "drafts") {
        dateString = record?.aspects?.["dataset-draft"]?.timestamp;
    } else {
        const modified = record?.aspects?.["dcat-dataset-strings"]?.modified;
        dateString = modified
            ? modified
            : record?.aspects?.["dcat-dataset-strings"]?.issued;
    }
    const date = moment(dateString);
    if (date.isValid()) {
        return date.format("DD/MM/YYYY");
    } else {
        return "N/A";
    }
}

const DatasetGrid: FunctionComponent<PropsType> = (props) => {
    const { datasetType } = props;
    const [offset, setPageOffset] = useState<number>(0);

    const { result, loading, error } = useAsync(
        async (
            datasetType: DatasetTypes,
            searchText: string,
            userId: string,
            offset: number
        ) => {
            const opts: FetchRecordsOptions = {
                limit: PAGE_SIZE,
                noCache: true
            };

            if (offset) {
                opts.start = offset;
            }

            if (datasetType === "drafts") {
                opts.aspects = ["publishing"];
                opts.optionalAspects = ["dataset-draft"];
                opts.orderBy = "dataset-draft.timestamp";
            } else {
                opts.aspects = ["dcat-dataset-strings"];
                opts.optionalAspects = ["publishing"];
                opts.orderBy = "dcat-dataset-strings.modified";
            }

            opts.aspectQueries = getMyDatasetAspectQueries(
                datasetType,
                userId,
                searchText
            );

            return await fetchRecords(opts);
        },
        [props.datasetType, props.searchText, props.userId, offset]
    );

    const overAllLoading = loading;
    const overAllError = error;

    return (
        <>
            <div className="datat-grid-container">
                <table>
                    <thead>
                        <tr>
                            <th>Dataset title</th>
                            <th className="date-col">Last updated</th>
                            <th className="action-buttons-col">&nbsp;</th>
                        </tr>
                    </thead>

                    <tbody>
                        {createRows(
                            datasetType,
                            result?.records,
                            overAllLoading,
                            overAllError
                        )}
                    </tbody>
                </table>
            </div>
            <hr className="grid-bottom-divider" />
            <div className="paging-area">
                <button
                    className="next-page-button"
                    disabled={
                        !result?.hasMore ||
                        !result?.records?.length ||
                        overAllLoading ||
                        overAllError
                            ? true
                            : false
                    }
                    onClick={() =>
                        setPageOffset(
                            (currentOffset) => currentOffset + PAGE_SIZE
                        )
                    }
                >
                    Next page
                </button>
                <button
                    className="first-page-button"
                    disabled={
                        !offset || overAllLoading || overAllError ? true : false
                    }
                    onClick={() => {
                        setPageOffset((currentOffset) => {
                            const offset = currentOffset - PAGE_SIZE;
                            return offset < 0 ? 0 : offset;
                        });
                    }}
                >
                    Previous page
                </button>
                {!overAllLoading && !overAllError ? (
                    <div className="page-idx-info-area">
                        Page: {offset + 1} - {offset + PAGE_SIZE}
                    </div>
                ) : null}
            </div>
        </>
    );
};

export default DatasetGrid;
