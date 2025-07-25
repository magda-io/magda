import React, { FunctionComponent, useState } from "react";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import ButtonGroup from "rsuite/ButtonGroup";
import { Input, InputGroup, IconButton } from "rsuite";
import { MdSearch, MdInfoOutline } from "react-icons/md";
import { BsBoxArrowInRight } from "react-icons/bs";
import UserNameLabel from "../UserNameLabel";
import reportError from "../../helpers/reportError";
import Whisper from "rsuite/Whisper";
import Popover from "rsuite/Popover";
import List from "rsuite/List";
import {
    fetchRecords,
    AspectQuery,
    AspectQueryOperators
} from "api-clients/RegistryApis";
import { AccessGroup } from "api-clients/AuthApis";
import uniq from "lodash/uniq";
import DateDisplayWithTooltip from "Components/DateDisplayWithTooltip";
import "./AccessGroupSelectionDataGrid.scss";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    onGroupSeleted: (groupId: string, groupName: string) => any;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const AccessGroupSelectionDataGrid: FunctionComponent<PropsType> = (
    props: PropsType
) => {
    const [keyword, setKeyword] = useState<string>("");
    const [pageTokenList, setPageTokenList] = useState<string[]>([]);
    const [pageToken, setPageToken] = useState<string>();

    const [searchInputText, setSearchInputText] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (keyword: string, pageToken?: string) => {
            try {
                const aspectQueries: AspectQuery[] = [];
                keyword = keyword.trim();
                if (keyword) {
                    aspectQueries.push(
                        new AspectQuery(
                            "access-group-details.title",
                            AspectQueryOperators.patternMatch,
                            `%${keyword}%`,
                            false
                        ),
                        new AspectQuery(
                            "access-group-details.description",
                            AspectQueryOperators.patternMatch,
                            `%${keyword}%`,
                            false
                        ),
                        new AspectQuery(
                            "access-group-details.keywords",
                            AspectQueryOperators.arrayContains,
                            `${keyword}`,
                            false
                        )
                    );
                }

                const records = await fetchRecords({
                    aspects: ["access-group-details"],
                    optionalAspects: ["access-control"],
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
        [keyword, pageToken]
    );

    const groups = result?.records?.length
        ? result.records.map((item) => ({
              ...(item?.aspects?.["access-group-details"]
                  ? item.aspects["access-group-details"]
                  : {}),
              ownerId: item?.aspects?.["access-controls"]?.ownerId
                  ? item.aspects["access-controls"].ownerId
                  : undefined,
              orgUnitId: item?.aspects?.["access-controls"]?.orgUnitId
                  ? item.aspects["access-controls"].orgUnitId
                  : undefined,
              ...(item?.aspects?.["access-controls"]
                  ? item.aspects["access-group-details"]
                  : {}),
              id: item.id
          }))
        : [];

    return (
        <div className="access-group-selection-data-grid">
            <div className="search-button-container">
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
                    data={groups as any}
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
                    <Column width={140}>
                        <HeaderCell>Allowed Operations</HeaderCell>
                        <Cell align="center">
                            {(rowData: AccessGroup) => (
                                <Whisper
                                    placement="top"
                                    controlId={`toolip-whisper-control-id-${rowData.id}`}
                                    trigger="hover"
                                    speaker={
                                        <Popover title="Operations:">
                                            <List bordered size="sm">
                                                {rowData?.operationUris
                                                    ?.length ? (
                                                    rowData.operationUris.map(
                                                        (operationUri, idx) => (
                                                            <List.Item
                                                                key={idx}
                                                                index={idx}
                                                            >
                                                                {operationUri}
                                                            </List.Item>
                                                        )
                                                    )
                                                ) : (
                                                    <List.Item
                                                        key={0}
                                                        index={0}
                                                    >
                                                        This access group
                                                        doesn't set any allowed
                                                        operations
                                                    </List.Item>
                                                )}
                                            </List>
                                        </Popover>
                                    }
                                >
                                    <div>
                                        <MdInfoOutline />
                                    </div>
                                </Whisper>
                            )}
                        </Cell>
                    </Column>
                    <Column width={150} resizable>
                        <HeaderCell>Create By</HeaderCell>
                        <Cell>
                            {(rowData: any) => (
                                <UserNameLabel userId={rowData?.createBy} />
                            )}
                        </Cell>
                    </Column>
                    <Column width={120} resizable>
                        <HeaderCell align="center">Create Time</HeaderCell>
                        <Cell align="center">
                            {(rowData: any) => (
                                <DateDisplayWithTooltip
                                    dateValue={
                                        rowData?.createTime
                                            ? new Date(rowData.createTime)
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
                                        <IconButton
                                            className="add-to-group-button"
                                            appearance="ghost"
                                            size="sm"
                                            title="Add to the access group"
                                            aria-label="Add to the access group"
                                            icon={<BsBoxArrowInRight />}
                                            onClick={() =>
                                                props.onGroupSeleted(
                                                    rowData?.id,
                                                    rowData?.name
                                                )
                                            }
                                        >
                                            Add to Group
                                        </IconButton>
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

export default AccessGroupSelectionDataGrid;
