import React, { FunctionComponent, useRef, useState } from "react";
import { Subject } from "rxjs";
import Input from "rsuite/Input";
import ButtonToolbar from "rsuite/ButtonToolbar";
import Button from "rsuite/Button";
import { useAsyncCallback } from "react-async-hook";
import {
    ChatEventMessage,
    NoErrorStop,
    createChatEventMessage,
    EVENT_TYPE_CLIENT_RESET_MESSAGE_QUEUE
} from "../Chatbot/Messaging";
import ChatBoxMessagePanel from "../Chatbot/ChatBoxMessagePanel";
import "./DatasetKnowledgeInterview.scss";
import reportError from "helpers/reportError";

interface PropsType {
    datasetId: string;
}

const DatasetKnowledgeInterview: FunctionComponent<PropsType> = () => {
    const messageStreamRef = useRef(new Subject<ChatEventMessage>());
    const [inputText, setInputText] = useState<string>("");
    const sendMessage = useAsyncCallback(async (inputText) => {
        try {
            // const sendOutText = inputText.trim();
            // if (!sendOutText) {
            //     return;
            // }
            // messageStreamRef.current.next(
            //     createChatEventMessage(EVENT_TYPE_CLIENT_MESSAGE_SENT, {
            //         type: "user",
            //         content: sendOutText
            //     })
            // );
            // setInputText("");
            // if (!agentChainRef.current) {
            //     throw new Error("Agent chain is not initialized");
            // }
            // const agent = agentChainRef.current;
            // const response = await agent.stream(sendOutText);
            // for await (const eventMessage of response) {
            //     messageStreamRef.current.next(eventMessage);
            // }
        } catch (e) {
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
            <ChatBoxMessagePanel
                appName={"sdssd"}
                sendMessageLoading={false}
                messageStream={messageStreamRef.current}
                size="full"
            />
            <Input
                className="message-input"
                as="textarea"
                rows={3}
                disabled={sendMessage.loading}
                placeholder={
                    "Please type your question...\nClick 'Send Message' Button or Press Shift + Enter to send..."
                }
                onChange={(value) => setInputText(value)}
                onKeyUp={async (e) => {
                    if (
                        e.keyCode === 13 &&
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
                        disabled={sendMessage.loading}
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
                        disabled={sendMessage.loading}
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
