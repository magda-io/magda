import React, {
    ForwardRefRenderFunction,
    forwardRef,
    useImperativeHandle,
    useRef,
    useState
} from "react";
import { Subject } from "rxjs";
import { Letta } from "@letta-ai/letta-client";
import Input from "rsuite/Input";
import ButtonToolbar from "rsuite/ButtonToolbar";
import Button from "rsuite/Button";
import Panel from "rsuite/Panel";
import { useAsyncCallback } from "react-async-hook";
import { getAgentServiceApiClient } from "../../api-clients/AgentServiceApiClient";
import {
    ChatEventMessage,
    NoErrorStop,
    createChatEventMessage,
    EVENT_TYPE_CLIENT_RESET_MESSAGE_QUEUE,
    EVENT_TYPE_CLIENT_MESSAGE_SENT,
    EVENT_TYPE_PARTIAL_MSG,
    EventPartialMessageData,
    EVENT_TYPE_CLIENT_RESET_MESSAGE_PROCESSING_STATE,
    EVENT_TYPE_TOOL_CALL_INDICATOR,
    EventToolCallIndicatorData,
    EventToolCallIndicatorResultData,
    EVENT_TYPE_TOOL_CALL_INDICATOR_RESULT
} from "../Chatbot/Messaging";
import { MdOutlinePlayCircle } from "react-icons/md";
import ChatBoxMessagePanel from "../Chatbot/ChatBoxMessagePanel";
import ConfirmDialog from "./ConfirmDialog";
import "./DatasetKnowledgeInterview.scss";
import reportError from "helpers/reportError";

export type RefType = {
    reset: (onComplete?: () => void) => Promise<void>;
};
interface PropsType {
    datasetId: string;
}

function processStreamResponseChunk(
    messageStream: Subject<ChatEventMessage<Record<string, any>>>,
    chunk: Letta.agents.LettaStreamingResponse
) {
    if (chunk.messageType === "assistant_message") {
        messageStream.next(
            createChatEventMessage<EventPartialMessageData>(
                EVENT_TYPE_PARTIAL_MSG,
                {
                    id: `${chunk.id}`,
                    reasoning: false,
                    msg: chunk.content as string
                }
            )
        );
        return;
    }
    if (chunk.messageType === "reasoning_message") {
        messageStream.next(
            createChatEventMessage<EventPartialMessageData>(
                EVENT_TYPE_PARTIAL_MSG,
                {
                    id: `${chunk.id}-reasoning`,
                    reasoning: true,
                    msg: chunk.reasoning
                }
            )
        );
        return;
    }
    if (chunk.messageType === "tool_call_message") {
        messageStream.next(
            createChatEventMessage<EventToolCallIndicatorData>(
                EVENT_TYPE_TOOL_CALL_INDICATOR,
                {
                    id: `${chunk.otid}`,
                    name: chunk.toolCall?.name,
                    argumentJson: chunk.toolCall?.arguments,
                    toolCallId: chunk.toolCall?.toolCallId
                }
            )
        );
        return;
    }
    if (chunk.messageType === "tool_return_message") {
        messageStream.next(
            createChatEventMessage<EventToolCallIndicatorResultData>(
                EVENT_TYPE_TOOL_CALL_INDICATOR_RESULT,
                {
                    id: `${chunk.otid}`,
                    name: chunk?.name,
                    toolCallId: chunk.toolCallId,
                    status: chunk.status,
                    error: chunk.stderr?.length
                        ? chunk.stderr.join("\n")
                        : undefined
                }
            )
        );
        return;
    }
    if (chunk.messageType === "stop_reason") {
        messageStream.next(
            createChatEventMessage<EventPartialMessageData>(
                EVENT_TYPE_CLIENT_RESET_MESSAGE_PROCESSING_STATE
            )
        );
        return;
    }
}

const DatasetKnowledgeInterview: ForwardRefRenderFunction<
    RefType,
    PropsType
> = (props, ref) => {
    const { datasetId } = props;
    const [chatActivated, setChatActivated] = useState<boolean>(false);
    const messageStreamRef = useRef(new Subject<ChatEventMessage>());
    const agentIdRef = useRef<string>();
    const [inputText, setInputText] = useState<string>("");

    useImperativeHandle(ref, () => ({
        reset: async (onComplete?: () => void) => {
            ConfirmDialog.open({
                confirmMsg: (
                    <div>
                        Reset interview and start from scratch? <br /> This will
                        erase all memory and conversation history.
                    </div>
                ),
                headingText: "Confirm to reset the dataset interview?",
                loadingText:
                    "Resetting dataset interview memory & conversation...",
                errorNotificationDuration: 0,
                confirmHandler: async () => {
                    const client = getAgentServiceApiClient();
                    await client.resetDatasetInterviewAgent(datasetId);
                    messageStreamRef.current.next(
                        createChatEventMessage(
                            EVENT_TYPE_CLIENT_RESET_MESSAGE_QUEUE
                        )
                    );
                    setChatActivated(false);
                }
            });
        }
    }));

    const sendMessage = useAsyncCallback(async (inputText) => {
        try {
            const agentId = agentIdRef.current;
            if (!agentId) {
                throw new Error("Agent is not initialized.");
            }
            const sendOutText = inputText.trim();
            if (!sendOutText) {
                return;
            }
            messageStreamRef.current.next(
                createChatEventMessage(EVENT_TYPE_CLIENT_MESSAGE_SENT, {
                    type: "user",
                    content: sendOutText
                })
            );
            setInputText("");
            const client = getAgentServiceApiClient();
            const stream = await client.createMessageStream(agentId, {
                messages: [
                    {
                        role: "user",
                        content: sendOutText
                    }
                ],
                streamTokens: true
            });
            for await (const chunk of stream) {
                processStreamResponseChunk(messageStreamRef.current, chunk);
            }
        } catch (e) {
            messageStreamRef.current.next(
                createChatEventMessage<EventPartialMessageData>(
                    EVENT_TYPE_CLIENT_RESET_MESSAGE_PROCESSING_STATE
                )
            );
            if (e instanceof NoErrorStop) {
                // do nothing
                // this is a special error that we throw to stop the operation without error
                return;
            }
            reportError(e);
        }
    });
    const activateChat = useAsyncCallback(async () => {
        try {
            if (chatActivated) {
                return;
            }
            const client = getAgentServiceApiClient();
            const { agentId } = await client.initializeDatasetInterviewAgent(
                datasetId
            );
            agentIdRef.current = agentId;
            setChatActivated(true);
            const stream = await client.createMessageStream(agentId, {
                messages: [
                    {
                        role: "system",
                        content: `A user just connects for the same dataset interview for answering additional questions you might have.
                                Please review existing conversation history and memory blocks (if any) to see if any additional question you need to ask.`
                    }
                ],
                streamTokens: true
            });
            for await (const chunk of stream) {
                processStreamResponseChunk(messageStreamRef.current, chunk);
            }
        } catch (e) {
            messageStreamRef.current.next(
                createChatEventMessage<EventPartialMessageData>(
                    EVENT_TYPE_CLIENT_RESET_MESSAGE_PROCESSING_STATE
                )
            );
            if (e instanceof NoErrorStop) {
                // do nothing
                // this is a special error that we throw to stop the operation without error
                return;
            }
            reportError(e);
        }
    });
    return (
        <div className="magda-dataset-knowledge-interview-container">
            <div className="message-area-container">
                {chatActivated ? (
                    <ChatBoxMessagePanel
                        appName={"sdssd"}
                        useInitialMessage={false}
                        sendMessageLoading={
                            sendMessage.loading || activateChat.loading
                        }
                        messageStream={messageStreamRef.current}
                    />
                ) : (
                    <Panel
                        className="chat-activation-button-container"
                        bordered
                    >
                        <Button
                            className="chat-activation-button"
                            appearance="primary"
                            disabled={activateChat.loading}
                            onClick={activateChat.execute}
                        >
                            <MdOutlinePlayCircle />
                            {activateChat.loading
                                ? "Starting Interview..."
                                : "Start Interview"}
                        </Button>
                    </Panel>
                )}
            </div>
            <Input
                className="message-input"
                as="textarea"
                rows={3}
                disabled={
                    sendMessage.loading ||
                    activateChat.loading ||
                    !chatActivated
                }
                placeholder={
                    "Please type your message...\nClick 'Send Message' Button or Press Shift + Enter to send..."
                }
                onChange={(value) => setInputText(value)}
                onKeyUp={async (e) => {
                    if (
                        e.key === "Enter" &&
                        e.shiftKey &&
                        !sendMessage.loading
                    ) {
                        await sendMessage.execute(inputText);
                    }
                }}
                onKeyDown={async (e) => {
                    if (e.key === "Enter" && e.shiftKey) {
                        e.preventDefault();
                        return;
                    }
                }}
                value={inputText}
            />
            <div className="chat-tool-area-container">
                <ButtonToolbar className="send-button-tool-bar">
                    <Button
                        className="clear-message-button"
                        disabled={
                            sendMessage.loading ||
                            activateChat.loading ||
                            !chatActivated
                        }
                        onClick={() =>
                            messageStreamRef.current.next(
                                createChatEventMessage(
                                    EVENT_TYPE_CLIENT_RESET_MESSAGE_QUEUE
                                )
                            )
                        }
                    >
                        Clear Message
                    </Button>
                    <Button
                        className="send-button"
                        appearance="primary"
                        disabled={
                            sendMessage.loading ||
                            activateChat.loading ||
                            !chatActivated
                        }
                        onClick={async () =>
                            await sendMessage.execute(inputText)
                        }
                    >
                        Send Message
                    </Button>
                </ButtonToolbar>
            </div>
        </div>
    );
};

export default forwardRef<RefType, PropsType>(DatasetKnowledgeInterview);
