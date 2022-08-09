import React, { FunctionComponent, useState } from "react";
import { Link } from "react-router-dom";
import editIcon from "assets/edit.svg";
import "./DatasetGrid.scss";
import { useAsync } from "react-async-hook";
import getDatasetAspectQueries from "./getDatasetAspectQueries";
import {
    Record,
    fetchRecords,
    FetchRecordsOptions,
    DatasetTypes
} from "api-clients/RegistryApis";
import Button from "rsuite/Button";
import ButtonGroup from "rsuite/ButtonGroup";
import reportError from "helpers/reportError";
import moment from "moment";
import { BsFillTrashFill } from "react-icons/bs";
import ConfirmDialog from "../../Settings/ConfirmDialog";
import { deleteDataset } from "../../Dataset/Add/DatasetAddCommon";
import uniq from "lodash/uniq";

const PAGE_SIZE = 10;

type PropsType = {
    searchText: string;
    datasetType: DatasetTypes;
};

function createRows(
    datasetType: DatasetTypes,
    records: Record[] | undefined,
    loading: boolean,
    setRecordReloadToken: React.Dispatch<React.SetStateAction<string>>,
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
        return records.map((record, idx) => {
            const isDraft = record?.aspects?.["publishing"]?.state
                ? record.aspects["publishing"].state === "draft"
                : // when publishing aspect not exist assume it's published dataset
                  false;
            return (
                <tr key={idx}>
                    <td>{getTitle(datasetType, record)}</td>
                    <td className="date-col">{getDate(datasetType, record)}</td>
                    <td className="action-buttons-col">
                        <Link
                            className="edit-button"
                            to={`/dataset/${
                                isDraft ? "add/metadata" : "edit"
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
                                        loadingText: "Deleting dataset...",
                                        errorNotificationDuration: 0,
                                        confirmHandler: async () => {
                                            const result = await deleteDataset(
                                                record.id
                                            );
                                            if (result.hasError) {
                                                console.error(
                                                    "Failed to remove resources when delete dataset:",
                                                    result
                                                );
                                                throw new Error(
                                                    `The following files are failed to be removed during the dataset deletion:
                                                ${result.failureReasons
                                                    .map(
                                                        (item) =>
                                                            `"${item.title}", error: ${item.error}`
                                                    )
                                                    .join(";\n ")}`
                                                );
                                            }
                                            setRecordReloadToken(
                                                "" + Math.random()
                                            );
                                        }
                                    })
                                }
                            />
                        </button>
                    </td>
                </tr>
            );
        });
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
    const { datasetType, searchText } = props;
    const [pageTokenList, setPageTokenList] = useState<string[]>([]);
    const [pageToken, setPageToken] = useState<string>();
    //change this value to force the record data to be reloaded
    const [recordReloadToken, setRecordReloadToken] = useState<string>("");

    const { result, loading, error } = useAsync(
        async (
            datasetType: DatasetTypes,
            searchText: string,
            pageToken?: string,
            recordReloadToken?: string
        ) => {
            const opts: FetchRecordsOptions = {
                limit: PAGE_SIZE,
                noCache: true,
                pageToken,
                reversePageTokenOrder: true
            };

            if (datasetType === "drafts") {
                opts.aspects = ["publishing"];
                opts.optionalAspects = ["dataset-draft"];
            } else {
                opts.aspects = ["dcat-dataset-strings"];
                opts.optionalAspects = ["publishing"];
            }

            opts.aspectQueries = getDatasetAspectQueries(
                datasetType,
                searchText
            );

            return await fetchRecords(opts);
        },
        [datasetType, searchText, pageToken, recordReloadToken]
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
                            setRecordReloadToken,
                            overAllError
                        )}
                    </tbody>
                </table>
            </div>
            <hr className="grid-bottom-divider" />
            <div className="paging-area">
                <ButtonGroup>
                    <Button
                        appearance="ghost"
                        disabled={!pageToken}
                        onClick={() => {
                            setPageToken(undefined);
                            setPageTokenList([""]);
                        }}
                    >
                        First Page
                    </Button>
                    <Button
                        appearance="ghost"
                        disabled={!pageToken}
                        onClick={() => {
                            const newPageTokenList = [...pageTokenList];
                            const prevPageToken = newPageTokenList.pop();
                            setPageToken(
                                prevPageToken ? prevPageToken : undefined
                            );
                            setPageTokenList(newPageTokenList);
                        }}
                    >
                        Prev Page
                    </Button>
                    <Button
                        appearance="ghost"
                        disabled={!result?.nextPageToken || !result?.hasMore}
                        onClick={() => {
                            if (!result?.nextPageToken) {
                                reportError(
                                    "Failed to fetch next page: Next token is empty"
                                );
                                return;
                            }
                            const nextPageToken = result?.nextPageToken as string;
                            setPageToken(nextPageToken);
                            const newPageTokenList = uniq([
                                ...pageTokenList,
                                pageToken ? pageToken : ""
                            ]);
                            setPageTokenList(newPageTokenList);
                        }}
                    >
                        Next Page
                    </Button>
                </ButtonGroup>
            </div>
        </>
    );
};

export default DatasetGrid;
