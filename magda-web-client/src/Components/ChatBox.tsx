import React, { useState, ReactNode, FunctionComponent } from "react";
import {
    Drawer,
    ButtonToolbar,
    Button,
    Input,
    Panel,
    IconButton,
    List
} from "rsuite";
import Notification from "rsuite/Notification";
import toaster from "rsuite/toaster";
import { BsChatRightDotsFill } from "react-icons/bs";
import { useAsyncCallback } from "react-async-hook";
import { config, commonFetchRequestOptions } from "../config";
import "../rsuite.scss";
import "./ChatBox.scss";

interface MessageItem {
    type: "user" | "bot";
    content: string;
}

const ChatBox: FunctionComponent = () => {
    const [open, setOpen] = React.useState(false);
    const [inputText, setInputText] = useState<string>("");
    const [messages, setMessages] = useState<MessageItem[]>([
        {
            type: "bot",
            content: "Hi, I'm Magda. Feel free to ask me anything about data."
        }
    ]);

    const sendMessage = useAsyncCallback(async (inputText) => {
        try {
            const sendOutText = inputText;
            setMessages([
                ...messages,
                {
                    type: "user",
                    content: sendOutText
                }
            ]);
            setInputText("");
            const endpoinit = `${config.chatBotApiBaseUrl}`;
            const res = await fetch(endpoinit, {
                ...commonFetchRequestOptions,
                method: "POST",
                headers: {
                    ...(commonFetchRequestOptions?.headers
                        ? commonFetchRequestOptions.headers
                        : {}),
                    "Content-Type": "text/plain"
                },
                body: sendOutText
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} - ${res.statusText}`);
            }
            const botMessage = await res.text();
            setMessages([
                ...messages,
                {
                    type: "bot",
                    content: botMessage
                }
            ]);
        } catch (e) {
            toaster.push(
                <Notification type={"error"} closable={true} header="Error">
                    {`${e}`}
                </Notification>,
                {
                    placement: "topEnd"
                }
            );
        }
    });

    return (
        <div className="magda-chat-box-main-container">
            <ButtonToolbar className="launch-button">
                <IconButton
                    appearance="primary"
                    icon={<BsChatRightDotsFill />}
                    onClick={() => setOpen(true)}
                >
                    <span className="heading">Chat to Magda</span>
                </IconButton>
            </ButtonToolbar>
            <Drawer open={open} onClose={() => setOpen(false)}>
                <Drawer.Body className="magda-chat-box-message-area-body">
                    <Panel
                        header="Chat with Magda"
                        bordered
                        className="message-area"
                    >
                        <List size="lg">
                            {messages.map((item, index) => (
                                <List.Item
                                    key={index}
                                    index={index}
                                    className={`${item.type}-message`}
                                >
                                    <pre>{item.content}</pre>
                                </List.Item>
                            ))}
                        </List>
                    </Panel>
                    <Input
                        className="message-input"
                        as="textarea"
                        rows={3}
                        placeholder="Please type your question..."
                        onChange={(value) => setInputText(value)}
                        onKeyUp={async (e) => {
                            if (e.keyCode !== 13 || !e.shiftKey) {
                                return;
                            }
                            await sendMessage.execute(inputText);
                        }}
                        value={inputText}
                    />
                    <ButtonToolbar className="send-button">
                        <Button
                            appearance="primary"
                            onClick={async () =>
                                await sendMessage.execute(inputText)
                            }
                        >
                            Send
                        </Button>
                    </ButtonToolbar>
                </Drawer.Body>
            </Drawer>
        </div>
    );
};

export default ChatBox;
