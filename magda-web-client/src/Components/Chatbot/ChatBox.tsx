import React, {
    useState,
    useEffect,
    FunctionComponent,
    useRef,
    useCallback
} from "react";
import {
    Drawer,
    ButtonToolbar,
    Button,
    Input,
    Panel,
    IconButton,
    List,
    Loader,
    RadioGroup,
    Radio
} from "rsuite";
import Notification from "rsuite/Notification";
import toaster from "rsuite/toaster";
import { BsChatRightDotsFill } from "react-icons/bs";
import { useAsyncCallback } from "react-async-hook";
import { Small, Medium } from "../Common/Responsive";
import TextPreview from "./TextPreview";
import { config, commonFetchRequestOptions } from "../../config";
import { useSelector } from "react-redux";
import { StateType } from "../../reducers/reducer";
import { User } from "../../reducers/userManagementReducer";
import { v4 as uuidv4 } from "uuid";
import reportError from "../../helpers/reportError";
import "../../rsuite.scss";
import "./ChatBox.scss";
import { useLocation, useHistory } from "react-router-dom";

import {
    EVENT_TYPE_AGENT_STEP_FINISH,
    EVENT_TYPE_CLOSE,
    EVENT_TYPE_COMPLETE_MSG,
    EVENT_TYPE_ERROR,
    EVENT_TYPE_PARTIAL_MSG_FINISH,
    EVENT_TYPE_PING,
    NoErrorStop,
    STREAM_TYPE,
    STREAM_TYPE_AGENT_STEP,
    STREAM_TYPE_PARTIAL_MSG,
    STREAM_TYPE_UNDEFINED,
    getStreamType,
    ChatEventMessage
} from "./Messaging";
import { parseJsonMarkdown } from "../../libs/json";
import AgentChain from "./AgentChain";
import { InitProgressReport } from "@mlc-ai/web-llm";
import MagdaNamespacesConsumer from "../../Components/i18n/MagdaNamespacesConsumer";

interface MessageItem {
    type: "user" | "bot";
    content: string;
}

interface StreamStateType {
    // event.data.id is the stream id that we need to keep track of
    // server side will maintain the stream id consistent for all event emitted during the chain execution
    // event.id is the event id that will be unique for each event
    // please note: not all event comes with data field (e.g. error / close event)
    streamId: string | null;
    streamType: STREAM_TYPE;
    abortCtl: AbortController | null;
    partialMessage: string | null;
}

function getDefaultMessage(appName: string): MessageItem {
    return {
        type: "bot",
        content: `Hi, I'm ${
            appName ? appName : `Magda`
        }. Feel free to ask me anything about data.`
    };
}

const getInitialStreamState = (): StreamStateType => ({
    streamId: null,
    streamType: STREAM_TYPE_UNDEFINED,
    abortCtl: null,
    partialMessage: null
});

const addMessage = (
    messageQueueRef: React.MutableRefObject<MessageItem[]>,
    message: MessageItem
) => {
    messageQueueRef.current?.push(message as MessageItem);
};

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
}

const ChatBox: FunctionComponent<PropsType> = (props) => {
    const { appName } = props;
    const [size, setSize] = useState<string>("sm");
    const [open, setOpen] = useState<boolean>(false);
    const [inputText, setInputText] = useState<string>("");
    const messageQueueRef = useRef<MessageItem[]>([
        getDefaultMessage(props.appName)
    ]);
    const messageQueueLen = messageQueueRef.current?.length
        ? messageQueueRef.current.length
        : 0;
    //change this value to trigger re-render
    //why? we used `ref` to store state. React doesn't know when the state is changed
    const [dataReloadToken, setDataReloadToken] = useState<string>("");
    const lastMessageItemRef = useRef<HTMLDivElement>(null);
    // stream processing state
    // we need to use ref to keep the state as event processor function is run in a different context
    // Only `ref`'s variable reference will be consistent across different runs of the function
    const streamStateRef = useRef<StreamStateType>(getInitialStreamState());
    // we only render partial message box when it's a string
    const showPartialMessageBox =
        typeof streamStateRef.current?.partialMessage === "string";
    const partialMessageLen = streamStateRef.current?.partialMessage?.length
        ? streamStateRef.current.partialMessage.length
        : 0;
    const agentChainRef = useRef<AgentChain | null>(null);
    const [
        llmLoadProgress,
        setLLMLoadProgress
    ] = useState<InitProgressReport | null>(null);
    const location = useLocation();
    const history = useHistory();

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
        if (messageQueueRef.current?.length) {
            messageQueueRef.current[0] = getDefaultMessage(props.appName);
        }
    }, [appName]);

    useEffect(() => {
        agentChainRef.current = AgentChain.create(
            appName,
            location,
            history,
            setLLMLoadProgress
        );
        return () => {
            agentChainRef.current = null;
            //AgentChain.removeLLMLoadProgressCallback(setLLMLoadProgress);
        };
    }, [setLLMLoadProgress]);

    useEffect(() => {
        if (lastMessageItemRef.current) {
            lastMessageItemRef.current.scrollIntoView({
                behavior: "auto",
                block: "end"
            });
        }
    }, [showPartialMessageBox, partialMessageLen, messageQueueLen]);

    // Reset any message processing status. This includes:
    // - clean up the partial message display box when we believe that the partial message stream is complete
    //   or we believe should be no more partial message events to come for this stream
    // - reset the stream id and stream type
    function resetMessageProcessingStatus(
        streamId?: string,
        streamType?: STREAM_TYPE
    ) {
        const { partialMessage } = streamStateRef.current;
        if (typeof partialMessage === "string" && partialMessage) {
            streamStateRef.current.partialMessage = null;
            // push the partial message to the completed message queue
            addMessage(messageQueueRef, {
                type: "bot",
                content: partialMessage
            });
        }
        streamStateRef.current.streamId = streamId ? streamId : null;
        streamStateRef.current.streamType = streamType
            ? streamType
            : STREAM_TYPE_UNDEFINED;
        setDataReloadToken(Math.random().toString());
    }

    function eventProcessor(eventMessage: ChatEventMessage) {
        if (eventMessage.event === EVENT_TYPE_PING) {
            return;
        }

        const { streamId, streamType, partialMessage } = streamStateRef.current;

        if (eventMessage.event === EVENT_TYPE_ERROR) {
            resetMessageProcessingStatus();
            throw new Error(
                eventMessage?.data?.error
                    ? String(eventMessage.data.error)
                    : `Remote stream error: ${eventMessage.data}`
            );
        }

        if (eventMessage.event === EVENT_TYPE_CLOSE) {
            resetMessageProcessingStatus();
            throw new NoErrorStop();
        }

        if (
            eventMessage.event === EVENT_TYPE_COMPLETE_MSG &&
            eventMessage?.data?.msg
        ) {
            addMessage(messageQueueRef, {
                type: "bot",
                content: eventMessage?.data?.msg
            });
            setDataReloadToken(Math.random().toString());
            return;
        }

        const eventStreamId = eventMessage.data?.id
            ? eventMessage.data.id
            : null;
        const eventStreamType = getStreamType(eventMessage);
        if (eventStreamType !== streamType || eventStreamId !== streamId) {
            // if the stream type changes or event stream id changes, we should clean up the partial message display
            resetMessageProcessingStatus(
                eventStreamId !== streamId ? eventStreamId : undefined,
                eventStreamType !== streamType ? eventStreamType : undefined
            );
        }

        switch (eventStreamType) {
            case STREAM_TYPE_PARTIAL_MSG:
                if (eventMessage.event === EVENT_TYPE_PARTIAL_MSG_FINISH) {
                    resetMessageProcessingStatus();
                    return;
                }
                // add new arriving partial message to the `partialMessage` state
                streamStateRef.current.partialMessage =
                    (partialMessage ? partialMessage : "") +
                    (eventMessage?.data?.msg ? eventMessage.data.msg : "");
                break;
            case STREAM_TYPE_AGENT_STEP:
                if (eventMessage.event === EVENT_TYPE_AGENT_STEP_FINISH) {
                    resetMessageProcessingStatus();
                    return;
                }
                const stepData = eventMessage?.data?.step
                    ? eventMessage.data.step
                    : {};
                const { steps, actions, output } = stepData;
                let createNewMsg = false;
                if (actions?.length) {
                    if (actions?.length) {
                        actions.forEach((action: any) => {
                            const log = action?.log ? action.log.trim() : "";
                            if (log) {
                                addMessage(messageQueueRef, {
                                    type: "bot",
                                    content: log
                                });
                                createNewMsg = true;
                            }
                        });
                    }
                }
                if (steps?.length) {
                    steps.forEach((step: any) => {
                        const observation =
                            typeof step?.observation === "string"
                                ? step.observation.trim()
                                : "";
                        if (observation) {
                            const parsedObservation = parseJsonMarkdown(
                                observation
                            );
                            if (!parsedObservation) {
                                // When the observation is JSON data, we want to avoid to display it to the user
                                // as it would be hard to read for non-technical users
                                // Besides, only text based observation will reveal the agent's thinking process
                                addMessage(messageQueueRef, {
                                    type: "bot",
                                    content: observation
                                });
                                createNewMsg = true;
                            }
                        }
                    });
                } else if (output) {
                    addMessage(messageQueueRef, {
                        type: "bot",
                        content: output
                    });
                    createNewMsg = true;
                }

                if (createNewMsg) {
                    setDataReloadToken(Math.random().toString());
                }
                break;
            default:
                throw new Error(`Unsupported stream type: ${streamType}`);
        }
        setDataReloadToken(Math.random().toString());
    }

    const sendMessage = useAsyncCallback(async (inputText) => {
        try {
            const sendOutText = inputText.trim();
            if (!sendOutText) {
                return;
            }
            addMessage(messageQueueRef, {
                type: "user",
                content: sendOutText
            });
            setDataReloadToken(Math.random().toString());
            setInputText("");

            const ctrl = new AbortController();
            // todo: need to find a way to support canceling the LLM generation operation
            streamStateRef.current.abortCtl = ctrl;

            if (!agentChainRef.current) {
                throw new Error("Agent chain is not initialized");
            }
            const agent = agentChainRef.current;
            const response = await agent.stream(sendOutText);
            for await (const eventMessage of response) {
                eventProcessor(eventMessage);
            }
        } catch (e) {
            streamStateRef.current.abortCtl?.abort();
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

    const makeDrawerBody = () => (
        <Drawer.Body className="magda-chat-box-message-area-body">
            <LLMLoadingBox
                progress={llmLoadProgress}
                agentChainRef={agentChainRef}
            />
            <Panel bordered className="message-area">
                <List size="lg">
                    {messageQueueRef.current.map((item, index) =>
                        messageQueueRef.current?.length === index + 1 &&
                        !showPartialMessageBox ? (
                            <List.Item
                                key={index}
                                ref={lastMessageItemRef}
                                index={index}
                                className={`${item.type}-message markdown-body`}
                            >
                                <TextPreview source={item.content} />
                            </List.Item>
                        ) : (
                            <List.Item
                                key={index}
                                index={index}
                                className={`${item.type}-message markdown-body`}
                            >
                                <TextPreview source={item.content} />
                            </List.Item>
                        )
                    )}
                    {showPartialMessageBox ? (
                        <List.Item
                            key="working-message"
                            ref={lastMessageItemRef}
                            index={
                                messageQueueRef.current?.length
                                    ? messageQueueRef.current.length
                                    : 1
                            }
                            className={`bot-message markdown-body`}
                        >
                            <TextPreview
                                source={
                                    streamStateRef.current
                                        .partialMessage as string
                                }
                            />
                            <Loader />
                        </List.Item>
                    ) : null}
                </List>
                {sendMessage.loading ? (
                    <Loader
                        style={{
                            position: "absolute",
                            right: size === "sm" ? "40px" : "70px",
                            bottom: "180px"
                        }}
                    />
                ) : null}
            </Panel>
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
                    if (e.keyCode === 13 && e.shiftKey) {
                        e.preventDefault();
                        return;
                    }
                }}
                value={inputText}
            />
            <ButtonToolbar className="send-button-tool-bar">
                <Button
                    className="send-button"
                    appearance="primary"
                    disabled={sendMessage.loading}
                    onClick={async () => await sendMessage.execute(inputText)}
                >
                    Send Message
                </Button>
                <Button
                    className="clear-message-button"
                    disabled={sendMessage.loading}
                    onClick={() => {
                        messageQueueRef.current = [
                            getDefaultMessage(props.appName)
                        ];
                        setDataReloadToken(Math.random().toString());
                    }}
                >
                    Clear Message
                </Button>
            </ButtonToolbar>
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
            <ButtonToolbar className="launch-button">
                <IconButton
                    appearance="primary"
                    icon={<BsChatRightDotsFill />}
                    onClick={() => {
                        setOpen(true);
                    }}
                >
                    <span className="heading">Chat to Magda</span>
                </IconButton>
            </ButtonToolbar>
            <Small>
                <Drawer
                    className="magda-chat-box-drawer"
                    open={open}
                    backdrop={true}
                    size={"full" as any}
                    onClose={() => setOpen(false)}
                >
                    {makeDrawerHeader("sm")}
                    {makeDrawerBody()}
                </Drawer>
            </Small>
            <Medium>
                <Drawer
                    className="magda-chat-box-drawer"
                    open={open}
                    backdrop={true}
                    size={size as any}
                    onClose={() => setOpen(false)}
                >
                    {makeDrawerHeader(undefined)}
                    {makeDrawerBody()}
                </Drawer>
            </Medium>
        </div>
    );
};

const ChatBoxWithAppName: FunctionComponent = () => (
    <MagdaNamespacesConsumer ns={["global"]}>
        {(translate) => {
            const appName = translate(["appName", ""]);

            return <ChatBox appName={appName} />;
        }}
    </MagdaNamespacesConsumer>
);
export default ChatBoxWithAppName;
