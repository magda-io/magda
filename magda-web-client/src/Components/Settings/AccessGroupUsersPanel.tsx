import React, { FunctionComponent, useState } from "react";
import {
    queryRoleUsers,
    queryRoleUsersCount,
    addUserToAccessGroup,
    removeUserToAccessGroup
} from "api-clients/AuthApis";
import reportError from "../../helpers/reportError";
import reportInfo from "./reportInfo";
import { useAsync, useAsyncCallback } from "react-async-hook";
import Loader from "rsuite/Loader";
import InputGroup from "rsuite/InputGroup";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import Input from "rsuite/Input";
import Pagination from "rsuite/Pagination";
import Table from "rsuite/Table";
import { MdAddCircle, MdSearch, MdDeleteForever } from "react-icons/md";
import OrgUnitNameLabel from "Components/OrgUnitNameLabel";
import ConfirmDialog from "./ConfirmDialog";
import "./AccessGroupUsersPanel.scss";
import { UserRecord } from "@magda/typescript-common/dist/authorization-api/model";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    groupId: string;
    groupRoleId: string;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const AccessGroupUsersPanel: FunctionComponent<PropsType> = (props) => {
    const { groupId, groupRoleId } = props;
    const [keyword, setKeyword] = useState<string>("");
    const [userId, setUserId] = useState<string>("");
    const [page, setPage] = useState<number>(1);
    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    // change this value to force the data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (
            groupRoleId: string,
            keyword: string,
            offset: number,
            limit: number,
            dataReloadToken: string
        ) => {
            try {
                const users = await queryRoleUsers(groupRoleId, {
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true,
                    offset,
                    limit
                });
                const count = await queryRoleUsersCount(groupRoleId, {
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true
                });
                return [users, count] as [UserRecord[], number];
            } catch (e) {
                reportError(`Failed to load data: ${e}`);
                throw e;
            }
        },
        [groupRoleId, keyword, offset, limit, dataReloadToken]
    );

    const [users, totalCount] = result ? result : [[], 0];

    const addUser = useAsyncCallback(async (userId: string) => {
        try {
            await addUserToAccessGroup(userId, groupId);
            reportInfo("Successfully add the user to the access group.", {
                type: "success",
                header: "success"
            });
            setDataReloadToken(`${Math.random()}`);
        } catch (e) {
            reportError(
                `Failed to add the user ${userId} to access group: ${e}`
            );
            throw e;
        }
    });

    const removeUser = (userId: string, userName?: string) => {
        ConfirmDialog.open({
            confirmMsg: `Are you sure that you want to remove the user "${
                userName ? userName : userId
            }" from the access group?`,
            confirmHandler: async () => {
                try {
                    await removeUserToAccessGroup(userId, groupId);
                    reportInfo(
                        "Successfully remove the user from the access group.",
                        {
                            type: "success",
                            header: "success"
                        }
                    );
                    setDataReloadToken(`${Math.random()}`);
                } catch (e) {
                    reportError(
                        `Failed to remove the user ${userId} from the access group: ${e}`
                    );
                }
            }
        });
    };

    return (
        <div className="access-group-users-panel">
            <div className="search-button-container">
                <div className="left-button-area-container">
                    <Input
                        value={userId}
                        onChange={setUserId}
                        placeholder="Please enter the ID of the user to be added..."
                    />
                    <Button
                        color="blue"
                        appearance="primary"
                        disabled={addUser.loading}
                        onClick={() => addUser.execute(userId)}
                    >
                        <MdAddCircle /> Add user to the group
                    </Button>
                    {addUser.loading ? <Loader /> : null}
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
                    height={420}
                    autoHeight={true}
                    data={(users?.length ? users : []) as any}
                    loading={isLoading}
                >
                    <Column width={150} align="center" resizable>
                        <HeaderCell>Id</HeaderCell>
                        <Cell dataKey="id" />
                    </Column>

                    <Column width={150} resizable>
                        <HeaderCell>Display Name</HeaderCell>
                        <Cell dataKey="displayName" />
                    </Column>

                    <Column width={200} flexGrow={1}>
                        <HeaderCell>Email</HeaderCell>
                        <Cell dataKey="email" />
                    </Column>

                    <Column width={100} resizable>
                        <HeaderCell>Photo URL</HeaderCell>
                        <Cell dataKey="photoURL" />
                    </Column>
                    <Column width={150} resizable>
                        <HeaderCell>Source</HeaderCell>
                        <Cell dataKey="source" />
                    </Column>
                    <Column width={150} resizable>
                        <HeaderCell>Source ID</HeaderCell>
                        <Cell dataKey="sourceId" />
                    </Column>
                    <Column width={150} flexGrow={1}>
                        <HeaderCell>Orgnasitional Unit</HeaderCell>
                        <Cell>
                            {(rowData: any) => (
                                <OrgUnitNameLabel id={rowData?.orgUnitId} />
                            )}
                        </Cell>
                    </Column>
                    <Column width={100} fixed="right">
                        <HeaderCell align="center">Action</HeaderCell>
                        <Cell
                            verticalAlign="middle"
                            align="center"
                            style={{ padding: "0px" }}
                        >
                            {(rowData) => {
                                return (
                                    <div>
                                        <IconButton
                                            size="md"
                                            title="Remove the user from the access group"
                                            aria-label="Remove the user from the access group"
                                            icon={<MdDeleteForever />}
                                            onClick={() =>
                                                removeUser(
                                                    rowData?.id,
                                                    rowData?.displayName
                                                )
                                            }
                                        />
                                    </div>
                                );
                            }}
                        </Cell>
                    </Column>
                </Table>
                <div className="pagination-container">
                    <Pagination
                        prev
                        next
                        first
                        last
                        ellipsis
                        boundaryLinks
                        maxButtons={5}
                        size="xs"
                        layout={["total", "-", "limit", "|", "pager", "skip"]}
                        total={totalCount}
                        limitOptions={[DEFAULT_MAX_PAGE_RECORD_NUMBER, 20]}
                        limit={limit}
                        activePage={page}
                        onChangePage={setPage}
                        onChangeLimit={setLimit}
                    />
                </div>
            </div>
        </div>
    );
};

export default AccessGroupUsersPanel;
