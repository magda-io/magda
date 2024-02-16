import React, { useState, useRef, useCallback, FunctionComponent } from "react";
import { useSelector } from "react-redux";
import Panel from "rsuite/Panel";
import { useAsync } from "react-async-hook";
import "./MyApiKeys.scss";
import {
    getUserApiKeys,
    APIKeyRecord,
    getUserApiKeyById,
    updateUserApiKey,
    deleteUserApiKey
} from "api-clients/AuthApis";
import { StateType } from "reducers/reducer";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import Pagination from "rsuite/Pagination";
import Table from "rsuite/Table";
import { RowDataType } from "rsuite/Table";
import AsyncToggle from "../AsyncToggle";
import IconButton from "rsuite/IconButton";
import { BsFillTrashFill, BsFillKeyFill } from "react-icons/bs";
import DateDisplayWithTooltip from "../DateDisplayWithTooltip";
import Button from "rsuite/Button";
import CreateUserApiKeyPopUp, {
    RefType as CreateUserApiKeyPopUpRefType
} from "./CreateUserApiKeyPopUp";
import ConfirmDialog from "../Settings/ConfirmDialog";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 5;

const MyApiKeys: FunctionComponent<PropsType> = (props) => {
    //change this value to force the data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");
    const [page, setPage] = useState<number>(1);
    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const createApiKeyFormRef = useRef<CreateUserApiKeyPopUpRefType>(null);

    const userId = useSelector<StateType, string>(
        (state) => state?.userManagement?.user?.id
    );

    const refreshData = useCallback(
        () => setDataReloadToken("" + Math.random()),
        []
    );

    const { result, loading } = useAsync<APIKeyRecord[]>(
        async (userId, dataReloadToken) => {
            try {
                if (!userId) {
                    return [];
                } else {
                    return await getUserApiKeys(userId);
                }
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to fetch user's API key: ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                throw e;
            }
        },
        [userId, dataReloadToken]
    );

    const totalRecords = result?.length ? result : [];
    const totalNumber = totalRecords.length;
    const maxPageNum = Math.ceil(totalNumber / limit);
    const pageRecords = totalRecords.slice(offset, offset + limit);

    return (
        <Panel bordered className="my-api-keys-container">
            <>
                <Button
                    appearance="primary"
                    onClick={() =>
                        createApiKeyFormRef.current?.open(userId, refreshData)
                    }
                >
                    <BsFillKeyFill /> Create New API Key
                </Button>
                <CreateUserApiKeyPopUp ref={createApiKeyFormRef} />
                <Table
                    data={pageRecords as RowDataType[]}
                    autoHeight={true}
                    loading={loading}
                >
                    <Column width={350} align="center" resizable>
                        <HeaderCell>API Key ID</HeaderCell>
                        <Cell dataKey="id" />
                    </Column>
                    <Column flexGrow={1} align="center">
                        <HeaderCell>Create Time</HeaderCell>
                        <Cell align="center">
                            {(rowData: APIKeyRecord) => (
                                <DateDisplayWithTooltip
                                    dateValue={rowData.created_timestamp}
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column width={120} align="center">
                        <HeaderCell> Enabled?</HeaderCell>
                        <Cell align="center">
                            {(rowData: APIKeyRecord) => (
                                <AsyncToggle
                                    fetchInitialCheckedStatus={async () => {
                                        const key = await getUserApiKeyById(
                                            userId,
                                            rowData.id
                                        );
                                        return key.enabled;
                                    }}
                                    onChange={async (checked) => {
                                        const key = await updateUserApiKey(
                                            userId,
                                            rowData.id,
                                            {
                                                enabled: checked
                                            }
                                        );
                                        return key.enabled;
                                    }}
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column flexGrow={1} align="center">
                        <HeaderCell>Expiry Time</HeaderCell>
                        <Cell align="center">
                            {(rowData: APIKeyRecord) => (
                                <DateDisplayWithTooltip
                                    dateValue={rowData.expiry_time}
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column flexGrow={1} align="center">
                        <HeaderCell>Last Successful Attempt</HeaderCell>
                        <Cell align="center">
                            {(rowData: APIKeyRecord) => (
                                <DateDisplayWithTooltip
                                    dateValue={
                                        rowData.last_successful_attempt_time
                                    }
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column flexGrow={1} align="center">
                        <HeaderCell>Last Failed Attempt</HeaderCell>
                        <Cell align="center">
                            {(rowData: APIKeyRecord) => (
                                <DateDisplayWithTooltip
                                    dateValue={rowData.last_failed_attempt_time}
                                />
                            )}
                        </Cell>
                    </Column>
                    <Column width={120} align="center">
                        <HeaderCell align="center"> Actions</HeaderCell>
                        <Cell align="center">
                            {(rowData: APIKeyRecord) => (
                                <IconButton
                                    className="delete-button"
                                    icon={<BsFillTrashFill />}
                                    onClick={() => {
                                        ConfirmDialog.open({
                                            confirmMsg:
                                                "Please confirm the deletion of the API Key: " +
                                                rowData.id,
                                            loadingText:
                                                "Deleting, please wait...",
                                            confirmHandler: async () => {
                                                await deleteUserApiKey(
                                                    userId,
                                                    rowData.id
                                                );
                                                refreshData();
                                            }
                                        });
                                    }}
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
                        layout={["total", "-", "limit", "|", "pager", "skip"]}
                        total={totalNumber}
                        limitOptions={[DEFAULT_MAX_PAGE_RECORD_NUMBER, 10]}
                        limit={limit}
                        activePage={page}
                        onChangePage={(page) => {
                            setPage(page > maxPageNum ? maxPageNum : page);
                        }}
                        onChangeLimit={setLimit}
                    />
                </div>
            </>
        </Panel>
    );
};

export default MyApiKeys;
