import React, { FunctionComponent, useState } from "react";
import "./main.scss";
import "./UsersPage.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import { useAsync } from "react-async-hook";
import { queryUsers } from "../../api-clients/AuthApis";
import Table from "rsuite/Table";
import Pagination from "rsuite/Pagination";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import { Input, InputGroup } from "rsuite";
import { MdSearch } from "react-icons/md";

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

const UsersPage: FunctionComponent = () => {
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(0);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = page * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    const { result: users, loading: isLoading } = useAsync(
        async (keyword: string, offset: number, limit: number) => {
            try {
                return await queryUsers({
                    keyword: keyword.trim() ? keyword : undefined,
                    offset,
                    limit
                });
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
        [keyword, offset, limit]
    );

    return (
        <div className="flex-main-container setting-page-main-container users-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[{ to: "/settings/users", title: "Users" }]}
                />
                <div className="search-button-container">
                    <div className="search-button-inner-wrapper">
                        <InputGroup size="md" inside>
                            <Input
                                placeholder="Enter keyword to search..."
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
                        data={(users?.length ? users : []) as any}
                        loading={isLoading}
                    >
                        <Column width={50} align="center" fixed>
                            <HeaderCell>Id</HeaderCell>
                            <Cell dataKey="id" />
                        </Column>

                        <Column width={100} flexGrow={1}>
                            <HeaderCell>Display Name</HeaderCell>
                            <Cell dataKey="displayName" />
                        </Column>

                        <Column width={100}>
                            <HeaderCell>Email</HeaderCell>
                            <Cell dataKey="email" />
                        </Column>

                        <Column width={200}>
                            <HeaderCell>Photo URL</HeaderCell>
                            <Cell dataKey="photoURL" />
                        </Column>
                        <Column width={200}>
                            <HeaderCell>Source</HeaderCell>
                            <Cell dataKey="source" />
                        </Column>
                        <Column width={100}>
                            <HeaderCell>Source ID</HeaderCell>
                            <Cell dataKey="sourceId" />
                        </Column>
                        <Column width={100}>
                            <HeaderCell>Orgnasitional Unit ID</HeaderCell>
                            <Cell dataKey="sourceId" />
                        </Column>
                    </Table>
                    <div style={{ padding: 20 }}>
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
                            total={users?.length ? users.length : 0}
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

export default UsersPage;
