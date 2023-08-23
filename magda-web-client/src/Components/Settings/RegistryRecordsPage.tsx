import React, { FunctionComponent, useRef, useState } from "react";
import { withRouter, match } from "react-router-dom";
import redirect from "../../helpers/redirect";
import "./main.scss";
import "./RegistryRecordsPage.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import { useAsync } from "react-async-hook";
import { fetchRecordById } from "../../api-clients/RegistryApis";
import Loader from "rsuite/Loader";
import Placeholder from "rsuite/Placeholder";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import Form from "rsuite/Form";
import Button from "rsuite/Button";
import ButtonToolbar from "rsuite/ButtonToolbar";
import Panel from "rsuite/Panel";
import { Location, History } from "history";
import RecordFormPopUp, {
    RefType as RecordFormPopUpRefType
} from "./RecordFormPopUp";
import RegistryRecordInfoPanel from "./RegistryRecordInfoPanel";
import RegistryRecordAspectsPanel from "./RegistryRecordAspectsPanel";

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    location: Location;
    history: History;
    match: match<{
        recordId?: string;
    }>;
};

const RegistryRecordsPage: FunctionComponent<PropsType> = (props) => {
    // the recordId is encoded in url and were retrieved via `props.match.params.recordId` as it is,
    // so we need to decode it
    const recordId = props?.match?.params?.recordId
        ? decodeURIComponent(props.match.params.recordId)
        : undefined;
    const [inputRecordId, setInputRecordId] = useState<string>("");
    const recordFormRef = useRef<RecordFormPopUpRefType>(null);

    //change this value to force the record data to be reloaded
    const [recordReloadToken, setRecordReloadToken] = useState<string>("");

    const { result: record, loading: recordLoading } = useAsync(
        async (recordId, recordReloadToken) => {
            // we don't directly use recordReloadToken for fetch record logic
            // But adding it to params list will give us a trigger that can be used
            // to refresh data even when record id is not changed (e.g. after update)
            try {
                if (!recordId) {
                    return undefined;
                }
                return await fetchRecordById(recordId, true);
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to load record data: ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                throw e;
            }
        },
        [recordId, recordReloadToken]
    );

    const createRecordHandler = () => {
        recordFormRef.current?.open(undefined, (submittedRecordId) => {
            if (recordId === inputRecordId) {
                setRecordReloadToken(`${Math.random()}`);
            } else {
                redirect(
                    props.history as History,
                    "/settings/records/" + encodeURIComponent(submittedRecordId)
                );
            }
        });
    };

    const openRecordHandler = () => {
        if (typeof inputRecordId !== "string" || !inputRecordId.trim()) {
            toaster.push(
                <Notification
                    type={"error"}
                    closable={true}
                    header="Error"
                >{`Please input record ID to open the record.`}</Notification>,
                {
                    placement: "topEnd"
                }
            );
            return;
        }
        if (recordId === inputRecordId) {
            setRecordReloadToken(`${Math.random()}`);
        } else {
            redirect(
                props.history as History,
                "/settings/records/" + encodeURIComponent(inputRecordId)
            );
        }
    };

    return (
        <div className="flex-main-container setting-page-main-container registry-records-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[
                        { to: "/settings/records", title: "Registry Records" },
                        ...(recordId
                            ? [
                                  {
                                      title: record?.name
                                          ? record.name
                                          : recordId
                                  }
                              ]
                            : [])
                    ]}
                />
                <RecordFormPopUp ref={recordFormRef} />
                {recordLoading ? (
                    <>
                        <Loader center content="loading" />
                        <Paragraph rows={16}></Paragraph>
                    </>
                ) : record?.id ? (
                    <>
                        <RegistryRecordInfoPanel record={record} />
                        <RegistryRecordAspectsPanel recordId={record.id} />
                    </>
                ) : (
                    <Panel className="open-record-panel" bordered>
                        <Form fluid>
                            <Form.Group controlId="record-id">
                                <Form.ControlLabel>
                                    Record ID:
                                </Form.ControlLabel>
                                <Form.Control
                                    name="recordId"
                                    placeholder="To open a record, please input the record ID..."
                                    value={inputRecordId}
                                    onChange={setInputRecordId}
                                    onKeyDown={(event) => {
                                        if (event.keyCode === 13) {
                                            openRecordHandler();
                                        }
                                    }}
                                />
                            </Form.Group>
                            <Form.Group>
                                <ButtonToolbar>
                                    <Button
                                        appearance="primary"
                                        onClick={openRecordHandler}
                                    >
                                        Open Record
                                    </Button>
                                    <Button
                                        appearance="primary"
                                        onClick={createRecordHandler}
                                    >
                                        Create Record
                                    </Button>
                                </ButtonToolbar>
                            </Form.Group>
                        </Form>
                    </Panel>
                )}
            </div>
        </div>
    );
};

export default withRouter(RegistryRecordsPage);
