import React, { FunctionComponent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Pagination from "rsuite/Pagination";
import Button from "rsuite/Button";
import Input from "rsuite/Input";
import InputGroup from "rsuite/InputGroup";
import IconButton from "rsuite/IconButton";
import {
    MdSearch,
    MdConstruction,
    MdBorderColor,
    MdDeleteForever,
    MdAddCircle
} from "react-icons/md";
import {
    queryResources,
    QueryResourcesParams,
    queryResourcesCount,
    deleteResource
} from "../../api-clients/AuthApis";
import "./ResourcesDataGrid.scss";
import reportError from "../../helpers/reportError";
import ResourceFormPopUp, {
    RefType as ResourceFormPopUpRefType
} from "./ResourceFormPopUp";
import ConfirmDialog from "./ConfirmDialog";
import { ResourceRecord } from "@magda/typescript-common/dist/authorization-api/model";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    queryParams?: QueryResourcesParams;
    directory: string;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const ResourcesDataGrid: FunctionComponent<PropsType> = ({
    queryParams,
    directory
}: PropsType) => {
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(1);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    const resourceFormRef = useRef<ResourceFormPopUpRefType>(null);

    //change this value to force the resource data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (
            keyword: string,
            offset: number,
            limit: number,
            id?: string,
            dataReloadToken?: string
        ) => {
            try {
                const data = await queryResources({
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true,
                    offset,
                    limit,
                    id
                });
                const count = await queryResourcesCount({
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true,
                    id
                });
                return [data, count] as [ResourceRecord[], number];
            } catch (e) {
                reportError(`Failed to update data: ${e}`, {
                    header: "Error:"
                });
                return [];
            }
        },
        [keyword, offset, limit, queryParams?.id, dataReloadToken]
    );

    const [data, totalCount] = result ? result : [[], 0];

    const deleteResourceHandler = (resourceId: string, resourceUri: string) => {
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of resource "${resourceUri}"?`,
            confirmHandler: async () => {
                try {
                    if (!resourceId) {
                        throw new Error("Invalid empty resource id!");
                    }
                    await deleteResource(resourceId);
                    setDataReloadToken(`${Math.random()}`);
                } catch (e) {
                    reportError(`Failed to delete the resource: ${e}`);
                }
            }
        });
    };

    return (
        <div className="resources-data-grid">
            <ResourceFormPopUp ref={resourceFormRef} />
            <div className="search-button-container">
                <div className="left-button-area-container">
                    <Button
                        color="blue"
                        appearance="primary"
                        onClick={() => {
                            resourceFormRef?.current?.open(undefined, () =>
                                setDataReloadToken(`${Math.random()}`)
                            );
                        }}
                    >
                        <MdAddCircle /> Create Resource
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

            <div>
                <Table
                    height={420}
                    autoHeight={true}
                    data={(data?.length ? data : []) as any}
                    loading={isLoading}
                >
                    <Column width={200} align="center" resizable>
                        <HeaderCell>Id</HeaderCell>
                        <Cell dataKey="id" />
                    </Column>

                    <Column width={220} resizable>
                        <HeaderCell> URI</HeaderCell>
                        <Cell dataKey="uri" />
                    </Column>

                    <Column width={200} resizable>
                        <HeaderCell> Name</HeaderCell>
                        <Cell dataKey="name" />
                    </Column>

                    <Column width={550} resizable>
                        <HeaderCell>Description</HeaderCell>
                        <Cell dataKey="description" />
                    </Column>
                    <Column width={100} resizable>
                        <HeaderCell>Edit Time</HeaderCell>
                        <Cell dataKey="edit_time" />
                    </Column>
                    <Column width={120} fixed="right">
                        <HeaderCell>Action</HeaderCell>
                        <Cell verticalAlign="middle" style={{ padding: "0px" }}>
                            {(rowData) => {
                                return (
                                    <div>
                                        <Link
                                            to={getUrlWithPopUpQueryString(
                                                `/${directory}/resources/${
                                                    (rowData as any)?.id
                                                }/operations`
                                            )}
                                        >
                                            <IconButton
                                                size="md"
                                                title="View the resource's operations"
                                                aria-label="View the resource's operations"
                                                icon={<MdConstruction />}
                                            />
                                        </Link>{" "}
                                        <IconButton
                                            size="md"
                                            title="Edit Resource"
                                            aria-label="Edit Resource"
                                            icon={<MdBorderColor />}
                                            onClick={() => {
                                                resourceFormRef?.current?.open(
                                                    (rowData as any).id,
                                                    () =>
                                                        setDataReloadToken(
                                                            `${Math.random()}`
                                                        )
                                                );
                                            }}
                                        />{" "}
                                        <IconButton
                                            size="md"
                                            title="Delete Resource"
                                            aria-label="Delete Resource"
                                            icon={<MdDeleteForever />}
                                            onClick={() =>
                                                deleteResourceHandler(
                                                    (rowData as any)?.id,
                                                    (rowData as any)?.uri
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

export default ResourcesDataGrid;
