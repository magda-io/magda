import React, { FunctionComponent, useState, useCallback, useRef } from "react";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Pagination from "rsuite/Pagination";
import Popover from "rsuite/Popover";
import List from "rsuite/List";
import Whisper from "rsuite/Whisper";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import { Input, InputGroup, IconButton, Button } from "rsuite";
import {
    MdSearch,
    MdBorderColor,
    MdDeleteForever,
    MdAddCircle,
    MdInfoOutline
} from "react-icons/md";
import {
    queryRolePermissions,
    queryRolePermissionsCount,
    RolePermissionRecord,
    deleteRolePermission
} from "../../api-clients/AuthApis";
import "./PermissionDataGrid.scss";
import reportError from "../../helpers/reportError";
import ConfirmDialog from "./ConfirmDialog";
import CheckBoxIcon from "./CheckBoxIcon";
import PermissionFormPopUp, {
    RefType as PermissionFormPopUpRefType
} from "./PermissionFormPopUp";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    roleId: string;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const PermissionDataGrid: FunctionComponent<PropsType> = (props) => {
    const { roleId } = props;
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(1);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    const permissionFormRef = useRef<PermissionFormPopUpRefType>(null);

    //change this value to force the role data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (
            roleId: string,
            keyword: string,
            offset: number,
            limit: number,
            dataReloadToken: string
        ) => {
            try {
                const permissions = await queryRolePermissions(roleId, {
                    keyword: keyword.trim() ? keyword : undefined,
                    offset,
                    limit,
                    noCache: true
                });
                const count = await queryRolePermissionsCount(roleId, {
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true
                });
                return [permissions, count] as [RolePermissionRecord[], number];
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to load permission data: ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                throw e;
            }
        },
        [roleId, keyword, offset, limit, dataReloadToken]
    );

    const [permissions, totalCount] = result ? result : [[], 0];

    const removePermissionFromRole = useCallback(
        (permissionId: string, permissionName: string) => {
            ConfirmDialog.open({
                confirmMsg: `Please confirm the removal of permission "${permissionName}" from the role?`,
                confirmHandler: async () => {
                    try {
                        if (!permissionId) {
                            throw new Error("Invalid empty permission id!");
                        }
                        await deleteRolePermission(roleId, permissionId);
                        setDataReloadToken(`${Math.random()}`);
                    } catch (e) {
                        reportError(
                            `Failed to remove the permission from the role: ${e}`
                        );
                    }
                }
            });
        },
        [roleId]
    );

    return (
        <div className="role-permissions-data-grid">
            <div className="search-button-container">
                <div className="left-button-area-container">
                    <Button
                        color="blue"
                        appearance="primary"
                        onClick={() =>
                            permissionFormRef?.current?.open(undefined, () => {
                                setDataReloadToken(`${Math.random()}`);
                            })
                        }
                    >
                        <MdAddCircle /> Add Permission to Role
                    </Button>
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

            <PermissionFormPopUp roleId={roleId} ref={permissionFormRef} />

            <div>
                <Table
                    height={420}
                    autoHeight={true}
                    data={(permissions?.length ? permissions : []) as any}
                    loading={isLoading}
                >
                    <Column width={100} align="center" resizable>
                        <HeaderCell>ID</HeaderCell>
                        <Cell dataKey="id" />
                    </Column>

                    <Column width={200} resizable>
                        <HeaderCell> Name</HeaderCell>
                        <Cell dataKey="name" />
                    </Column>

                    <Column width={150} flexGrow={1}>
                        <HeaderCell>Resource URI</HeaderCell>
                        <Cell dataKey="resource_uri" />
                    </Column>

                    <Column width={80}>
                        <HeaderCell>Operations</HeaderCell>
                        <Cell align="center">
                            {(rowData: RolePermissionRecord) => (
                                <Whisper
                                    placement="top"
                                    controlId={`toolip-whisper-control-id-${rowData.id}`}
                                    trigger="hover"
                                    speaker={
                                        <Popover title="Operations:">
                                            <List bordered size="sm">
                                                {rowData?.operations?.length ? (
                                                    rowData.operations.map(
                                                        (operation, idx) => (
                                                            <List.Item
                                                                key={idx}
                                                                index={idx}
                                                            >
                                                                {operation.uri}
                                                            </List.Item>
                                                        )
                                                    )
                                                ) : (
                                                    <List.Item
                                                        key={0}
                                                        index={0}
                                                    >
                                                        This permission contains
                                                        no operations.
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
                        <HeaderCell>Ownership Constraint</HeaderCell>
                        <Cell align="center">
                            {(rowData: RolePermissionRecord) => (
                                <CheckBoxIcon
                                    value={rowData.user_ownership_constraint}
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column width={150} resizable>
                        <HeaderCell>Org Unit Constraint</HeaderCell>
                        <Cell align="center">
                            {(rowData: RolePermissionRecord) => (
                                <CheckBoxIcon
                                    value={
                                        rowData.org_unit_ownership_constraint
                                    }
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column width={180} resizable>
                        <HeaderCell>Pre-Authorised Constraint</HeaderCell>
                        <Cell align="center">
                            {(rowData: RolePermissionRecord) => (
                                <CheckBoxIcon
                                    value={rowData.pre_authorised_constraint}
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column width={120} fixed="right">
                        <HeaderCell align="center">Action</HeaderCell>
                        <Cell
                            verticalAlign="middle"
                            style={{ padding: "0px" }}
                            align="center"
                        >
                            {(rowData) => {
                                const permissionId = (rowData as any)?.id;
                                const permissionName = (rowData as any)?.name;
                                return (
                                    <div>
                                        <IconButton
                                            size="md"
                                            title="Edit Permission"
                                            aria-label="Edit Permission"
                                            icon={<MdBorderColor />}
                                            onClick={() =>
                                                permissionFormRef?.current?.open(
                                                    permissionId,
                                                    () =>
                                                        setDataReloadToken(
                                                            `${Math.random()}`
                                                        )
                                                )
                                            }
                                        />{" "}
                                        <IconButton
                                            size="md"
                                            title="Delete Permission"
                                            aria-label="Delete Permission"
                                            icon={<MdDeleteForever />}
                                            onClick={() =>
                                                removePermissionFromRole(
                                                    permissionId,
                                                    permissionName
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

export default PermissionDataGrid;
