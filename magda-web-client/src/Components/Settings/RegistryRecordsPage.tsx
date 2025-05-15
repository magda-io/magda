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
import toaster from "rsuite/toaster";
import ButtonToolbar from "rsuite/ButtonToolbar";
import IconButton from "rsuite/IconButton";
import Message from "rsuite/Message";
import Panel from "rsuite/Panel";
import { BsPlusCircleFill } from "react-icons/bs";
import { Location, History } from "history";
import RecordFormPopUp, {
    RefType as RecordFormPopUpRefType
} from "./RecordFormPopUp";
import RegistryRecordInfoPanel from "./RegistryRecordInfoPanel";
import RegistryRecordAspectsPanel from "./RegistryRecordAspectsPanel";
import RegistryRecordsPageSearchButton from "./RegistryRecordsPageSearchButton";
import RegistryRecordsDataGrid from "./RegistryRecordsDataGrid";
import { inPopUpMode } from "helpers/popupUtils";

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    location: Location;
    history: History;
    match: match<{
        recordId?: string;
    }>;
};

const RegistryRecordsPage: FunctionComponent<PropsType> = (props) => {
    const isPopUp = inPopUpMode();
    const [query, setQuery] = React.useState<string>("");
    const [recordListRefreshToken, setRecordListRefreshToken] = useState<
        string
    >("");

    // the recordId is encoded in url and were retrieved via `props.match.params.recordId` as it is,
    // so we need to decode it
    const recordId = props?.match?.params?.recordId
        ? decodeURIComponent(props.match.params.recordId)
        : undefined;
    const [inputRecordId, setInputRecordId] = useState<string>("");
    const recordFormRef = useRef<RecordFormPopUpRefType>(null);

    //change this value to force the record data to be reloaded
    const [recordReloadToken, setRecordReloadToken] = useState<string>("");

    const {
        result: record,
        loading: recordLoading,
        error: recordError
    } = useAsync(
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

    return (
        <div className="flex-main-container setting-page-main-container registry-records-page">
            {!isPopUp && <SideNavigation />}
            <div
                className={`main-content-container${
                    isPopUp ? " is-pop-up" : ""
                }`}
            >
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
                ) : isPopUp && recordError ? (
                    <Message showIcon type="error" header="Error">
                        {recordError + ""}
                    </Message>
                ) : (
                    <div className="record-start-area">
                        <div className="action-area">
                            <ButtonToolbar>
                                <RegistryRecordsPageSearchButton
                                    executeSearch={(query) => {
                                        setQuery(query);
                                        setRecordListRefreshToken(
                                            Math.random() + ""
                                        );
                                    }}
                                />
                                <IconButton
                                    className="rs-btn-icon-fix"
                                    appearance="primary"
                                    onClick={createRecordHandler}
                                    icon={<BsPlusCircleFill />}
                                >
                                    Create Record
                                </IconButton>
                            </ButtonToolbar>
                        </div>
                        <Panel className="record-list-area" bordered>
                            <RegistryRecordsDataGrid
                                query={query}
                                externalRefreshToken={recordListRefreshToken}
                            />
                        </Panel>
                    </div>
                )}
            </div>
        </div>
    );
};

export default withRouter(RegistryRecordsPage);
