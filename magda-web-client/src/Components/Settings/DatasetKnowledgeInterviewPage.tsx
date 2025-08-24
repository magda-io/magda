import React, { FunctionComponent, useRef } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { useAsync } from "react-async-hook";
import { MdMemory } from "react-icons/md";
import { StateType } from "reducers/reducer";
import { getRecordAspect } from "../../api-clients/RegistryApis";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import Button from "rsuite/Button";
import Toggle from "rsuite/Toggle";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Panel from "rsuite/Panel";
import DatasetKnowledgeInterview, {
    RefType as DatasetKnowledgeInterviewRefType
} from "./DatasetKnowledgeInterview";
import InterviewAgentMemoryBlocksPopUp, {
    RefType as InterviewAgentMemoryBlocksPopUpRefType
} from "./InterviewAgentMemoryBlocksPopUp";
import "./DatasetKnowledgeInterviewPage.scss";
import reportError from "helpers/reportError";

const DatasetKnowledgeInterviewPage: FunctionComponent = () => {
    const { datasetId } = useParams<{ datasetId: string }>();
    const userId = useSelector<StateType, string>(
        (state) => state?.userManagement?.user?.id
    );
    const userIdLoading = useSelector<StateType, boolean>(
        (state) => state?.userManagement?.isFetchingWhoAmI
    );
    const agentMemoryBlockPopUpRef = useRef<
        InterviewAgentMemoryBlocksPopUpRefType
    >(null);
    const datasetKnowledgeInterviewRef = useRef<
        DatasetKnowledgeInterviewRefType
    >(null);

    const { result: datasetTitle } = useAsync(
        async (datasetId: string) => {
            try {
                if (!datasetId) {
                    return "";
                }
                const data = await getRecordAspect(
                    datasetId,
                    "dcat-dataset-strings"
                );
                return data?.title ? data.title : "";
            } catch (e) {
                reportError(
                    `Failed to load dataset information with id ${datasetId}: ${e}`
                );
            }
        },
        [datasetId]
    );

    return (
        <div className="flex-main-container setting-page-main-container">
            <SideNavigation />
            <div className="main-content-container dataset-knowledge-interview-page">
                <Breadcrumb
                    leadingItem={{ title: "Dataset Knowledge Interview" }}
                    items={datasetTitle ? [{ title: datasetTitle }] : []}
                />
                {userIdLoading ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : !userId ? (
                    <Message showIcon type="error" header="Error">
                        You need to login in order to access this section.
                    </Message>
                ) : (
                    <div>
                        <Panel className="top-tool-area" bordered>
                            <Button
                                className="view-memory-blocks-button"
                                appearance="primary"
                                onClick={() => {
                                    agentMemoryBlockPopUpRef?.current?.open();
                                }}
                            >
                                <MdMemory /> View Agent Memory Blocks
                            </Button>
                            <Button
                                className="reset-interview-button"
                                appearance="primary"
                                color="red"
                                onClick={() => {
                                    datasetKnowledgeInterviewRef?.current?.reset();
                                }}
                            >
                                Reset Interview
                            </Button>
                            <div className="share-agent-toggle">
                                <label>Share Dataset Knowledge? </label>
                                <Toggle
                                    checkedChildren="Enabled"
                                    unCheckedChildren="Disabled"
                                    size="lg"
                                />
                            </div>
                        </Panel>
                        <InterviewAgentMemoryBlocksPopUp
                            datasetId={datasetId}
                            ref={agentMemoryBlockPopUpRef}
                        />
                        <DatasetKnowledgeInterview
                            ref={datasetKnowledgeInterviewRef}
                            datasetId={datasetId}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default DatasetKnowledgeInterviewPage;
