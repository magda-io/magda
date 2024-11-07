import { ChatGenerationChunk } from "@langchain/core/outputs";
import { Runnable, RunnableLambda } from "@langchain/core/runnables";
import { v4 as uuidv4 } from "uuid";
import type AsyncQueue from "@ai-zen/async-queue";

export interface EventSourceMessage {
    id: string;
    event: string;
    data: string;
    retry?: number;
}

export interface ChatEventMessage {
    id: string;
    event: EVENT_TYPE;
    data?: {
        [key: string]: any;
    };
    retry?: number;
}

export const EVENT_TYPE_CLOSE = "close";
export const EVENT_TYPE_ERROR = "error";
export const EVENT_TYPE_PARTIAL_MSG = "partial_msg";
export const EVENT_TYPE_PARTIAL_MSG_FINISH = "partial_msg_finish";
export const EVENT_TYPE_COMPLETE_MSG = "complete_msg";
export const EVENT_TYPE_RUN_LOG = "run_log";
export const EVENT_TYPE_RUN_LOG_FINISH = "run_log_finish";
export const EVENT_TYPE_AGENT_STEP = "agent_step";
export const EVENT_TYPE_AGENT_STEP_FINISH = "agent_step_finish";
export const EVENT_TYPE_PING = "ping";

export type EVENT_TYPE =
    | typeof EVENT_TYPE_CLOSE
    | typeof EVENT_TYPE_ERROR
    | typeof EVENT_TYPE_PARTIAL_MSG
    | typeof EVENT_TYPE_COMPLETE_MSG
    | typeof EVENT_TYPE_PARTIAL_MSG_FINISH
    | typeof EVENT_TYPE_RUN_LOG
    | typeof EVENT_TYPE_RUN_LOG_FINISH
    | typeof EVENT_TYPE_AGENT_STEP
    | typeof EVENT_TYPE_AGENT_STEP_FINISH
    | typeof EVENT_TYPE_PING;

export const STREAM_TYPE_PARTIAL_MSG = "partial_msg";
export const STREAM_TYPE_RUN_LOG = "run_log";
export const STREAM_TYPE_AGENT_STEP = "agent_step";
export const STREAM_TYPE_COMPLETE_MSG = "complete_msg";
export const STREAM_TYPE_UNDEFINED = "undefined";

export type STREAM_TYPE =
    | typeof STREAM_TYPE_PARTIAL_MSG
    | typeof STREAM_TYPE_COMPLETE_MSG
    | typeof STREAM_TYPE_RUN_LOG
    | typeof STREAM_TYPE_AGENT_STEP
    | typeof STREAM_TYPE_UNDEFINED;

export const getStreamType = (message: ChatEventMessage): STREAM_TYPE => {
    switch (message.event) {
        case EVENT_TYPE_PARTIAL_MSG:
            return STREAM_TYPE_PARTIAL_MSG;
        case EVENT_TYPE_PARTIAL_MSG_FINISH:
            return STREAM_TYPE_PARTIAL_MSG;
        case EVENT_TYPE_COMPLETE_MSG:
            return STREAM_TYPE_COMPLETE_MSG;
        case EVENT_TYPE_RUN_LOG:
            return STREAM_TYPE_RUN_LOG;
        case EVENT_TYPE_RUN_LOG_FINISH:
            return STREAM_TYPE_RUN_LOG;
        case EVENT_TYPE_AGENT_STEP:
            return STREAM_TYPE_AGENT_STEP;
        case EVENT_TYPE_AGENT_STEP_FINISH:
            return STREAM_TYPE_AGENT_STEP;
        default:
            return STREAM_TYPE_UNDEFINED;
    }
};

export class NoErrorStop extends Error {}

export function createChatEventMessage(
    eventType: EVENT_TYPE,
    data: { [key: string]: any } = {},
    retry?: number
): ChatEventMessage {
    return {
        id: uuidv4(),
        event: eventType,
        data,
        retry
    };
}

export const chatGenerationChunk2ChatEventMessage = (
    chunk: ChatGenerationChunk,
    msgId: string
) =>
    createChatEventMessage(EVENT_TYPE_PARTIAL_MSG, {
        id: msgId,
        msg: chunk.text
    });

export const createChatEventMessageCompleteMsg = (msg: string) =>
    createChatEventMessage(EVENT_TYPE_COMPLETE_MSG, { msg });

export const createChatEventMessageErrorMsg = (error: Error | string) =>
    createChatEventMessage(EVENT_TYPE_ERROR, { error });

export interface CommonInputType {
    question: string;
    queue: AsyncQueue<ChatEventMessage>;
}

export function strChain2PartialMessageChain(
    chain: Runnable<CommonInputType, string>,
    onComplete?: (completMsg: string, input: CommonInputType) => void
) {
    return RunnableLambda.from(async function* (input: CommonInputType) {
        const msgId = uuidv4();
        let buffer = "";
        const stream = await chain.stream(input);
        for await (const chunk of stream) {
            console.log("strChain2PartialMessageChain chunk:", chunk);
            yield createChatEventMessage(EVENT_TYPE_PARTIAL_MSG, {
                id: msgId,
                msg: chunk
            });
            if (onComplete) {
                buffer += chunk;
            }
        }
        yield createChatEventMessage(EVENT_TYPE_PARTIAL_MSG_FINISH, {
            id: msgId
        });
        if (onComplete) {
            onComplete(buffer, input);
        }
    });
    // return chain.pipe(async function* (input) {
    //     console.log("input:", input);
    //     const msgId = uuidv4();
    //     let buffer = "";
    //     for await (const chunk of input) {
    //         yield createChatEventMessage(EVENT_TYPE_PARTIAL_MSG, {
    //             id: msgId,
    //             msg: chunk
    //         });
    //         if (onComplete) {
    //             buffer += chunk;
    //         }
    //     }
    //     yield createChatEventMessage(EVENT_TYPE_PARTIAL_MSG_FINISH, {
    //         id: msgId
    //     });
    //     if (onComplete) {
    //         onComplete(buffer);
    //     }
    // });
}
