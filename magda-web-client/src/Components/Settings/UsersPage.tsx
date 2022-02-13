import React, { FunctionComponent, useState } from "react";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import { useAsync } from "react-async-hook";
import { queryUsers } from "../../api-clients/AuthApis";
import Table from "rsuite/Table";
import Pagination from "rsuite/Pagination";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

const UsersPage: FunctionComponent = () => {
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(0);
    const [limit, setLimit] = React.useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = page * limit;
    const { result: users, loading: isLoading } = useAsync(
        async (keyword: string, offset: number, limit: number) => {
            try {
                return await queryUsers({
                    keyword,
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

    console.log(setKeyword);
    console.log(users);

    return (
        <div className="flex-main-container setting-page-main-container">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[{ to: "/settings/users", title: "Users" }]}
                />

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
