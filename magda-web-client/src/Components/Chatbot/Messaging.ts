import { EVENT_TYPE, BaseEventTypes } from "./EventTypes";
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

export interface ChatEventMessage<T = Record<string, any>> {
    id: string;
    event: EVENT_TYPE;
    data?: T;
    retry?: number;
}

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
        case BaseEventTypes.PARTIAL_MSG:
            return STREAM_TYPE_PARTIAL_MSG;
        case BaseEventTypes.PARTIAL_MSG_FINISH:
            return STREAM_TYPE_PARTIAL_MSG;
        case BaseEventTypes.COMPLETE_MSG:
            return STREAM_TYPE_COMPLETE_MSG;
        case BaseEventTypes.RUN_LOG:
            return STREAM_TYPE_RUN_LOG;
        case BaseEventTypes.RUN_LOG_FINISH:
            return STREAM_TYPE_RUN_LOG;
        case BaseEventTypes.AGENT_STEP:
            return STREAM_TYPE_AGENT_STEP;
        case BaseEventTypes.AGENT_STEP_FINISH:
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
    createChatEventMessage(BaseEventTypes.PARTIAL_MSG, {
        id: msgId,
        msg: chunk.text
    });

export const createChatEventMessageCompleteMsg = (msg: string) =>
    createChatEventMessage(BaseEventTypes.COMPLETE_MSG, { msg });

export const createChatEventMessageErrorMsg = (error: Error | string) =>
    createChatEventMessage(BaseEventTypes.ERROR, { error });

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
            yield createChatEventMessage(BaseEventTypes.PARTIAL_MSG, {
                id: msgId,
                msg: chunk
            });
            if (onComplete) {
                buffer += chunk;
            }
        }
        yield createChatEventMessage(BaseEventTypes.PARTIAL_MSG_FINISH, {
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
