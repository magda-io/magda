import React, { FunctionComponent, useState } from "react";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Pagination from "rsuite/Pagination";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import { Input, InputGroup } from "rsuite";
import { MdSearch } from "react-icons/md";
import UserNameLabel from "../UserNameLabel";
import {
    queryRoles,
    QueryRolesParams,
    queryRolesCount,
    RoleRecord
} from "../../api-clients/AuthApis";
import "./RolesDataGrid.scss";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    queryParams?: QueryRolesParams;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const RolesDataGrid: FunctionComponent<PropsType> = (props) => {
    const { queryParams } = props;
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(1);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (
            keyword: string,
            offset: number,
            limit: number,
            user_id?: string
        ) => {
            try {
                const roles = await queryRoles({
                    keyword: keyword.trim() ? keyword : undefined,
                    offset,
                    limit,
                    user_id
                });
                const count = await queryRolesCount({
                    keyword: keyword.trim() ? keyword : undefined,
                    user_id
                });
                return [roles, count] as [RoleRecord[], number];
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
                throw e;
            }
        },
        [keyword, offset, limit, queryParams?.user_id]
    );

    const [roles, totalCount] = result ? result : [[], 0];

    return (
        <div className="roles-data-grid">
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

                    <Column width={150} resizable>
                        <HeaderCell>Description</HeaderCell>
                        <Cell dataKey="description" />
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
                        <HeaderCell>Action</HeaderCell>
                        <Cell>
                            {(rowData) => {
                                function handleAction() {
                                    alert(`id:${(rowData as any).id}`);
                                }
                                return (
                                    <span>
                                        <a onClick={handleAction}> Edit </a> |{" "}
                                        <a onClick={handleAction}> Remove </a>
                                    </span>
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
