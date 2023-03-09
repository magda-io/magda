import React, { FunctionComponent, useState } from "react";
import { useSelector } from "react-redux";
import { StateType } from "reducers/reducer";
import { Role, User } from "reducers/userManagementReducer";
import Table from "rsuite/Table";
import Panel from "rsuite/Panel";
import Message from "rsuite/Message";
import Pagination from "rsuite/Pagination";
import IconButton from "rsuite/IconButton";
import { BsFillKeyFill } from "react-icons/bs";
import "./MyRoles.scss";
import MyRolePermissionsPopUp from "./MyRolePermissionsPopUp";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 5;

const MyRoles: FunctionComponent = () => {
    const [page, setPage] = useState<number>(1);
    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;
    const [selectRoleId, setSelectRoleId] = useState<string>();

    const user = useSelector<StateType, User>(
        (state) => state?.userManagement?.user
    );
    const isWhoAmILoading = useSelector<StateType, boolean>(
        (state) => state?.userManagement?.isFetchingWhoAmI
    );
    const whoAmILoadingError = useSelector<StateType, Error | null>(
        (state) => state?.userManagement?.whoAmIError
    );

    const userRoles = user?.roles?.length ? user.roles : [];
    const totalRoleNum = userRoles.length;
    const maxPageNum = Math.ceil(totalRoleNum / limit);
    const roles = userRoles.length
        ? userRoles.slice(offset, offset + limit)
        : [];

    return (
        <Panel bordered className="my-roles-container">
            {whoAmILoadingError ? (
                <Message showIcon type="error" header="Error">
                    {"Failed to load your account details: " +
                        whoAmILoadingError}
                </Message>
            ) : null}
            <Table
                height={420}
                autoHeight={true}
                data={roles as any}
                loading={isWhoAmILoading}
            >
                <Column width={390} align="center" fixed>
                    <HeaderCell>Id</HeaderCell>
                    <Cell dataKey="id" />
                </Column>
                <Column flexGrow={2}>
                    <HeaderCell> Name</HeaderCell>
                    <Cell dataKey="name" />
                </Column>
                <Column width={120} fixed="right">
                    <HeaderCell align="center">View Permissions</HeaderCell>
                    <Cell
                        verticalAlign="middle"
                        style={{ padding: "0px" }}
                        align="center"
                    >
                        {(rowData: Role) => (
                            <div>
                                <IconButton
                                    size="md"
                                    title="View Role Permissions"
                                    aria-label="View Role Permissions"
                                    icon={<BsFillKeyFill />}
                                    onClick={() => setSelectRoleId(rowData.id)}
                                />
                            </div>
                        )}
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
                    total={totalRoleNum}
                    limitOptions={[DEFAULT_MAX_PAGE_RECORD_NUMBER, 10]}
                    limit={limit}
                    activePage={page}
                    onChangePage={(page) => {
                        setPage(page > maxPageNum ? maxPageNum : page);
                    }}
                    onChangeLimit={setLimit}
                />
            </div>
            {selectRoleId ? (
                <MyRolePermissionsPopUp
                    roleId={selectRoleId}
                    resetRoleId={() => setSelectRoleId(undefined)}
                />
            ) : null}
        </Panel>
    );
};

export default MyRoles;
