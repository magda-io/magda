import type AsyncQueue from "@ai-zen/async-queue";
import type { ChatEventMessage } from "./Messaging";
import type { History, Location } from "history";
import ChatWebLLM from "./ChatWebLLM";
export type LocationType = "DATASET_PAGE" | "DISTRIBUTION_PAGE" | "OTHERS";

export interface ChainInput {
    appName: string;
    question: string;
    queue: AsyncQueue<ChatEventMessage>;
    history: History;
    location: Location;
    model: ChatWebLLM;
}
