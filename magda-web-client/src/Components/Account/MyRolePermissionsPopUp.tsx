import React, { FunctionComponent, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { StateType } from "reducers/reducer";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Table from "rsuite/Table";
import CheckBoxIcon from "../Settings/CheckBoxIcon";
import Whisper from "rsuite/Whisper";
import Popover from "rsuite/Popover";
import List from "rsuite/List";
import { MdInfoOutline } from "react-icons/md";
import "./MyRolePermissionsPopUp.scss";
import { User, Role } from "reducers/userManagementReducer";
import { Permission as RolePermissionRecord } from "@magda/typescript-common/dist/authorization-api/model";
import Pagination from "rsuite/Pagination";
import { RowDataType } from "rsuite/Table";
import { CamelCasedProperties } from "type-fest";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    roleId: string;
    resetRoleId: () => void;
};

function getRolePermissions(
    user: User,
    roleId: string
): [Role, RolePermissionRecord[]] {
    const role = user?.roles?.find((item) => item.id === roleId);
    if (!role) {
        throw new Error(
            "Failed to locate the role from the user's assigned role records."
        );
    }
    const permissions = role?.permissionIds?.map((pid) => {
        const findPermission = user?.permissions?.find((p) => p.id === pid);
        if (!findPermission) {
            throw new Error("Failed to locate permission record by id: " + pid);
        }
        return findPermission;
    });

    if (permissions?.length) {
        return [role, permissions];
    } else {
        return [role, []];
    }
}

const getPagePermission = (
    permissions: RolePermissionRecord[],
    offset: number,
    limit: number
) =>
    permissions?.length ? [...permissions.slice(offset, offset + limit)] : [];

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const MyRolePermissionsPopUp: FunctionComponent<PropsType> = (props) => {
    const { roleId, resetRoleId } = props;
    const [tblContentRefreshKey, setTblContentRefreshKey] = useState<string>(
        "initial-key"
    );
    // why we need a force render function?
    // when use an autoHeight table within a modal, we might need to refresh the table after modal is shown (onEntered).
    // as the animation of modal might impact the calculation accuracy of the auto height calculation.
    const forceRenderTbl = useCallback(
        () => setTblContentRefreshKey("" + Math.random()),
        []
    );
    const [page, setPage] = useState<number>(1);
    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;
    const user = useSelector<StateType, User>(
        (state) => state?.userManagement?.user
    );
    const isWhoAmILoading = useSelector<StateType, boolean>(
        (state) => state?.userManagement?.isFetchingWhoAmI
    );
    const whoAmILoadingError = useSelector<StateType, Error | null>(
        (state) => state?.userManagement?.whoAmIError
    );
    let errorMsg = whoAmILoadingError
        ? "Failed to load your account details: " + whoAmILoadingError
        : "";

    let role: Role | undefined = undefined;
    let rolePermissions: RolePermissionRecord[] = [];

    if (!isWhoAmILoading && !whoAmILoadingError) {
        try {
            [role, rolePermissions] = getRolePermissions(user, roleId);
        } catch (e) {
            errorMsg = "" + e;
        }
    }
    const totalPermissionsNum = rolePermissions.length;
    const maxPageNum = Math.ceil(totalPermissionsNum / limit);
    const permissions = getPagePermission(rolePermissions, offset, limit);

    return (
        <Modal
            className="my-role-permissions-form-popup"
            backdrop={true}
            keyboard={true}
            open={true}
            size={"full" as any}
            overflow={true}
            onClose={resetRoleId}
            onEntered={forceRenderTbl}
        >
            <Modal.Header>
                <Modal.Title>Permissions of Role: {role?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {isWhoAmILoading ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : errorMsg ? (
                    <Message showIcon type="error" header="Error">
                        {"" + errorMsg}
                    </Message>
                ) : (
                    <>
                        <Table
                            key={tblContentRefreshKey}
                            data={permissions as RowDataType[]}
                            autoHeight={true}
                            loading={isWhoAmILoading}
                        >
                            <Column width={100} align="center" resizable>
                                <HeaderCell>ID</HeaderCell>
                                <Cell dataKey="id" />
                            </Column>

                            <Column width={250} resizable>
                                <HeaderCell> Name</HeaderCell>
                                <Cell dataKey="name" />
                            </Column>

                            <Column width={150} flexGrow={1}>
                                <HeaderCell>Resource URI</HeaderCell>
                                <Cell dataKey="resourceUri" />
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
                                                        {rowData?.operations
                                                            ?.length ? (
                                                            rowData.operations.map(
                                                                (
                                                                    operation,
                                                                    idx
                                                                ) => (
                                                                    <List.Item
                                                                        key={
                                                                            idx
                                                                        }
                                                                        index={
                                                                            idx
                                                                        }
                                                                    >
                                                                        {
                                                                            operation.uri
                                                                        }
                                                                    </List.Item>
                                                                )
                                                            )
                                                        ) : (
                                                            <List.Item
                                                                key={0}
                                                                index={0}
                                                            >
                                                                This permission
                                                                contains no
                                                                operations.
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
                                    {(
                                        rowData: CamelCasedProperties<
                                            RolePermissionRecord
                                        >
                                    ) => (
                                        <CheckBoxIcon
                                            value={
                                                rowData.userOwnershipConstraint
                                            }
                                        />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={150} resizable>
                                <HeaderCell>Org Unit Constraint</HeaderCell>
                                <Cell align="center">
                                    {(
                                        rowData: CamelCasedProperties<
                                            RolePermissionRecord
                                        >
                                    ) => (
                                        <CheckBoxIcon
                                            value={
                                                rowData.orgUnitOwnershipConstraint
                                            }
                                        />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={180} resizable>
                                <HeaderCell>
                                    Pre-Authorised Constraint
                                </HeaderCell>
                                <Cell align="center">
                                    {(
                                        rowData: CamelCasedProperties<
                                            RolePermissionRecord
                                        >
                                    ) => (
                                        <CheckBoxIcon
                                            value={
                                                rowData.preAuthorisedConstraint
                                            }
                                        />
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
                                layout={[
                                    "total",
                                    "-",
                                    "limit",
                                    "|",
                                    "pager",
                                    "skip"
                                ]}
                                total={totalPermissionsNum}
                                limitOptions={[
                                    DEFAULT_MAX_PAGE_RECORD_NUMBER,
                                    10
                                ]}
                                limit={limit}
                                activePage={page}
                                onChangePage={(page) => {
                                    setPage(
                                        page > maxPageNum ? maxPageNum : page
                                    );
                                }}
                                onChangeLimit={setLimit}
                            />
                        </div>
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={resetRoleId}>OK</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default MyRolePermissionsPopUp;
