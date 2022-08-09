import React, { FunctionComponent, useState, useCallback, useRef } from "react";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import Pagination from "rsuite/Pagination";
import Popover from "rsuite/Popover";
import Input from "rsuite/Input";
import InputGroup from "rsuite/InputGroup";
import IconButton from "rsuite/IconButton";
import {
    MdSearch,
    MdBorderColor,
    MdDeleteForever,
    MdAssignmentReturned,
    MdAddCircle
} from "react-icons/md";
import { GiKeyring } from "react-icons/gi";
import UserNameLabel from "../UserNameLabel";
import {
    queryRoles,
    QueryRolesParams,
    queryRolesCount,
    RoleRecord,
    deleteUserRoles,
    deleteRole
} from "../../api-clients/AuthApis";
import "./RolesDataGrid.scss";
import reportError from "../../helpers/reportError";
import AssignUserRoleButton from "./AssignUserRoleButton";
import { useParams, Link } from "react-router-dom";
import ConfirmDialog from "./ConfirmDialog";
import RoleFormPopUp, {
    RefType as RoleFormPopUpRefType
} from "./RoleFormPopUp";
import Whisper from "rsuite/Whisper";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    queryParams?: QueryRolesParams;
    directory: string;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const RolesDataGrid: FunctionComponent<PropsType> = ({
    queryParams,
    directory
}: PropsType) => {
    const { userId } = useParams<{ userId: string }>();
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(1);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    //change this value to force the role data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const roleFormRef = useRef<RoleFormPopUpRefType>(null);

    const { result, loading: isLoading } = useAsync(
        async (
            keyword: string,
            offset: number,
            limit: number,
            dataReloadToken: string,
            user_id?: string
        ) => {
            try {
                const roles = await queryRoles({
                    keyword: keyword.trim() ? keyword : undefined,
                    offset,
                    limit,
                    user_id,
                    noCache: true
                });
                const count = await queryRolesCount({
                    keyword: keyword.trim() ? keyword : undefined,
                    user_id,
                    noCache: true
                });
                return [roles, count] as [RoleRecord[], number];
            } catch (e) {
                reportError(`Failed to load data: ${e}`);
                throw e;
            }
        },
        [keyword, offset, limit, dataReloadToken, queryParams?.user_id]
    );

    const [roles, totalCount] = result ? result : [[], 0];

    const removeRoleFromUser = useCallback(
        (roleId: string, roleName: string) => {
            ConfirmDialog.open({
                confirmMsg: `Please confirm the removal of role "${roleName}" from the user?`,
                confirmHandler: async () => {
                    try {
                        if (!roleId) {
                            throw new Error("Invalid empty role id!");
                        }
                        await deleteUserRoles(userId, [roleId]);
                        setDataReloadToken(`${Math.random()}`);
                    } catch (e) {
                        reportError(
                            `Failed to remove the role from the user: ${e}`
                        );
                    }
                }
            });
        },
        [userId]
    );

    const deleteRoleHandler = useCallback(
        (roleId: string, roleName: string) => {
            ConfirmDialog.open({
                confirmMsg: `Please confirm the deletion of role "${roleName}"?`,
                confirmHandler: async () => {
                    try {
                        if (!roleId) {
                            throw new Error("Invalid empty role id!");
                        }
                        await deleteRole(roleId);
                        setDataReloadToken(`${Math.random()}`);
                    } catch (e) {
                        reportError(`Failed to delete the role: ${e}`);
                    }
                }
            });
        },
        []
    );

    return (
        <div className="roles-data-grid">
            <div className="search-button-container">
                <div className="left-button-area-container">
                    {userId ? (
                        <AssignUserRoleButton
                            userId={userId}
                            onAssignedRole={() =>
                                setDataReloadToken(`${Math.random()}`)
                            }
                        />
                    ) : (
                        <Button
                            color="blue"
                            appearance="primary"
                            onClick={() =>
                                roleFormRef?.current?.open(undefined, () => {
                                    setDataReloadToken(`${Math.random()}`);
                                })
                            }
                        >
                            <MdAddCircle /> Create Role
                        </Button>
                    )}
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
            <RoleFormPopUp ref={roleFormRef} />
            <div>
                <Table
                    height={420}
                    autoHeight={true}
                    data={(roles?.length ? roles : []) as any}
                    loading={isLoading}
                >
                    <Column width={100} align="center" resizable>
                        <HeaderCell>Id</HeaderCell>
                        <Cell dataKey="id" />
                    </Column>

                    <Column width={200} resizable>
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
                                        placement={"top"}
                                        enterable={true}
                                        controlId={`control-id-desc-user-id-${rowData.id}`}
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

                    <Column width={100} resizable>
                        <HeaderCell>Owner Id</HeaderCell>
                        <Cell>
                            {(rowData: any) => (
                                <UserNameLabel userId={rowData?.owner_id} />
                            )}
                        </Cell>
                    </Column>
                    <Column width={100} resizable>
                        <HeaderCell>Create By</HeaderCell>
                        <Cell>
                            {(rowData: any) => (
                                <UserNameLabel userId={rowData?.create_by} />
                            )}
                        </Cell>
                    </Column>
                    <Column width={100} resizable>
                        <HeaderCell>Create Time</HeaderCell>
                        <Cell dataKey="create_time" />
                    </Column>
                    <Column width={100} resizable>
                        <HeaderCell>Edit By</HeaderCell>
                        <Cell>
                            {(rowData: any) => (
                                <UserNameLabel userId={rowData?.edit_by} />
                            )}
                        </Cell>
                    </Column>
                    <Column width={100} resizable>
                        <HeaderCell>Edit Time</HeaderCell>
                        <Cell dataKey="edit_time" />
                    </Column>
                    <Column width={120} fixed="right">
                        <HeaderCell align="center">Action</HeaderCell>
                        <Cell
                            verticalAlign="middle"
                            style={{ padding: "0px" }}
                            align="center"
                        >
                            {(rowData) => {
                                const roleId = (rowData as any)?.id;
                                const roleName = (rowData as any)?.name;
                                return (
                                    <div>
                                        {userId ? (
                                            // thus, show action menu for a user's roles
                                            <>
                                                <Link
                                                    to={`/${directory}/users/${encodeURIComponent(
                                                        userId
                                                    )}/roles/${encodeURIComponent(
                                                        roleId
                                                    )}/permissions`}
                                                >
                                                    <IconButton
                                                        size="md"
                                                        title="View Role Permissions"
                                                        aria-label="View Role Permissions"
                                                        icon={<GiKeyring />}
                                                    />
                                                </Link>{" "}
                                                <IconButton
                                                    size="md"
                                                    title="Remove the Role from the User"
                                                    aria-label="Remove the Role from the User"
                                                    icon={
                                                        <MdAssignmentReturned />
                                                    }
                                                    onClick={() =>
                                                        removeRoleFromUser(
                                                            roleId,
                                                            roleName
                                                        )
                                                    }
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <Link
                                                    to={`/${directory}/roles/${encodeURIComponent(
                                                        roleId
                                                    )}/permissions`}
                                                >
                                                    <IconButton
                                                        size="md"
                                                        title="View Role Permissions"
                                                        aria-label="View Role Permissions"
                                                        icon={<GiKeyring />}
                                                    />
                                                </Link>{" "}
                                                <IconButton
                                                    size="md"
                                                    title="Edit Role"
                                                    aria-label="Edit Role"
                                                    icon={<MdBorderColor />}
                                                    onClick={() =>
                                                        roleFormRef?.current?.open(
                                                            roleId,
                                                            () =>
                                                                setDataReloadToken(
                                                                    `${Math.random()}`
                                                                )
                                                        )
                                                    }
                                                />{" "}
                                                <IconButton
                                                    size="md"
                                                    title="Delete Role"
                                                    aria-label="Delete Role"
                                                    icon={<MdDeleteForever />}
                                                    onClick={() =>
                                                        deleteRoleHandler(
                                                            roleId,
                                                            roleName
                                                        )
                                                    }
                                                />
                                            </>
                                        )}
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

export default RolesDataGrid;
