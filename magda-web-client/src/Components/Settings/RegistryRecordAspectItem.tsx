import React, { FunctionComponent } from "react";
import { useAsync } from "react-async-hook";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import Panel from "rsuite/Panel";
import Loader from "rsuite/Loader";
import Placeholder from "rsuite/Placeholder";
import { getRecordAspect } from "../../api-clients/RegistryApis";
import "./RegistryRecordAspectItem.scss";

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    recordId: string;
    aspectId: string;
    defaultExpanded?: boolean;
};

const RegistryRecordAspectItem: FunctionComponent<PropsType> = (props) => {
    const { recordId, aspectId, defaultExpanded } = props;

    const { result: aspectData, loading: isLoading } = useAsync(
        async (recordId: string, aspectId: string) => {
            try {
                return await getRecordAspect(recordId, aspectId, true);
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to load record aspect data for aspect (${aspectId}): ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                throw e;
            }
        },
        [recordId, aspectId]
    );

    return (
        <Panel header={aspectId} defaultExpanded={defaultExpanded}>
            {isLoading ? (
                <Paragraph rows={5}>
                    <Loader center content="loading" />
                </Paragraph>
            ) : (
                <pre>{aspectData}</pre>
            )}
        </Panel>
    );
};

export default RegistryRecordAspectItem;
