import React, { FunctionComponent, useRef, useState } from "react";
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
    EVENT_TYPE_COMPLETE_MSG,
    EVENT_TYPE_CLIENT_RESET_MESSAGE_PROCESSING_STATE
} from "../Chatbot/Messaging";
import { MdOutlinePlayCircle } from "react-icons/md";
import ChatBoxMessagePanel from "../Chatbot/ChatBoxMessagePanel";
import "./DatasetKnowledgeInterview.scss";
import reportError from "helpers/reportError";

interface PropsType {
    datasetId: string;
}

function processStreamResponseChunk(
    messageStream: Subject<ChatEventMessage<Record<string, any>>>,
    chunk: Letta.agents.LettaStreamingResponse
) {
    console.log(chunk);
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
            createChatEventMessage<EventPartialMessageData>(
                EVENT_TYPE_COMPLETE_MSG,
                {
                    id: `${chunk.id}-tool`,
                    reasoning: true,
                    msg: `Using tool${
                        chunk?.toolCall?.name ? ": " + chunk.toolCall.name : ""
                    }...`
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

const DatasetKnowledgeInterview: FunctionComponent<PropsType> = () => {
    const [chatActivated, setChatActivated] = useState<boolean>(false);
    const messageStreamRef = useRef(new Subject<ChatEventMessage>());
    const [inputText, setInputText] = useState<string>("");
    const sendMessage = useAsyncCallback(async (inputText) => {
        try {
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
            const stream = await client.createMessageStream(
                "agent-940cfcea-1853-45b4-a02c-e5fa3b72f7bf",
                {
                    messages: [
                        {
                            role: "system",
                            content: `A user just connects for the same dataset interview for answering additional questions you might have.
                                Please review existing conversation history and memory blocks (if any) to see if any additional question you need to ask.`
                        }
                    ],
                    streamTokens: true
                }
            );
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
            reportError(String(e));
        }
    });
    const activateChat = useAsyncCallback(async () => {
        try {
            if (chatActivated) {
                return;
            }
            const client = getAgentServiceApiClient();
            setChatActivated(true);
            const stream = await client.createMessageStream(
                "agent-940cfcea-1853-45b4-a02c-e5fa3b72f7bf",
                {
                    messages: [
                        {
                            role: "system",
                            content: `A user just connects for the same dataset interview for answering additional questions you might have.
                                Please review existing conversation history and memory blocks (if any) to see if any additional question you need to ask.`
                        }
                    ],
                    streamTokens: true
                }
            );
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
            reportError(String(e));
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
                            onClick={async () => await activateChat.execute()}
                        >
                            <MdOutlinePlayCircle />
                            Start Interview
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

export default DatasetKnowledgeInterview;
