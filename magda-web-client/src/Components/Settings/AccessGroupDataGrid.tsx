import React, { FunctionComponent, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import ButtonGroup from "rsuite/ButtonGroup";
import { Input, InputGroup, IconButton } from "rsuite";
import {
    MdSearch,
    MdBorderColor,
    MdDeleteForever,
    MdPreview,
    MdAddCircle,
    MdInfoOutline
} from "react-icons/md";
import UserNameLabel from "../UserNameLabel";
import reportError from "../../helpers/reportError";
//import ConfirmDialog from "../Settings/ConfirmDialog";
import AccessGroupFormPopUp, {
    RefType as AccessGroupFormPopUpRefType
} from "./AccessGroupFormPopUp";
import Whisper from "rsuite/Whisper";
import Popover from "rsuite/Popover";
import List from "rsuite/List";
import {
    fetchRecords,
    AspectQuery,
    AspectQueryOperators
} from "api-clients/RegistryApis";
import { deleteAccessGroup, AccessGroup } from "api-clients/AuthApis";
import uniq from "lodash/uniq";
import ConfirmDialog from "./ConfirmDialog";
import DateDisplayWithTooltip from "Components/DateDisplayWithTooltip";
import VisibleForUser from "../VisibleForUser";
import { User } from "reducers/userManagementReducer";
import "./AccessGroupDataGrid.scss";
import { ADMIN_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants.js";

function hasAccessGroupCreationPermission(userData: User): boolean {
    if (!userData) {
        return false;
    }
    if (userData?.roles?.find((r) => r.id === ADMIN_USERS_ROLE_ID)) {
        return true;
    }
    return !!userData?.permissions?.find(
        (p) =>
            !!p?.operations?.find((o) => o.uri === "object/accessGroup/create")
    );
}

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const AccessGroupDataGrid: FunctionComponent<PropsType> = (
    props: PropsType
) => {
    const [keyword, setKeyword] = useState<string>("");
    const [pageTokenList, setPageTokenList] = useState<string[]>([]);
    const [pageToken, setPageToken] = useState<string>();

    const [searchInputText, setSearchInputText] = useState<string>("");

    // change this value to force the data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const accessGroupFormRef = useRef<AccessGroupFormPopUpRefType>(null);

    const { result, loading: isLoading } = useAsync(
        async (
            keyword: string,
            pageToken?: string,
            dataReloadToken?: string
        ) => {
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
        [keyword, pageToken, dataReloadToken]
    );

    const deleteAccessGroupHandler = (groupId: string, groupName: string) => {
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of access group "${groupName}"?`,
            confirmHandler: async () => {
                try {
                    await deleteAccessGroup(groupId);
                    setDataReloadToken(`${Math.random()}`);
                } catch (e) {
                    reportError(`Failed to delete the access group: ${e}`);
                }
            }
        });
    };

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
        <div className="access-group-data-grid">
            <div className="search-button-container">
                <VisibleForUser
                    checkUserFunc={hasAccessGroupCreationPermission}
                >
                    <>
                        <div className="left-button-area-container">
                            <Button
                                color="blue"
                                appearance="primary"
                                onClick={() =>
                                    accessGroupFormRef?.current?.open(
                                        undefined,
                                        () => {
                                            setDataReloadToken(
                                                `${Math.random()}`
                                            );
                                        }
                                    )
                                }
                            >
                                <MdAddCircle /> Create Access Group
                            </Button>
                        </div>
                        <AccessGroupFormPopUp ref={accessGroupFormRef} />
                    </>
                </VisibleForUser>
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
                                        <Link
                                            to={`/settings/accessGroups/${encodeURIComponent(
                                                rowData.id
                                            )}`}
                                        >
                                            <IconButton
                                                size="md"
                                                title="Open the access group details"
                                                aria-label="Open the access group details"
                                                icon={<MdPreview />}
                                            />
                                        </Link>
                                        <IconButton
                                            size="md"
                                            title="Edit the access group"
                                            aria-label="Edit the access group"
                                            icon={<MdBorderColor />}
                                            onClick={() =>
                                                accessGroupFormRef?.current?.open(
                                                    rowData?.id,
                                                    () => {
                                                        setDataReloadToken(
                                                            `${Math.random()}`
                                                        );
                                                    }
                                                )
                                            }
                                        />
                                        <IconButton
                                            size="md"
                                            title="Delete the access group"
                                            aria-label="Delete the access group"
                                            icon={<MdDeleteForever />}
                                            onClick={() =>
                                                deleteAccessGroupHandler(
                                                    rowData?.id,
                                                    rowData?.name
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

export default AccessGroupDataGrid;
