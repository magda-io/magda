import React, { FunctionComponent, useState, useRef } from "react";
import { withRouter, Link } from "react-router-dom";
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
    MdAccountTree
} from "react-icons/md";
import AccessVerification from "./AccessVerification";
import IconButton from "rsuite/IconButton";
import OrgUnitNameLabel from "../OrgUnitNameLabel";
import reportError from "../../helpers/reportError";
import AssignUserOrgUnitFormPopUp, {
    RefType as AssignUserOrgUnitFormPopUpRefType
} from "./AssignUserOrgUnitFormPopUp";

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    location: Location;
    history: History;
};

const UsersPage: FunctionComponent<PropsType> = (props) => {
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(1);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    const assignUserOrgUnitFormRef = useRef<AssignUserOrgUnitFormPopUpRefType>(
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
                <AccessVerification operationUri="authObject/user/read" />
                <AssignUserOrgUnitFormPopUp ref={assignUserOrgUnitFormRef} />
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
                            <HeaderCell>Orgnasitional Unit</HeaderCell>
                            <Cell>
                                {(rowData: any) => (
                                    <OrgUnitNameLabel id={rowData?.orgUnitId} />
                                )}
                            </Cell>
                        </Column>
                        <Column width={120} fixed="right">
                            <HeaderCell align="center">Action</HeaderCell>
                            <Cell
                                verticalAlign="middle"
                                style={{ padding: "0px" }}
                            >
                                {(rowData) => {
                                    return (
                                        <div>
                                            <Link
                                                to={`/settings/users/${
                                                    (rowData as any)?.id
                                                }/roles`}
                                            >
                                                <IconButton
                                                    size="md"
                                                    title="View User Roles"
                                                    aria-label="View User Roles"
                                                    icon={<MdSwitchAccount />}
                                                />
                                            </Link>{" "}
                                            <IconButton
                                                size="md"
                                                title="Assign User to Org Unit"
                                                aria-label="Assign User to Org Unit"
                                                icon={<MdAccountTree />}
                                                onClick={() =>
                                                    assignUserOrgUnitFormRef?.current?.open(
                                                        (rowData as any).id,
                                                        () =>
                                                            setDataReloadToken(
                                                                `${Math.random()}`
                                                            )
                                                    )
                                                }
                                            />{" "}
                                            <IconButton
                                                size="md"
                                                title="Edit User"
                                                aria-label="Edit User"
                                                icon={<MdBorderColor />}
                                                onClick={() =>
                                                    reportError(
                                                        "This function is under development."
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
