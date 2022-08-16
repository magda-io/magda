import React, { FunctionComponent, useRef, useState } from "react";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Pagination from "rsuite/Pagination";
import Button from "rsuite/Button";
import Input from "rsuite/Input";
import InputGroup from "rsuite/InputGroup";
import IconButton from "rsuite/IconButton";
import {
    MdSearch,
    MdBorderColor,
    MdDeleteForever,
    MdAddCircle
} from "react-icons/md";
import {
    queryResOperations,
    queryResOperationsCount,
    deleteOperation
} from "../../api-clients/AuthApis";
import "./OperationsDataGrid.scss";
import reportError from "../../helpers/reportError";
import OperationFormPopUp, {
    RefType as OperationFormPopUpRefType
} from "./OperationFormPopUp";
import ConfirmDialog from "./ConfirmDialog";
import { OperationRecord } from "@magda/typescript-common/dist/authorization-api/model";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    resourceId: string;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const OperationsDataGrid: FunctionComponent<PropsType> = (props) => {
    const { resourceId } = props;

    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(1);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    const operationFormRef = useRef<OperationFormPopUpRefType>(null);

    //change this value to force the role data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (
            keyword: string,
            offset: number,
            limit: number,
            resourceId: string,
            dataReloadToken: string
        ) => {
            try {
                const data = await queryResOperations(resourceId, {
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true,
                    offset,
                    limit
                });
                const count = await queryResOperationsCount(resourceId, {
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true
                });
                return [data, count] as [OperationRecord[], number];
            } catch (ex) {
                reportError(`Failed to load operation record data: ${ex}`, {
                    header: "Error:"
                });
                return [];
            }
        },
        [keyword, offset, limit, resourceId, dataReloadToken]
    );

    const [data, totalCount] = result ? result : [[], 0];

    const deleteOperationHandler = (
        operationId: string,
        operationUri: string
    ) => {
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of operation "${operationUri}"?`,
            confirmHandler: async () => {
                try {
                    if (!operationId) {
                        throw new Error("Invalid empty operation id!");
                    }
                    await deleteOperation(operationId);
                    setDataReloadToken(`${Math.random()}`);
                } catch (ex) {
                    reportError(`Failed to delete the operation: ${ex}`);
                }
            }
        });
    };

    return (
        <div className="operations-data-grid">
            <OperationFormPopUp ref={operationFormRef} />
            <div className="search-button-container">
                <div className="left-button-area-container">
                    <Button
                        color="blue"
                        appearance="primary"
                        onClick={() => {
                            operationFormRef?.current?.open(
                                undefined,
                                resourceId,
                                () => setDataReloadToken(`${Math.random()}`)
                            );
                        }}
                    >
                        <MdAddCircle /> Create Operation
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
                    <Column width={100} resizable>
                        <HeaderCell> id</HeaderCell>
                        <Cell dataKey="id" />
                    </Column>
                    <Column width={250} resizable>
                        <HeaderCell> URI</HeaderCell>
                        <Cell dataKey="uri" />
                    </Column>

                    <Column width={200} flexGrow={1}>
                        <HeaderCell> Name</HeaderCell>
                        <Cell dataKey="name" />
                    </Column>

                    <Column width={250} resizable>
                        <HeaderCell>Description</HeaderCell>
                        <Cell dataKey="description" />
                    </Column>
                    <Column width={100} fixed="right">
                        <HeaderCell>Action</HeaderCell>
                        <Cell verticalAlign="middle" style={{ padding: "0px" }}>
                            {(rowData) => {
                                return (
                                    <div>
                                        <IconButton
                                            size="md"
                                            title="Edit Operation"
                                            aria-label="Edit Operation"
                                            icon={<MdBorderColor />}
                                            onClick={() =>
                                                operationFormRef?.current?.open(
                                                    (rowData as any).id,
                                                    undefined,
                                                    () =>
                                                        setDataReloadToken(
                                                            `${Math.random()}`
                                                        )
                                                )
                                            }
                                        />{" "}
                                        <IconButton
                                            size="md"
                                            title="Delete Operation"
                                            aria-label="Delete Operation"
                                            icon={<MdDeleteForever />}
                                            onClick={() => {
                                                deleteOperationHandler(
                                                    (rowData as any)?.id,
                                                    (rowData as any)?.uri
                                                );
                                            }}
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

export default OperationsDataGrid;
