import React, {
    FunctionComponent,
    useState,
    useCallback,
    useEffect,
    useRef
} from "react";
import { useHistory } from "react-router-dom";
import { History } from "history";
import "./DatasetGrid.scss";
import { useAsync } from "react-async-hook";
import getDatasetAspectQueries from "./getDatasetAspectQueries";
import {
    Record,
    fetchRecords,
    FetchRecordsOptions,
    DatasetTypes,
    updateAspectOfDatasetAndDistributions
} from "api-clients/RegistryApis";
import moment from "moment";
import {
    BsFillTrashFill,
    BsFolderSymlink,
    BsBoxArrowInRight
} from "react-icons/bs";
import {
    MdBorderColor,
    MdOutlineArrowDropDown,
    MdPreview
} from "react-icons/md";
import { RiRobot3Fill } from "react-icons/ri";
import ConfirmDialog from "../../Settings/ConfirmDialog";
import { deleteDataset } from "../../Dataset/Add/DatasetAddCommon";
import openWindow from "../../../helpers/openWindow";
import Button from "rsuite/Button";
import Popover from "rsuite/Popover";
import Dropdown from "rsuite/Dropdown";
import IconButton from "rsuite/IconButton";
import ButtonGroup from "rsuite/ButtonGroup";
import Whisper from "rsuite/Whisper";
import reportError from "helpers/reportError";
import uniq from "lodash/uniq";
import { indexDatasetById } from "api-clients/IndexerApis";
import AccessGroupAddDatasetPopUp, {
    RefType as AccessGroupAddDatasetPopUpRefType
} from "../../Settings/AccessGroupAddDatasetPopUp";

const PAGE_SIZE = 10;

type PropsType = {
    searchText: string;
    datasetType: DatasetTypes;
    recordReloadToken?: string;
    openInPopUp?: boolean;
};

function createDatsetRow(
    addToAccessGroupPopupRef: React.RefObject<
        AccessGroupAddDatasetPopUpRefType
    >,
    history: History,
    idx: number,
    record: Record,
    setRecordReloadToken: React.Dispatch<React.SetStateAction<string>>,
    openInPopUp?: boolean
) {
    const isDraft = record?.aspects?.["publishing"]?.state
        ? record.aspects["publishing"].state === "draft"
        : // when publishing aspect not exist assume it's published dataset
          false;
    const hasEverPublished =
        record?.aspects?.["publishing"]?.hasEverPublished === true
            ? true
            : false;
    return (
        <tr key={idx}>
            <td>{getTitle(isDraft, record)}</td>
            <td className="date-col">{getDate(isDraft, record)}</td>
            <td
                className={`action-buttons-col ${
                    isDraft ? "is-draft" : "is-not-draft"
                }`}
            >
                <ButtonGroup>
                    <Button
                        appearance="ghost"
                        aria-label="actions available to the dataset"
                        title="actions available to the dataset"
                    >
                        Actions
                    </Button>
                    <Whisper
                        placement="bottomEnd"
                        trigger="click"
                        speaker={({ onClose, left, top, className }, ref) => {
                            return (
                                <Popover
                                    ref={ref}
                                    className={`${className} dataset-grid-action-dropdown`}
                                    style={{ left, top }}
                                    full
                                >
                                    <Dropdown.Menu>
                                        <Dropdown.Item
                                            key="view-dataset"
                                            aria-label="View Dataset"
                                            icon={<MdPreview />}
                                            onClick={() => {
                                                onClose();
                                                history.push(
                                                    `/dataset/${encodeURIComponent(
                                                        record.id
                                                    )}/details`
                                                );
                                            }}
                                        >
                                            View Dataset
                                        </Dropdown.Item>
                                        {isDraft ? null : (
                                            <Dropdown.Item
                                                key="set-dataset-to-draft"
                                                aria-label="Mark as draft"
                                                icon={<BsFolderSymlink />}
                                                onClick={() => {
                                                    onClose();
                                                    ConfirmDialog.open({
                                                        confirmMsg: `Are you sure you want to mark the dataset "${getTitle(
                                                            isDraft,
                                                            record
                                                        )}" as a draft dataset?`,
                                                        headingText:
                                                            "Confirm to update dataset?",
                                                        loadingText:
                                                            "Updating dataset...",
                                                        errorNotificationDuration: 0,
                                                        confirmHandler: async () => {
                                                            await updateAspectOfDatasetAndDistributions(
                                                                record.id,
                                                                "publishing",
                                                                {
                                                                    state:
                                                                        "draft",
                                                                    hasEverPublished: true
                                                                },
                                                                true
                                                            );
                                                            await indexDatasetById(
                                                                record.id
                                                            );
                                                            setRecordReloadToken(
                                                                "" +
                                                                    Math.random()
                                                            );
                                                        }
                                                    });
                                                }}
                                            >
                                                Mark as Draft
                                            </Dropdown.Item>
                                        )}
                                        <Dropdown.Item
                                            key="edit-dataset"
                                            aria-label="Edit Dataset"
                                            icon={<MdBorderColor />}
                                            onClick={() => {
                                                onClose();
                                                // the following datasets will be edited using "editing" flow:
                                                // - `hasEverPublished` = true
                                                // - Or `isDraft` = false
                                                const editorUrl = `/dataset/${
                                                    isDraft && !hasEverPublished
                                                        ? "add/metadata"
                                                        : "edit"
                                                }/${encodeURIComponent(
                                                    record.id
                                                )}`;
                                                if (openInPopUp) {
                                                    openWindow(
                                                        `${editorUrl}?popup=true`,
                                                        {
                                                            name:
                                                                "edit-dataset-" +
                                                                record.id
                                                        }
                                                    );
                                                } else {
                                                    history.push(editorUrl);
                                                }
                                            }}
                                        >
                                            Edit Dataset
                                        </Dropdown.Item>
                                        <Dropdown.Item
                                            key="dataset-knowledge-interview"
                                            aria-label="Dataset Knowledge Interview"
                                            icon={<RiRobot3Fill />}
                                            onClick={() => {
                                                onClose();
                                                const url = `/settings/datasets/${encodeURIComponent(
                                                    record.id
                                                )}/datasetKnowledgeInterview`;
                                                if (openInPopUp) {
                                                    openWindow(
                                                        `${url}?popup=true`,
                                                        {
                                                            name:
                                                                "dataset-knowledge-interview-" +
                                                                record.id
                                                        }
                                                    );
                                                } else {
                                                    history.push(url);
                                                }
                                            }}
                                        >
                                            Knowledge Interview
                                        </Dropdown.Item>
                                        <Dropdown.Item
                                            key="view-dataset"
                                            aria-label="View Dataset"
                                            icon={<MdPreview />}
                                            onClick={() => {
                                                onClose();
                                                history.push(
                                                    `/dataset/${encodeURIComponent(
                                                        record.id
                                                    )}/details`
                                                );
                                            }}
                                        >
                                            View Dataset
                                        </Dropdown.Item>
                                        <Dropdown.Item
                                            key="add-to-access-group"
                                            aria-label="Add to access group"
                                            icon={<BsBoxArrowInRight />}
                                            onClick={() => {
                                                addToAccessGroupPopupRef?.current?.open(
                                                    record.id
                                                );
                                                onClose();
                                            }}
                                        >
                                            Add to access group
                                        </Dropdown.Item>
                                        <Dropdown.Item
                                            key="delete-dataset"
                                            aria-label="Delete Dataset"
                                            icon={<BsFillTrashFill />}
                                            onClick={() => {
                                                onClose();
                                                ConfirmDialog.open({
                                                    confirmMsg: `Are you sure you want to delete the dataset "${getTitle(
                                                        isDraft,
                                                        record
                                                    )}"?`,
                                                    headingText:
                                                        "Confirm to Delete?",
                                                    loadingText:
                                                        "Deleting dataset...",
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
                                                                        (
                                                                            item
                                                                        ) =>
                                                                            `"${item.title}", error: ${item.error}`
                                                                    )
                                                                    .join(
                                                                        ";\n "
                                                                    )}`
                                                            );
                                                        }
                                                        setRecordReloadToken(
                                                            "" + Math.random()
                                                        );
                                                    }
                                                });
                                            }}
                                        >
                                            Delete dataset
                                        </Dropdown.Item>
                                    </Dropdown.Menu>
                                </Popover>
                            );
                        }}
                    >
                        <IconButton
                            appearance="ghost"
                            icon={<MdOutlineArrowDropDown />}
                        />
                    </Whisper>
                </ButtonGroup>
            </td>
        </tr>
    );
}

function createRows(
    addToAccessGroupPopupRef: React.RefObject<
        AccessGroupAddDatasetPopUpRefType
    >,
    history: History,
    records: Record[] | undefined,
    loading: boolean,
    setRecordReloadToken: React.Dispatch<React.SetStateAction<string>>,
    openInPopUp?: boolean,
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
        return records.map((record, idx) =>
            createDatsetRow(
                addToAccessGroupPopupRef,
                history,
                idx,
                record,
                setRecordReloadToken,
                openInPopUp
            )
        );
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

function getTitle(isDraft: boolean, record: Record) {
    let titleText: string;
    if (isDraft) {
        titleText = record?.aspects?.["dataset-draft"]?.["dataset"]?.title;
    } else {
        titleText = record?.aspects?.["dcat-dataset-strings"]?.title;
    }
    if (!titleText) {
        titleText = record?.name;
    }
    titleText = titleText ? titleText : "Untitled Dataset";
    return titleText;
}

function getDate(isDraft: boolean, record: Record) {
    let dateString;
    if (isDraft) {
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
    const history = useHistory();
    const { datasetType, searchText, openInPopUp } = props;
    const [pageTokenList, setPageTokenList] = useState<string[]>([]);
    const [pageToken, setPageToken] = useState<string>();
    const accessGroupAddDatasetPopUpRef = useRef<
        AccessGroupAddDatasetPopUpRefType
    >(null);
    //change this value to force the record data to be reloaded
    const [recordReloadToken, setRecordReloadToken] = useState<string>("");
    const combinedRecordToken = props?.recordReloadToken
        ? props.recordReloadToken
        : "" + recordReloadToken;

    const onMessageReceived = useCallback((e: MessageEvent) => {
        if (e?.data === "magda-refresh-dataset-records") {
            setRecordReloadToken("" + Math.random());
        }
    }, []);

    useEffect(() => {
        window.addEventListener("message", onMessageReceived);
        return () => {
            window.removeEventListener("message", onMessageReceived);
        };
    }, [onMessageReceived]);

    const { result, loading, error } = useAsync(
        async (
            datasetType: DatasetTypes,
            searchText: string,
            pageToken?: string,
            combinedRecordToken?: string
        ) => {
            const opts: FetchRecordsOptions = {
                limit: PAGE_SIZE,
                noCache: true,
                pageToken,
                reversePageTokenOrder: true
            };

            if (datasetType === "drafts") {
                opts.aspects = ["publishing", "dcat-dataset-strings"];
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
        [datasetType, searchText, pageToken, combinedRecordToken]
    );

    const overAllLoading = loading;
    const overAllError = error;

    return (
        <>
            <AccessGroupAddDatasetPopUp ref={accessGroupAddDatasetPopUpRef} />
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
                            accessGroupAddDatasetPopUpRef,
                            history,
                            result?.records,
                            overAllLoading,
                            setRecordReloadToken,
                            openInPopUp,
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
