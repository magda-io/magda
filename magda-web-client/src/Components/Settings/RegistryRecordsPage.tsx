import React, { FunctionComponent, useRef, useState } from "react";
import { withRouter, History, Location, match } from "react-router-dom";
import redirect from "../../helpers/redirect";
import "./main.scss";
import "./RegistryRecordsPage.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import AccessVerification from "./AccessVerification";
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
import RecordFormPopUp, {
    RefType as RecordFormPopUpRefType
} from "./RecordFormPopUp";

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    location?: Location;
    history?: History;
    match?: match<{
        recordId?: string;
    }>;
};

const RegistryRecordsPage: FunctionComponent<PropsType> = (props) => {
    const recordId = props?.match?.params?.recordId;
    const [inputRecordId, setInputRecordId] = useState<string>();
    const recordFormRef = useRef<RecordFormPopUpRefType>(null);
    (window as any).testHistory = props.history;
    const { result: record, loading: recordLoading } = useAsync(
        async (recordId) => {
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
        [recordId]
    );

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
                <AccessVerification operationUri="object/record/read" />
                <RecordFormPopUp ref={recordFormRef} />
                {recordLoading ? (
                    <>
                        <Loader center content="loading" />
                        <Paragraph rows={16}></Paragraph>
                    </>
                ) : record?.id ? null : (
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
                                />
                            </Form.Group>
                            <Form.Group>
                                <ButtonToolbar>
                                    <Button
                                        appearance="primary"
                                        onClick={() => {
                                            if (
                                                typeof inputRecordId !==
                                                    "string" ||
                                                !inputRecordId.trim()
                                            ) {
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
                                            redirect(
                                                props.history as History,
                                                "/settings/records/" +
                                                    encodeURIComponent(
                                                        inputRecordId
                                                    )
                                            );
                                        }}
                                    >
                                        Open Record
                                    </Button>
                                    <Button
                                        appearance="primary"
                                        onClick={() =>
                                            recordFormRef.current?.open()
                                        }
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
