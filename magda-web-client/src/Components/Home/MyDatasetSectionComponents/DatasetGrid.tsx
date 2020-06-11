import React, { FunctionComponent, useState } from "react";
import { Link } from "react-router-dom";
import editIcon from "assets/edit.svg";
import "./DatasetGrid.scss";
import { useAsync } from "react-async-hook";
import {
    Record,
    fetchRecords,
    FetchRecordsOptions,
    AspectQuery,
    AspectQueryOperators
} from "api-clients/RegistryApis";
import moment from "moment";

export type DatasetTypes = "drafts" | "published";

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
                <td className="edit-button-col">
                    <Link
                        className="edit-button"
                        to={`/dataset/${
                            record?.aspects?.["dataset-draft"]?.data ||
                            !record?.aspects?.["dcat-dataset-strings"]
                                ? "add/metadata"
                                : "edit"
                        }/${encodeURIComponent(record.id)}`}
                    >
                        <img src={editIcon} />
                    </Link>
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
    const [pageToken, setPageToken] = useState<string>("");

    const { result, loading, error } = useAsync(
        async (
            datasetType: DatasetTypes,
            searchText: string,
            pageToken: string
        ) => {
            const opts: FetchRecordsOptions = {
                limit: 10,
                noCache: true
            };

            if (pageToken) {
                opts.pageToken = pageToken;
            }

            if (datasetType === "drafts") {
                opts.aspects = ["publishing"];
                opts.optionalAspects = ["dataset-draft"];
                opts.orderBy = "dataset-draft.timestamp";
                opts.aspectQueries = [
                    new AspectQuery(
                        "publishing.state",
                        AspectQueryOperators["="],
                        `draft`,
                        true
                    ),
                    new AspectQuery(
                        "dataset-access-control.ownerId",
                        AspectQueryOperators["="],
                        props.userId,
                        true
                    )
                ];
            } else {
                opts.aspects = ["dcat-dataset-strings"];
                opts.optionalAspects = ["publishing"];
                opts.orderBy = "dcat-dataset-strings.modified";
                opts.aspectQueries = [
                    new AspectQuery(
                        "publishing.state",
                        AspectQueryOperators["="],
                        `published`,
                        true
                    ),
                    new AspectQuery(
                        "dataset-access-control.ownerId",
                        AspectQueryOperators["="],
                        props.userId,
                        true
                    )
                ];
            }

            searchText = searchText.trim();

            if (searchText) {
                // --- generate keyword search
                if (datasetType === "drafts") {
                    opts.aspectQueries = opts.aspectQueries.concat([
                        new AspectQuery(
                            "dataset-draft.dataset.title",
                            AspectQueryOperators.patternMatch,
                            `%${searchText}%`,
                            false
                        ),
                        new AspectQuery(
                            "dataset-draft.dataset.description",
                            AspectQueryOperators.patternMatch,
                            `%${searchText}%`,
                            false
                        ),
                        new AspectQuery(
                            "dataset-draft.dataset.themes",
                            AspectQueryOperators.patternMatch,
                            `%${searchText}%`,
                            false
                        ),
                        new AspectQuery(
                            "dataset-draft.dataset.keywords",
                            AspectQueryOperators.patternMatch,
                            `%${searchText}%`,
                            false
                        )
                    ]);
                } else {
                    opts.aspectQueries = opts.aspectQueries.concat([
                        new AspectQuery(
                            "dcat-dataset-strings.title",
                            AspectQueryOperators.patternMatch,
                            `%${searchText}%`,
                            false
                        ),
                        new AspectQuery(
                            "dcat-dataset-strings.description",
                            AspectQueryOperators.patternMatch,
                            `%${searchText}%`,
                            false
                        ),
                        new AspectQuery(
                            "dcat-dataset-strings.themes",
                            AspectQueryOperators.patternMatch,
                            `%${searchText}%`,
                            false
                        ),
                        new AspectQuery(
                            "dcat-dataset-strings.keywords",
                            AspectQueryOperators.patternMatch,
                            `%${searchText}%`,
                            false
                        )
                    ]);
                }
            }
            return await fetchRecords(opts);
        },
        [props.datasetType, props.searchText, pageToken]
    );

    return (
        <>
            <table>
                <thead>
                    <tr>
                        <th>Dataset title</th>
                        <th className="date-col">Update Date</th>
                        <th className="edit-button-col">&nbsp;</th>
                    </tr>
                </thead>

                <tbody>
                    {createRows(datasetType, result?.records, loading, error)}
                </tbody>
            </table>
            <hr className="grid-bottom-divider" />
            <div className="paging-area">
                <button
                    className="next-page-button"
                    disabled={
                        result?.hasMore === true && !loading ? false : true
                    }
                    onClick={() => {
                        setPageToken(
                            result?.nextPageToken ? result.nextPageToken : ""
                        );
                    }}
                >
                    Next page
                </button>
                {result?.hasMore !== true && pageToken && !loading ? (
                    <button
                        className="first-page-button"
                        onClick={() => {
                            setPageToken("");
                        }}
                    >
                        First page
                    </button>
                ) : null}
            </div>
        </>
    );
};

export default DatasetGrid;
