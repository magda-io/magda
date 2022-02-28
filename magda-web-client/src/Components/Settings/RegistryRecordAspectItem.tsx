import React, {
    FunctionComponent,
    useState,
    useCallback,
    RefObject,
    SyntheticEvent
} from "react";
import { useAsync } from "react-async-hook";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import Panel from "rsuite/Panel";
import Loader from "rsuite/Loader";
import Placeholder from "rsuite/Placeholder";
import { getRecordAspect } from "../../api-clients/RegistryApis";
import "./RegistryRecordAspectItem.scss";
import IconButton from "rsuite/IconButton";

import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import highlighterSyntaxJson from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import highlighterStyle from "react-syntax-highlighter/dist/esm/styles/hljs/atom-one-light";
import {
    MdBorderColor,
    MdKeyboardArrowDown,
    MdKeyboardArrowUp
} from "react-icons/md";
import { RefType as RecordAspectFormPopUpRefType } from "./RecordAspectFormPopUp";
import DeleteRecordAspectButton from "./DeleteRecordAspectButton";

SyntaxHighlighter.registerLanguage("json", highlighterSyntaxJson);

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    recordId: string;
    aspectId: string;
    defaultExpanded?: boolean;
    recordAspectFormRef: RefObject<RecordAspectFormPopUpRefType>;
    onRecordAspectDeleted: () => void;
};

const RegistryRecordAspectItem: FunctionComponent<PropsType> = (props) => {
    const { recordId, aspectId, defaultExpanded, recordAspectFormRef } = props;
    const [isOpen, setIsOpen] = useState<boolean>(
        typeof defaultExpanded === "boolean" ? defaultExpanded : false
    );

    //change this value to force the role data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const { result: aspectData, loading: isLoading } = useAsync(
        async (recordId: string, aspectId: string, dataReloadToken: string) => {
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
        [recordId, aspectId, dataReloadToken]
    );

    const editAspectHandler = useCallback(
        (e: SyntheticEvent) => {
            e.preventDefault();
            e.stopPropagation();
            recordAspectFormRef.current?.open(aspectId, () => {
                setDataReloadToken(`${Math.random()}`);
            });
        },
        [aspectId, recordAspectFormRef]
    );

    return (
        <Panel
            id={aspectId}
            onSelect={() => setIsOpen((v) => !v)}
            expanded={isOpen}
            header={
                <div>
                    {isOpen ? (
                        <MdKeyboardArrowUp className="expand-indicator-icon" />
                    ) : (
                        <MdKeyboardArrowDown className="expand-indicator-icon" />
                    )}
                    <span className="panel-heading-text">{aspectId}</span>
                    <div className="button-area">
                        <IconButton
                            size="md"
                            title="Edit Aspect"
                            aria-label="Edit Aspect"
                            icon={<MdBorderColor />}
                            onClick={editAspectHandler}
                        />{" "}
                        <DeleteRecordAspectButton
                            recordId={recordId}
                            aspectId={aspectId}
                            onDeleteComplete={props.onRecordAspectDeleted}
                        />
                    </div>
                </div>
            }
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
