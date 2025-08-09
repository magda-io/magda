import React, { useState, useEffect, FunctionComponent, useRef } from "react";
import {
    Drawer,
    ButtonToolbar,
    Button,
    Input,
    Loader,
    RadioGroup,
    Radio
} from "rsuite";
import { Subject } from "rxjs";
import SelectPicker from "rsuite/SelectPicker";
import Tooltip from "rsuite/Tooltip";
import Whisper from "rsuite/Whisper";
import Notification from "rsuite/Notification";
import toaster from "rsuite/toaster";
import { MdOutlineHelp } from "react-icons/md";
import { useAsyncCallback } from "react-async-hook";
import { Small, Medium } from "../Common/Responsive";
import ChatBoxMessagePanel from "./ChatBoxMessagePanel";
import { useSelector } from "react-redux";
import { StateType } from "../../reducers/reducer";
import { useLocation, useHistory } from "react-router-dom";
import {
    NoErrorStop,
    ChatEventMessage,
    createChatEventMessage,
    EVENT_TYPE_CLIENT_MESSAGE_SENT,
    EVENT_TYPE_CLIENT_RESET_MESSAGE_QUEUE
} from "./Messaging";
import AgentChain from "./AgentChain";
import { InitProgressReport } from "@mlc-ai/web-llm";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
import reportError from "helpers/reportError";
import { contextWindowOptions, defaultContextWindowSize } from "./ChatWebLLM";
import "../../rsuite.scss";
import "./ChatBox.scss";

const LLMLoadingBox: FunctionComponent<{
    progress: InitProgressReport | null;
    agentChainRef: React.MutableRefObject<AgentChain | null>;
}> = (props) => {
    const { progress, agentChainRef } = props;
    if (!agentChainRef.current) {
        return (
            <div style={{ zIndex: 2000 }}>
                <Loader backdrop content="Loading LLM..." vertical />
            </div>
        );
    } else if (progress && progress.progress < 1) {
        return (
            <div style={{ zIndex: 2000 }}>
                <Loader backdrop content={progress.text} vertical />
            </div>
        );
    } else {
        return null;
    }
};

interface PropsType {
    appName: string;
    isOpen: boolean;
    setIsOpen: (boolean) => void;
}

const ChatBox: FunctionComponent<PropsType> = (props) => {
    const messageStreamRef = useRef(new Subject<ChatEventMessage>());
    const [contextWindowSize, setContextWindowSize] = useState<number>(
        defaultContextWindowSize
    );
    const contextWinSelectorLabelRef = useRef<HTMLDivElement>(null);
    const { appName, isOpen, setIsOpen } = props;
    const [size, setSize] = useState<string>("sm");
    const [inputText, setInputText] = useState<string>("");
    const agentChainRef = useRef<AgentChain | null>(null);
    const [
        llmLoadProgress,
        setLLMLoadProgress
    ] = useState<InitProgressReport | null>(null);
    const location = useLocation();
    const history = useHistory();
    const dataset = useSelector<StateType, ParsedDataset | undefined>(
        (state) => state.record.dataset
    );
    const distribution = useSelector<StateType, ParsedDistribution | undefined>(
        (state) => state.record.distribution
    );

    useEffect(() => {
        agentChainRef.current?.setAppName(appName);
    }, [appName]);

    useEffect(() => {
        agentChainRef.current?.setNavLocation(location);
    }, [location]);

    useEffect(() => {
        agentChainRef.current?.setNavHistory(history);
    }, [history]);

    useEffect(() => {
        agentChainRef.current?.setDataset(dataset);
    }, [dataset]);

    useEffect(() => {
        agentChainRef.current?.setDistribution(distribution);
    }, [distribution]);

    useEffect(() => {
        agentChainRef.current?.setLoadProgressCallback(setLLMLoadProgress);
    }, [setLLMLoadProgress]);

    useEffect(() => {
        agentChainRef.current = AgentChain.create(
            appName,
            location,
            history,
            dataset,
            distribution,
            setLLMLoadProgress,
            (e) => {
                reportError(`Failed to load model: ${e}`, { duration: 10000 });
            }
        );
        (window as any).agentChainRef = agentChainRef.current;
        return () => {
            agentChainRef.current = null;
            //AgentChain.removeLLMLoadProgressCallback(setLLMLoadProgress);
        };
        // -- should be run once only. Thus, [] as dependencies
    }, []);

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

            if (!agentChainRef.current) {
                throw new Error("Agent chain is not initialized");
            }
            const agent = agentChainRef.current;
            const response = await agent.stream(sendOutText);
            for await (const eventMessage of response) {
                messageStreamRef.current.next(eventMessage);
            }
        } catch (e) {
            if (e instanceof NoErrorStop) {
                // do nothing
                // this is a special error that we throw to stop the operation without error
                return;
            }
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

    const updateModelContextWin = useAsyncCallback(
        async (ctxWinSize: number) => {
            if (!agentChainRef?.current) {
                return;
            }
            agentChainRef.current.updateModelConfig(
                {
                    chatOptions: {
                        temperature: 0,
                        context_window_size: ctxWinSize
                    }
                },
                (e) => {
                    reportError(`Failed to load model: ${e}`, {
                        duration: 10000
                    });
                }
            );
        }
    );

    const makeDrawerBody = () => (
        <Drawer.Body className="magda-chat-box-message-area-body">
            <LLMLoadingBox
                progress={llmLoadProgress}
                agentChainRef={agentChainRef}
            />
            <ChatBoxMessagePanel
                appName={appName}
                sendMessageLoading={sendMessage.loading}
                messageStream={messageStreamRef.current}
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
            <div className="tool-area-container">
                <ButtonToolbar className="send-button-tool-bar">
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
                </ButtonToolbar>
                <div className="context-win-selection-area">
                    <div
                        className="context-win-selector-label"
                        ref={contextWinSelectorLabelRef}
                    >
                        Context Window:
                        <Whisper
                            container={
                                contextWinSelectorLabelRef.current as any
                            }
                            placement={"auto"}
                            trigger="hover"
                            speaker={
                                <Tooltip>
                                    An LLM's context window limit is the maximum
                                    number of tokens it can process at once. The
                                    Chatbot might not be able to respond when it
                                    needs to examine large amount of data due to
                                    the limit. You can increase the limit to
                                    allow the Chatbot to process more data.
                                    However, it will requires more memory
                                    (default 4096 tokens context window requires
                                    roughly 5GB VRAM) and take much longer (2x
                                    the context windows would increase process
                                    time by 4x) to process depends on your
                                    hardware.
                                </Tooltip>
                            }
                        >
                            <MdOutlineHelp />
                        </Whisper>
                    </div>
                    <SelectPicker
                        className="context-win-selector"
                        data={contextWindowOptions}
                        preventOverflow={false}
                        placement="leftEnd"
                        searchable={false}
                        cleanable={false}
                        value={contextWindowSize}
                        onChange={(opt) => {
                            const ctxWinSize = opt
                                ? opt
                                : defaultContextWindowSize;
                            setContextWindowSize(ctxWinSize);
                            updateModelContextWin.execute(ctxWinSize);
                        }}
                    />
                </div>
            </div>
        </Drawer.Body>
    );

    const makeDrawerHeader = (screeSize: "sm" | undefined) =>
        screeSize === "sm" ? (
            <Drawer.Header>
                <Drawer.Title>Chat to {appName}</Drawer.Title>
            </Drawer.Header>
        ) : (
            <Drawer.Header>
                <Drawer.Title>Chat to {appName}</Drawer.Title>
                <Drawer.Actions>
                    <RadioGroup
                        inline
                        appearance="picker"
                        value={size}
                        onChange={setSize as any}
                    >
                        <span className="size-selector-heading">Size: </span>
                        <Radio value="sm">Small</Radio>
                        <Radio value="lg">Large</Radio>
                        <Radio value="full">Full Screen</Radio>
                    </RadioGroup>
                </Drawer.Actions>
            </Drawer.Header>
        );

    return (
        <div className="magda-chat-box-main-container">
            <Small>
                <Drawer
                    className="magda-chat-box-drawer"
                    open={isOpen}
                    backdrop="static"
                    size={"full" as any}
                    onClose={() => setIsOpen(false)}
                >
                    {makeDrawerHeader("sm")}
                    {makeDrawerBody()}
                </Drawer>
            </Small>
            <Medium>
                <Drawer
                    className="magda-chat-box-drawer"
                    open={isOpen}
                    backdrop="static"
                    size={size as any}
                    onClose={() => setIsOpen(false)}
                >
                    {makeDrawerHeader(undefined)}
                    {makeDrawerBody()}
                </Drawer>
            </Medium>
        </div>
    );
};

export default ChatBox;
