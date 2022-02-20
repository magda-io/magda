import React, { FunctionComponent } from "react";
import { useAsync } from "react-async-hook";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import Panel from "rsuite/Panel";
import Loader from "rsuite/Loader";
import Placeholder from "rsuite/Placeholder";
import { getRecordAspect } from "../../api-clients/RegistryApis";
import "./RegistryRecordAspectItem.scss";

import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import highlighterSyntaxJson from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import highlighterStyle from "react-syntax-highlighter/dist/esm/styles/hljs/atom-one-light";

SyntaxHighlighter.registerLanguage("json", highlighterSyntaxJson);

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
        <Panel
            header={aspectId}
            defaultExpanded={defaultExpanded}
            className="registry-record-aspect-item-container"
        >
            {isLoading ? (
                <Paragraph rows={5}>
                    <Loader center content="loading" />
                </Paragraph>
            ) : (
                <SyntaxHighlighter
                    language="json"
                    style={highlighterStyle}
                    wrapLongLines={true}
                >
                    {JSON.stringify(aspectData, undefined, 2)}
                </SyntaxHighlighter>
            )}
        </Panel>
    );
};

export default RegistryRecordAspectItem;
