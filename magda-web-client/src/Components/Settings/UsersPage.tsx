import React, { FunctionComponent, useState, useRef } from "react";
import { withRouter, useHistory } from "react-router-dom";
import { Location, History } from "history";
import "./main.scss";
import "./UsersPage.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import { useAsync } from "react-async-hook";
import {
    queryUsers,
    queryUsersCount,
    UserRecord
} from "../../api-clients/AuthApis";
import Table from "rsuite/Table";
import Pagination from "rsuite/Pagination";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import { Input, InputGroup } from "rsuite";
import {
    MdSearch,
    MdSwitchAccount,
    MdBorderColor,
    MdAccountTree,
    MdOutlineArrowDropDown
} from "react-icons/md";
import { BsBoxArrowInRight } from "react-icons/bs";
import Dropdown from "rsuite/Dropdown";
import Popover from "rsuite/Popover";
import Whisper from "rsuite/Whisper";
import ButtonGroup from "rsuite/ButtonGroup";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import OrgUnitNameLabel from "../OrgUnitNameLabel";
import AssignUserOrgUnitFormPopUp, {
    RefType as AssignUserOrgUnitFormPopUpRefType
} from "./AssignUserOrgUnitFormPopUp";
import UserFormPopUp, {
    RefType as UserFormPopUpRefType
} from "./UserFormPopUp";
import AccessGroupAddUserPopUp, {
    RefType as AccessGroupAddUserPopUpRefType
} from "./AccessGroupAddUserPopUp";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    location: Location;
    history: History;
};

const UsersPage: FunctionComponent<PropsType> = (props) => {
    const history = useHistory();
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(1);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    const assignUserOrgUnitFormRef = useRef<AssignUserOrgUnitFormPopUpRefType>(
        null
    );
    const userFormRef = useRef<UserFormPopUpRefType>(null);
    const accessGroupAddUserPopUpRef = useRef<AccessGroupAddUserPopUpRefType>(
        null
    );

    //change this value to force the role data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (
            keyword: string,
            offset: number,
            limit: number,
            dataReloadToken: string
        ) => {
            try {
                const users = await queryUsers({
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true,
                    offset,
                    limit
                });
                const count = await queryUsersCount({
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true
                });
                return [users, count] as [UserRecord[], number];
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to load data: ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                return [];
            }
        },
        [keyword, offset, limit, dataReloadToken]
    );

    const [users, totalCount] = result ? result : [[], 0];

    return (
        <div className="flex-main-container setting-page-main-container users-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[{ to: "/settings/users", title: "Users" }]}
                />
                <AssignUserOrgUnitFormPopUp ref={assignUserOrgUnitFormRef} />
                <UserFormPopUp ref={userFormRef} />
                <AccessGroupAddUserPopUp ref={accessGroupAddUserPopUpRef} />
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
                        height={420}
                        autoHeight={true}
                        data={(users?.length ? users : []) as any}
                        loading={isLoading}
                    >
                        <Column width={150} align="center" resizable>
                            <HeaderCell>Id</HeaderCell>
                            <Cell dataKey="id" />
                        </Column>

                        <Column width={150} flexGrow={1}>
                            <HeaderCell>Display Name</HeaderCell>
                            <Cell dataKey="displayName" />
                        </Column>

                        <Column width={200} resizable>
                            <HeaderCell>Email</HeaderCell>
                            <Cell dataKey="email" />
                        </Column>

                        <Column width={100} resizable>
                            <HeaderCell>Photo URL</HeaderCell>
                            <Cell dataKey="photoURL" />
                        </Column>
                        <Column width={100} resizable>
                            <HeaderCell>Source</HeaderCell>
                            <Cell dataKey="source" />
                        </Column>
                        <Column width={100} resizable>
                            <HeaderCell>Source ID</HeaderCell>
                            <Cell dataKey="sourceId" />
                        </Column>
                        <Column width={150} resizable>
                            <HeaderCell>Organisational Unit</HeaderCell>
                            <Cell>
                                {(rowData: any) => (
                                    <OrgUnitNameLabel id={rowData?.orgUnitId} />
                                )}
                            </Cell>
                        </Column>
                        <Column width={120} fixed="right">
                            <HeaderCell align="center">Action</HeaderCell>
                            <Cell
                                className="action-col"
                                verticalAlign="middle"
                                style={{ padding: "0px" }}
                            >
                                {(rowData) => {
                                    return (
                                        <ButtonGroup>
                                            <Button
                                                appearance="ghost"
                                                aria-label="actions available to the user"
                                                title="actions available to the user"
                                            >
                                                Actions
                                            </Button>
                                            <Whisper
                                                placement="bottomEnd"
                                                trigger="click"
                                                speaker={(
                                                    {
                                                        onClose,
                                                        left,
                                                        top,
                                                        className
                                                    },
                                                    ref
                                                ) => {
                                                    return (
                                                        <Popover
                                                            ref={ref}
                                                            className={`${className} user-datagrid-action-dropdown`}
                                                            style={{
                                                                left,
                                                                top
                                                            }}
                                                            full
                                                        >
                                                            <Dropdown.Menu>
                                                                <Dropdown.Item
                                                                    key="view-user-roles"
                                                                    aria-label="View User Roles"
                                                                    icon={
                                                                        <MdSwitchAccount />
                                                                    }
                                                                    onClick={() => {
                                                                        onClose();
                                                                        history.push(
                                                                            getUrlWithPopUpQueryString(
                                                                                `/settings/users/${rowData.id}/roles`
                                                                            )
                                                                        );
                                                                    }}
                                                                >
                                                                    View User
                                                                    Roles
                                                                </Dropdown.Item>
                                                                <Dropdown.Item
                                                                    key="assign-user-to-org-units"
                                                                    aria-label="Assign User to Org Unit"
                                                                    icon={
                                                                        <MdAccountTree />
                                                                    }
                                                                    onClick={() => {
                                                                        onClose();
                                                                        assignUserOrgUnitFormRef?.current?.open(
                                                                            rowData.id,
                                                                            () =>
                                                                                setDataReloadToken(
                                                                                    `${Math.random()}`
                                                                                )
                                                                        );
                                                                    }}
                                                                >
                                                                    Assign User
                                                                    to Org Unit
                                                                </Dropdown.Item>
                                                                <Dropdown.Item
                                                                    key="add-to-access-group"
                                                                    aria-label="Add to access group"
                                                                    icon={
                                                                        <BsBoxArrowInRight />
                                                                    }
                                                                    onClick={() => {
                                                                        onClose();
                                                                        accessGroupAddUserPopUpRef?.current?.open(
                                                                            rowData.id
                                                                        );
                                                                    }}
                                                                >
                                                                    Add to
                                                                    access group
                                                                </Dropdown.Item>
                                                                <Dropdown.Item
                                                                    key="edit-user"
                                                                    aria-label="Edit User"
                                                                    icon={
                                                                        <MdBorderColor />
                                                                    }
                                                                    onClick={() => {
                                                                        onClose();
                                                                        userFormRef?.current?.open(
                                                                            rowData.id,
                                                                            () =>
                                                                                setDataReloadToken(
                                                                                    `${Math.random()}`
                                                                                )
                                                                        );
                                                                    }}
                                                                >
                                                                    Edit User
                                                                </Dropdown.Item>
                                                            </Dropdown.Menu>
                                                        </Popover>
                                                    );
                                                }}
                                            >
                                                <IconButton
                                                    appearance="ghost"
                                                    icon={
                                                        <MdOutlineArrowDropDown />
                                                    }
                                                />
                                            </Whisper>
                                        </ButtonGroup>
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
                            layout={[
                                "total",
                                "-",
                                "limit",
                                "|",
                                "pager",
                                "skip"
                            ]}
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
        </div>
    );
};

export default withRouter(UsersPage);
