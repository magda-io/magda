export const BaseEventTypes = {
    CLOSE: "close",
    ERROR: "error",
    PARTIAL_MSG: "partial_msg",
    PARTIAL_MSG_FINISH: "partial_msg_finish",
    COMPLETE_MSG: "complete_msg",
    RUN_LOG: "run_log",
    RUN_LOG_FINISH: "run_log_finish",
    AGENT_STEP: "agent_step",
    AGENT_STEP_FINISH: "agent_step_finish",
    PING: "ping",
    // a message has been sent to the agent for process and should be rendered at frontend messaging area
    CLIENT_MESSAGE_SENT: "client_message_sent",
    CLIENT_RESET_MESSAGE_QUEUE: "reset_client_message_queue",
    CLIENT_RESET_MESSAGE_PROCESSING_STATE:
        "reset_client_message_processing_state"
} as const;

export type BASE_EVENT_TYPE = typeof BaseEventTypes[keyof typeof BaseEventTypes];

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CustomEventTypes {} // empty for extension

export type CUSTOM_EVENT_TYPE = CustomEventTypes[keyof CustomEventTypes];

export type EVENT_TYPE = BASE_EVENT_TYPE | CUSTOM_EVENT_TYPE;
