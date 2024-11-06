import type AsyncQueue from "@ai-zen/async-queue";
import type { ChatEventMessage } from "./Messaging";
import type { History } from "history";
export type LocationType = "DATASET_PAGE" | "DISTRIBUTION_PAGE" | "OTHERS";

export interface LocationInfo {
    url: string;
    type: LocationType;
}

export interface ChainInput {
    agentName: string;
    question: string;
    queue: AsyncQueue<ChatEventMessage>;
    history: History;
    location: LocationInfo;
}
