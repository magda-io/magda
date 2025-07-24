import React, { FunctionComponent, useState } from "react";
import { Link } from "react-router-dom";
import {
    addDatasetToAccessGroup,
    removeDatasetToAccessGroup
} from "api-clients/AuthApis";
import reportError from "../../helpers/reportError";
import reportInfo from "./reportInfo";
import { useAsync, useAsyncCallback } from "react-async-hook";
import Loader from "rsuite/Loader";
import InputGroup from "rsuite/InputGroup";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import ButtonGroup from "rsuite/ButtonGroup";
import Whisper from "rsuite/Whisper";
import Popover from "rsuite/Popover";
import Input from "rsuite/Input";
import Table from "rsuite/Table";
import UserNameLabel from "Components/UserNameLabel";
import DateDisplayWithTooltip from "Components/DateDisplayWithTooltip";
import {
    AspectQuery,
    AspectQueryOperators,
    fetchRecords
} from "api-clients/RegistryApis";
import {
    MdAddCircle,
    MdSearch,
    MdPreview,
    MdDeleteForever
} from "react-icons/md";
import uniq from "lodash/uniq";
import OrgUnitNameLabel from "Components/OrgUnitNameLabel";
import ConfirmDialog from "./ConfirmDialog";
import "./AccessGroupDatasetsPanel.scss";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    groupId: string;
    groupPermissionId: string;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const AccessGroupDatasetsPanel: FunctionComponent<PropsType> = (props) => {
    const { groupId, groupPermissionId } = props;
    const [keyword, setKeyword] = useState<string>("");
    const [datasetId, setDatasetId] = useState<string>("");
    const [pageTokenList, setPageTokenList] = useState<string[]>([]);
    const [pageToken, setPageToken] = useState<string>();

    const [searchInputText, setSearchInputText] = useState<string>("");

    // change this value to force the data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (
            keyword: string,
            pageToken?: string,
            dataReloadToken?: string
        ) => {
            try {
                const aspectQueries: AspectQuery[] = [];
                aspectQueries.push(
                    new AspectQuery(
                        "access-control.preAuthorisedPermissionIds",
                        AspectQueryOperators.arrayContains,
                        groupPermissionId
                    )
                );
                keyword = keyword.trim();
                if (keyword) {
                    aspectQueries.push(
                        new AspectQuery(
                            "dcat-dataset-strings.title",
                            AspectQueryOperators.patternMatch,
                            `%${keyword}%`,
                            false
                        ),
                        new AspectQuery(
                            "dcat-dataset-strings.description",
                            AspectQueryOperators.patternMatch,
                            `%${keyword}%`,
                            false
                        )
                    );
                }

                const records = await fetchRecords({
                    // we only want to list dataset records here
                    aspects: ["dcat-dataset-strings", "access-control"],
                    optionalAspects: [],
                    pageToken,
                    dereference: false,
                    aspectQueries,
                    limit: DEFAULT_MAX_PAGE_RECORD_NUMBER,
                    noCache: true
                });

                return records;
            } catch (e) {
                reportError(`Failed to fetch access group record: ${e}`);
                throw e;
            }
        },
        [keyword, pageToken, dataReloadToken]
    );

    const addDataset = useAsyncCallback(async (datasetId: string) => {
        try {
            await addDatasetToAccessGroup(datasetId, groupId);
            reportInfo("Successfully add dataset to the access group.", {
                type: "success",
                header: "success"
            });
            setDataReloadToken(`${Math.random()}`);
        } catch (e) {
            reportError(
                `Failed to add dataset ${datasetId} to access group: ${e}`
            );
            throw e;
        }
    });

    const removeDataset = (datasetId: string, datasetName?: string) => {
        ConfirmDialog.open({
            confirmMsg: `Are you sure that you want to remove the dataset "${
                datasetName ? datasetName : datasetId
            }" from the access group?`,
            confirmHandler: async () => {
                try {
                    await removeDatasetToAccessGroup(datasetId, groupId);
                    reportInfo(
                        "Successfully remove dataset from the access group.",
                        {
                            type: "success",
                            header: "success"
                        }
                    );
                    setDataReloadToken(`${Math.random()}`);
                } catch (e) {
                    reportError(
                        `Failed to remove dataset ${datasetId} from the access group: ${e}`
                    );
                }
            }
        });
    };

    return (
        <div className="access-group-datasets-panel">
            <div className="search-button-container">
                <div className="left-button-area-container">
                    <Input
                        value={datasetId}
                        onChange={setDatasetId}
                        placeholder="Please enter the ID of the dataset to be added..."
                    />
                    <Button
                        color="blue"
                        appearance="primary"
                        disabled={addDataset.loading}
                        onClick={() => addDataset.execute(datasetId)}
                    >
                        <MdAddCircle /> Add dataset to the group
                    </Button>
                    {addDataset.loading ? <Loader /> : null}
                </div>
                <div className="search-button-inner-wrapper">
                    <InputGroup size="md" inside>
                        <Input
                            placeholder="Enter a keyword to search..."
                            value={searchInputText}
                            onChange={setSearchInputText}
                            onKeyDown={(e) => {
                                if (e.keyCode === 13) {
                                    setKeyword(searchInputText);
                                }
                            }}
                        />
                        <InputGroup.Button
                            onClick={() => setKeyword(searchInputText)}
                        >
                            <MdSearch />
                        </InputGroup.Button>
                    </InputGroup>
                </div>
            </div>
            <div>
                <Table
                    autoHeight={true}
                    data={
                        (result?.records?.length ? result.records : []) as any
                    }
                    loading={isLoading}
                >
                    <Column width={350}>
                        <HeaderCell> Name</HeaderCell>
                        <Cell dataKey="name" />
                    </Column>
                    <Column width={150} flexGrow={1}>
                        <HeaderCell>Description</HeaderCell>
                        <Cell>
                            {(rowData: any) =>
                                rowData?.description ? (
                                    <Whisper
                                        trigger="hover"
                                        placement={"topStart"}
                                        enterable={true}
                                        controlId={`control-id-desc-${rowData.id}`}
                                        speaker={
                                            <Popover>
                                                <pre>
                                                    {rowData?.description}
                                                </pre>
                                            </Popover>
                                        }
                                    >
                                        <div>{rowData?.description}</div>
                                    </Whisper>
                                ) : (
                                    ""
                                )
                            }
                        </Cell>
                    </Column>
                    <Column width={150} resizable>
                        <HeaderCell>Owner</HeaderCell>
                        <Cell>
                            {(rowData: any) => (
                                <UserNameLabel
                                    userId={
                                        rowData?.aspects?.["access-control"]
                                            ?.ownerId
                                    }
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column width={150} resizable>
                        <HeaderCell>Org Unit</HeaderCell>
                        <Cell>
                            {(rowData: any) => (
                                <OrgUnitNameLabel
                                    id={
                                        rowData?.aspects?.["access-control"]
                                            ?.orgUnitId
                                    }
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column width={120} resizable>
                        <HeaderCell align="center">Issued Time</HeaderCell>
                        <Cell align="center">
                            {(rowData: any) => (
                                <DateDisplayWithTooltip
                                    dateValue={
                                        rowData?.aspects?.[
                                            "dcat-dataset-strings"
                                        ]?.issued
                                            ? new Date(
                                                  rowData.aspects[
                                                      "dcat-dataset-strings"
                                                  ].issued
                                              )
                                            : undefined
                                    }
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column width={150} fixed="right">
                        <HeaderCell align="center">Action</HeaderCell>
                        <Cell
                            verticalAlign="middle"
                            style={{ padding: "0px" }}
                            align="center"
                        >
                            {(rowData) => {
                                return (
                                    <>
                                        <Link
                                            to={`/dataset/${encodeURIComponent(
                                                rowData.id
                                            )}`}
                                            target={`view-dataset-${rowData.id}`}
                                        >
                                            <IconButton
                                                size="md"
                                                title="View Dataset Details"
                                                aria-label="View Dataset Details"
                                                icon={<MdPreview />}
                                            />
                                        </Link>
                                        <IconButton
                                            size="md"
                                            title="Remove the dataset from the access group"
                                            aria-label="Remove the dataset from the access group"
                                            icon={<MdDeleteForever />}
                                            onClick={() =>
                                                removeDataset(
                                                    rowData?.id as string,
                                                    rowData?.aspects?.[
                                                        "dcat-dataset-strings"
                                                    ]?.title
                                                )
                                            }
                                        />
                                    </>
                                );
                            }}
                        </Cell>
                    </Column>
                </Table>
                <div className="pagination-container">
                    <ButtonGroup>
                        <Button
                            disabled={!pageToken}
                            onClick={() => {
                                setPageToken(undefined);
                                setPageTokenList([""]);
                            }}
                        >
                            First Page
                        </Button>
                        <Button
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
                            disabled={
                                !result?.nextPageToken || !result?.hasMore
                            }
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
            </div>
        </div>
    );
};

export default AccessGroupDatasetsPanel;
