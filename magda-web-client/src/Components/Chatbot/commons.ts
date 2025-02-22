import type AsyncQueue from "@ai-zen/async-queue";
import type { ChatEventMessage } from "./Messaging";
import type { History, Location } from "history";
import ChatWebLLM from "./ChatWebLLM";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
export type LocationType = "DATASET_PAGE" | "DISTRIBUTION_PAGE" | "OTHERS";

/**
 * Store information might be useful for future message generation.
 * e.g. User might ask "Draw the results as a chart".
 * If we store previous query result, we will be able to regenerate chart from the previous result without redoing the query.
 * Why not store full conversation history? We have very limited context window (2K) when run LLM in browser.
 * Other data we might consider store in future: search result
 * @interface KeyContextData
 */
export interface KeyContextData {
    // latest query result
    queryResult: any;
}

export interface ChainInput {
    appName: string;
    question: string;
    queue: AsyncQueue<ChatEventMessage>;
    history: History;
    location: Location;
    model: ChatWebLLM;
    dataset: ParsedDataset | undefined;
    distribution: ParsedDistribution | undefined;
    keyContextData: KeyContextData;
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
