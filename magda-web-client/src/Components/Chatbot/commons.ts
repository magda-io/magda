import type AsyncQueue from "@ai-zen/async-queue";
import type { ChatEventMessage } from "./Messaging";
import type { History, Location } from "history";
import ChatWebLLM from "./ChatWebLLM";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
export type LocationType = "DATASET_PAGE" | "DISTRIBUTION_PAGE" | "OTHERS";

export interface ChainInput {
    appName: string;
    question: string;
    queue: AsyncQueue<ChatEventMessage>;
    history: History;
    location: Location;
    model: ChatWebLLM;
    dataset: ParsedDataset | undefined;
    distribution: ParsedDistribution | undefined;
}

export function getLocationType(location: Location): LocationType {
    const { pathname } = location;
    if (pathname.indexOf("/dataset/") !== -1) {
        return "DATASET_PAGE";
    } else if (pathname.indexOf("/distribution/") !== -1) {
        return "DISTRIBUTION_PAGE";
    } else {
        return "OTHERS";
    }
}
