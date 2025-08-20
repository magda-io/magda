import React, {
    ForwardRefRenderFunction,
    useState,
    forwardRef,
    useImperativeHandle,
    useRef,
    FunctionComponent
} from "react";
import Modal from "rsuite/Modal";
import Panel from "rsuite/Panel";
import Button from "rsuite/Button";
import Tag from "rsuite/Tag";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Input from "rsuite/Input";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { CreateRolePermissionInputData } from "@magda/typescript-common/dist/authorization-api/model";
import reportError from "../../helpers/reportError";
import { MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";
import { Letta } from "@letta-ai/letta-client";
import { getAgentServiceApiClient } from "api-clients/AgentServiceApiClient";
import "./InterviewAgentMemoryBlocksPopUp.scss";

interface PermissionDataType extends Partial<CreateRolePermissionInputData> {
    // will fill this single field with values from all 3 contraint fields
    // this field is mainly used by checkbox UI
    // at this moment, we only allow permission to have one type of constraint
    // but checkbox group requires array data type. Thus, string[]
    constraints: string[];
}

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    agentId?: string;
    datasetId: string;
};

type SubmitCompleteHandlerType = (submittedPermissionId: string) => void;

export type RefType = {
    open: (onComplete?: SubmitCompleteHandlerType) => Promise<void>;
    close: () => void;
};

type MemoryBlockItemPropsType = {
    datasetId: string;
    block: Letta.Block;
    defaultExpanded?: boolean;
};

const MemoryBlockItem: FunctionComponent<MemoryBlockItemPropsType> = (
    props
) => {
    const { datasetId, block, defaultExpanded } = props;
    const { id: blockId } = block;
    const [isOpen, setIsOpen] = useState<boolean>(
        typeof defaultExpanded === "boolean" ? defaultExpanded : false
    );

    const updateBlock = useAsyncCallback(
        async (datasetId: string, blockId: string, content: string) => {
            try {
            } catch (e) {
                reportError(`Failed to update memory block: ${e}`);
            }
        }
    );

    return (
        <Panel
            id={blockId}
            onSelect={() => setIsOpen((v) => !v)}
            expanded={isOpen}
            header={
                <div>
                    {isOpen ? (
                        <MdKeyboardArrowUp className="expand-indicator-icon" />
                    ) : (
                        <MdKeyboardArrowDown className="expand-indicator-icon" />
                    )}
                    <span className="panel-heading-text">
                        {block?.label ? block.label : "loading..."}
                    </span>
                </div>
            }
            className="dataset-knowledge-interview-agent-memory-block-item-container"
        >
            <Input
                className="memory-block-value"
                as="textarea"
                rows={5}
                onKeyDown={async (e) => {
                    if (e.key === "Enter" && e.shiftKey) {
                        e.preventDefault();
                        return;
                    }
                }}
                value={block?.value || ""}
            />
            <div className="memory-block-actions">
                {block?.metadata?.shared !== false ? null : (
                    <Tag color="green">Sharable Memory Block</Tag>
                )}
                <Button
                    className="update-memory-block-button"
                    appearance="primary"
                >
                    Update
                </Button>
            </div>
        </Panel>
    );
};

const InterviewAgentMemoryBlocksPopUp: ForwardRefRenderFunction<
    RefType,
    PropsType
> = (props, ref) => {
    const { agentId, datasetId } = props;
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [permission, setPermission] = useState<PermissionDataType>();
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();
    const [dataReloadToken, setdataReloadToken] = useState<string>("");

    useImperativeHandle(ref, () => ({
        open: async (onComplete?: SubmitCompleteHandlerType) => {
            const client = getAgentServiceApiClient();
            const hasDatasetInterviewAgent = await client.existDatasetInterviewAgent(
                datasetId
            );
            if (!hasDatasetInterviewAgent) {
                reportError(
                    "Cannot locate the interview agent. Please start the interview and try again."
                );
                return;
            }
            onCompleteRef.current = onComplete;
            setdataReloadToken(`${Math.random()}`);
            setIsOpen(true);
        },
        close: () => {
            setIsOpen(false);
        }
    }));

    const { result, loading, error } = useAsync(
        async (
            agentId: string | undefined,
            isOpen: boolean,
            dataReloadToken?: string
        ) => {
            if (!isOpen) {
                return [] as Letta.Block[];
            }
            const client = getAgentServiceApiClient();
            const hasDatasetInterviewAgent = await client.existDatasetInterviewAgent(
                datasetId
            );
            if (!hasDatasetInterviewAgent) {
                reportError(
                    "Cannot locate the interview agent. Please start the interview and try again."
                );
                setIsOpen(false);
                return [] as Letta.Block[];
            }
            return await client.getDatasetInterviewAgentMemoryBlocks(datasetId);
        },
        [agentId, isOpen, dataReloadToken]
    );

    const submitData = useAsyncCallback(
        async (datasetId: string, blockId: string, content: string) => {
            try {
            } catch (e) {
                reportError(`Failed to update memory block: ${e}`);
            }
        }
    );

    const blocks = result || ([] as Letta.Block[]);
    return (
        <Modal
            className="knowledge-interview-agent-memory-blocks-popup"
            open={isOpen}
            size="lg"
            overflow={true}
            onClose={() => setIsOpen(false)}
        >
            <Modal.Header>
                <Modal.Title>Agent Memory Blocks</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {loading ? (
                    <Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Paragraph>
                ) : error ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve agent memory blocks: {`${error}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`${"updating memory block..."} Permission for Role...`}
                                vertical
                            />
                        ) : null}
                        <div className="memory-blocks-list">
                            {blocks.map((block) => (
                                <MemoryBlockItem
                                    key={block.id}
                                    datasetId={datasetId}
                                    block={block}
                                />
                            ))}
                        </div>
                    </>
                )}
            </Modal.Body>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(InterviewAgentMemoryBlocksPopUp);
