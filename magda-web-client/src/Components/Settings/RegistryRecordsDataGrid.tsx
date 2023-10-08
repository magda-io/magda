import React, { FunctionComponent, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import TagGroup from "rsuite/TagGroup";
import Tag from "rsuite/Tag";
import ButtonGroup from "rsuite/ButtonGroup";
import IconButton from "rsuite/IconButton";
import uniq from "lodash/uniq";
import { MdDeleteForever } from "react-icons/md";
import { BsBoxArrowUpRight } from "react-icons/bs";
import {
    fetchRecordsSummary,
    deleteRecord
} from "../../api-clients/RegistryApis";
import "./RegistryRecordsDataGrid.scss";
import reportError from "../../helpers/reportError";
import ConfirmDialog from "./ConfirmDialog";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    query: string;
    externalRefreshToken?: string;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const RegistryRecordsDataGrid: FunctionComponent<PropsType> = ({
    query,
    externalRefreshToken
}: PropsType) => {
    const queryStr = typeof query === "string" ? query.trim() : "";
    const [pageTokenList, setPageTokenList] = useState<string[]>([]);
    const [pageToken, setPageToken] = useState<string>("");

    //change this value to force the resource data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (
            queryStr: string,
            pageToken: string,
            dataReloadToken?: string,
            externalRefreshToken?: string
        ) => {
            try {
                const recordPage = await fetchRecordsSummary(
                    queryStr,
                    pageToken,
                    DEFAULT_MAX_PAGE_RECORD_NUMBER,
                    false,
                    true
                );
                return recordPage;
            } catch (e) {
                reportError(`Failed to search records: ${e}`, {
                    header: "Error:"
                });
                return undefined;
            }
        },
        [queryStr, pageToken, dataReloadToken, externalRefreshToken]
    );

    const deleteRecordHandler = (recordId: string, recordName: string) => {
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of the record "${recordName}" (ID: ${recordId})?`,
            confirmHandler: async () => {
                try {
                    if (!recordId) {
                        throw new Error("Invalid empty record id!");
                    }
                    await deleteRecord(recordId);
                    setDataReloadToken(`${Math.random()}`);
                } catch (e) {
                    reportError(`Failed to delete the record: ${e}`);
                }
            }
        });
    };

    return (
        <div className="registry-records-data-grid-container">
            <Table
                autoHeight={true}
                data={(result?.records?.length ? result.records : []) as any}
                loading={isLoading}
                minHeight={200}
            >
                <Column width={250} align="center" resizable>
                    <HeaderCell>Record Id</HeaderCell>
                    <Cell dataKey="id" />
                </Column>

                <Column flexGrow={1}>
                    <HeaderCell> Name</HeaderCell>
                    <Cell dataKey="name" />
                </Column>

                <Column flexGrow={1}>
                    <HeaderCell>Aspects</HeaderCell>
                    <Cell>
                        {(rowData: any) => {
                            return (
                                <TagGroup>
                                    {rowData?.aspects?.map((aspect, idx) => (
                                        <Tag key={idx}>{aspect}</Tag>
                                    ))}
                                </TagGroup>
                            );
                        }}
                    </Cell>
                </Column>
                <Column width={90} resizable fixed="right">
                    <HeaderCell>Actions</HeaderCell>
                    <Cell verticalAlign="middle" style={{ padding: "0px" }}>
                        {(rowData: any) => {
                            return (
                                <div>
                                    <Link
                                        to={`/settings/records/${encodeURIComponent(
                                            (rowData as any)?.id
                                        )}`}
                                    >
                                        <IconButton
                                            size="md"
                                            title="Open the record"
                                            aria-label="Open the record"
                                            icon={<BsBoxArrowUpRight />}
                                        />
                                    </Link>{" "}
                                    <IconButton
                                        size="md"
                                        title="Delete the record"
                                        aria-label="Delete the record"
                                        icon={<MdDeleteForever />}
                                        onClick={() =>
                                            deleteRecordHandler(
                                                rowData?.id,
                                                rowData?.name
                                            )
                                        }
                                    />
                                </div>
                            );
                        }}
                    </Cell>
                </Column>
            </Table>
            <div className="paging-area">
                <ButtonGroup>
                    <Button
                        appearance="ghost"
                        disabled={!pageToken}
                        onClick={() => {
                            setPageToken("");
                            setPageTokenList([""]);
                        }}
                    >
                        First Page
                    </Button>
                    <Button
                        appearance="ghost"
                        disabled={!pageToken}
                        onClick={() => {
                            const newPageTokenList = [...pageTokenList];
                            const prevPageToken = newPageTokenList.pop();
                            setPageToken(prevPageToken ? prevPageToken : "");
                            setPageTokenList(newPageTokenList);
                        }}
                    >
                        Prev Page
                    </Button>
                    <Button
                        appearance="ghost"
                        disabled={!result?.nextPageToken || !result?.hasMore}
                        onClick={() => {
                            if (!result?.nextPageToken) {
                                reportError(
                                    "Failed to fetch next page: Next token is empty"
                                );
                                return;
                            }
                            const nextPageToken = result?.nextPageToken as string;
                            setPageToken(nextPageToken);
                            const newPageTokenList = uniq([
                                ...pageTokenList,
                                pageToken ? pageToken : ""
                            ]);
                            setPageTokenList(newPageTokenList);
                        }}
                    >
                        Next Page
                    </Button>
                </ButtonGroup>
            </div>
        </div>
    );
};

export default RegistryRecordsDataGrid;
