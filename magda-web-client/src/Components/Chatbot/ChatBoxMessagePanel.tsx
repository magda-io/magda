import React, {
    useState,
    useEffect,
    FunctionComponent,
    useRef,
    useCallback
} from "react";
import { Panel, List, Loader } from "rsuite";
import { Subject, takeUntil } from "rxjs";
import MarkdownChunkStream from "./MarkdownChunkStream";
import TextPreview from "./TextPreview";
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
    ChatEventMessage,
    EVENT_TYPE_CLIENT_RESET_MESSAGE_QUEUE,
    EVENT_TYPE_CLIENT_RESET_MESSAGE_PROCESSING_STATE,
    EVENT_TYPE_CLIENT_MESSAGE_SENT
} from "./Messaging";
import { parseJsonMarkdown } from "../../libs/json";
import "../../rsuite.scss";
import "./ChatBoxMessagePanel.scss";

interface MessageItem {
    // depends on implementation, the value of type could be "user" | "bot" | "human" | "ai" or other value
    type: string;
    content: string;
    // For some implementation, messages that are marked as optional will not be passed to LLM as part of history
    optional?: boolean;
}

interface StreamStateType {
    // event.data.id is the stream id that we need to keep track of
    // server side will maintain the stream id consistent for all event emitted during the chain execution
    // event.id is the event id that will be unique for each event
    // please note: not all event comes with data field (e.g. error / close event)
    streamId: string | null;
    streamType: STREAM_TYPE;
    partialMessage: string | null;
    // markdownChunkStream will make sure only incomplete code block will not be emitted until full code block is received.
    // only applied to partial message
    markdownChunkStream: MarkdownChunkStream;
}

function getDefaultMessage(appName: string): MessageItem {
    return {
        type: "bot",
        content: `Hi, I'm ${
            appName ? appName : `Magda`
        }. Feel free to ask me anything about data.`
    };
}

const CODE_BLOCK_EMIT_TIMEOUT = 180000;

const getInitialStreamState = (): StreamStateType => {
    const streamState: Partial<StreamStateType> = {
        streamId: null,
        streamType: STREAM_TYPE_UNDEFINED,
        partialMessage: null
    };
    streamState.markdownChunkStream = new MarkdownChunkStream((msg) => {
        streamState.partialMessage =
            (streamState.partialMessage ? streamState.partialMessage : "") +
            msg;
    }, CODE_BLOCK_EMIT_TIMEOUT);
    return streamState as StreamStateType;
};

const addMessage = (
    messageQueueRef: React.MutableRefObject<MessageItem[]>,
    message: MessageItem
) => {
    messageQueueRef.current?.push(message as MessageItem);
};

interface PropsType {
    appName: string;
    sendMessageLoading: boolean;
    messageStream: Subject<ChatEventMessage>;
    // "sm" | "md" | "lg" | "full
    size: string;
    // whether or not display an initial message in the chat area
    // default to `true` when not supplied
    useInitialMessage?: boolean;
    // optionally supply the initial message. Otherwise, use the default initial message (when useInitialMessage = true)
    initialMessage?: MessageItem;
}

const ChatBoxMessagePanel: FunctionComponent<PropsType> = (props) => {
    const { appName, messageStream, initialMessage } = props;
    const useInitialMessage =
        typeof props?.useInitialMessage === "boolean"
            ? props.useInitialMessage
            : true;
    const size = props?.size ? props.size : "sm";
    const sendMessageLoading =
        typeof props?.sendMessageLoading === "boolean"
            ? props.sendMessageLoading
            : false;

    const getEmptyMessageQueue = useCallback(
        () =>
            useInitialMessage
                ? [initialMessage ? initialMessage : getDefaultMessage(appName)]
                : [],
        [appName, useInitialMessage, initialMessage]
    );

    const messageQueueRef = useRef<MessageItem[]>(getEmptyMessageQueue());
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

    useEffect(() => {
        if (
            messageQueueRef.current?.length &&
            useInitialMessage &&
            !initialMessage
        ) {
            messageQueueRef.current[0] = getDefaultMessage(appName);
        }
    }, [appName, useInitialMessage, initialMessage]);

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
    const resetMessageProcessingStatus = useCallback(
        (streamId?: string, streamType?: STREAM_TYPE) => {
            const { markdownChunkStream } = streamStateRef.current;
            markdownChunkStream.flush(() => {
                const { partialMessage } = streamStateRef.current;
                if (typeof partialMessage === "string" && partialMessage) {
                    streamStateRef.current.partialMessage = null;
                    // push the partial message to the completed message queue
                    addMessage(messageQueueRef, {
                        type: "ai",
                        content: partialMessage
                    });
                }
                streamStateRef.current.streamId = streamId ? streamId : null;
                streamStateRef.current.streamType = streamType
                    ? streamType
                    : STREAM_TYPE_UNDEFINED;
                setDataReloadToken(Math.random().toString());
            });
        },
        [streamStateRef, setDataReloadToken]
    );

    const eventProcessor = useCallback(
        (eventMessage: ChatEventMessage) => {
            if (eventMessage.event === EVENT_TYPE_PING) {
                return;
            }

            if (eventMessage.event === EVENT_TYPE_CLIENT_RESET_MESSAGE_QUEUE) {
                messageQueueRef.current = getEmptyMessageQueue();
                setDataReloadToken(Math.random().toString());
                return;
            }

            if (
                eventMessage.event ===
                EVENT_TYPE_CLIENT_RESET_MESSAGE_PROCESSING_STATE
            ) {
                resetMessageProcessingStatus();
                return;
            }

            if (eventMessage.event === EVENT_TYPE_CLIENT_MESSAGE_SENT) {
                if (!eventMessage?.data) {
                    throw new Error("Invalid EVENT_TYPE_CLIENT_MESSAGE_SENT");
                }
                addMessage(messageQueueRef, eventMessage.data as MessageItem);
                setDataReloadToken(Math.random().toString());
                return;
            }

            const { streamId, streamType } = streamStateRef.current;

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
                    content: eventMessage?.data?.msg,
                    optional:
                        typeof eventMessage?.data?.optional === "boolean"
                            ? eventMessage.data.optional
                            : false
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
                    // add new arriving partial message to the markdownChunkStream
                    // markdownChunkStream will make sure emitting content (and add to streamStateRef.current.partialMessage) at right timing without breaking code block
                    streamStateRef.current.markdownChunkStream.write(
                        eventMessage?.data?.msg ? eventMessage.data.msg : ""
                    );
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
                                const log = action?.log
                                    ? action.log.trim()
                                    : "";
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
        },
        [
            streamStateRef,
            setDataReloadToken,
            resetMessageProcessingStatus,
            getEmptyMessageQueue
        ]
    );

    useEffect(() => {
        const stop = new Subject<void>();
        const sub = messageStream
            .pipe(takeUntil(stop))
            .subscribe(eventProcessor);

        return () => {
            stop.next();
            stop.complete();
            sub.unsubscribe();
        };
    }, [messageStream, eventProcessor]);

    return (
        <Panel bordered className="magda-chat-box-message-panel">
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
                                streamStateRef.current.partialMessage as string
                            }
                        />
                        <Loader />
                    </List.Item>
                ) : null}
            </List>
            {sendMessageLoading ? (
                <Loader
                    style={{
                        position: "absolute",
                        right: size === "sm" ? "40px" : "70px",
                        bottom: "180px"
                    }}
                />
            ) : null}
        </Panel>
    );
};

export default ChatBoxMessagePanel;
