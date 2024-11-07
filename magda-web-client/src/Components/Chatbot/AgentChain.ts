import { v4 as uuidv4 } from "uuid";
import { getLocationType, ChainInput } from "./commons";
import {
    ChatPromptTemplate,
    MessagesPlaceholder
} from "@langchain/core/prompts";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { InitProgressCallback, InitProgressReport } from "@mlc-ai/web-llm";
import { HumanMessage, BaseMessage, AIMessage } from "@langchain/core/messages";
import {
    RunnableSequence,
    Runnable,
    RunnableLambda,
    RunnableConfig
} from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import ChatWebLLM from "./ChatWebLLM";
import toYaml from "../../libs/toYaml";
import AsyncQueue from "@ai-zen/async-queue";
import {
    CommonInputType,
    ChatEventMessage,
    createChatEventMessageCompleteMsg,
    createChatEventMessage,
    strChain2PartialMessageChain,
    EVENT_TYPE_PARTIAL_MSG,
    EVENT_TYPE_PARTIAL_MSG_FINISH,
    EVENT_TYPE_ERROR
} from "./Messaging";
import { History, Location } from "history";
import calculateChain from "./chains/calculator";
import defaultAgent from "./tools/defaultAgent";
import searchDatasets from "./tools/searchDatasets";

const systemPromptTemplate = `You must identify yourself as "Magda", an AI assistant designed to help users to locate relevant datasets and answer questions based on the information in the datasets.
- You need to answer user's latest question based on chat history and possible relevant datasets in the context section below.
- When user's question is a general conversation, you should respond with a greeting.
- When possible, you should output your answer in markdown format to present information in a visually appealing manner.
- If you don't know the answer, you should just say that you don't know, you will not try to make up an answer.
- You can only respond with dataset information available (if any) in the context section below. Do not mention any other datasets unless they are list in context section below.

## Context:
The current date and time is: {today_date}. 
Possible relevant datasets:
{relevant_datasets}
`;

class AgentChain {
    static agentChain: AgentChain | null = null;
    static llmLoadProgressCallbacks: InitProgressCallback[] = [];
    static create(
        appName: string,
        navLocation: Location,
        navHistory: History,
        loadProgressCallback?: InitProgressCallback
    ) {
        if (AgentChain.agentChain) {
            if (loadProgressCallback) {
                AgentChain.llmLoadProgressCallbacks.push(loadProgressCallback);
            }
            return AgentChain.agentChain;
        } else {
            if (loadProgressCallback) {
                AgentChain.llmLoadProgressCallbacks.push(loadProgressCallback);
            }
            AgentChain.agentChain = new AgentChain(
                appName,
                navLocation,
                navHistory,
                (report) => {
                    AgentChain.llmLoadProgressCallbacks.forEach((cb) =>
                        cb(report)
                    );
                }
            );
            AgentChain.agentChain.model.initialize();
            return AgentChain.agentChain;
        }
    }
    static removeLLMLoadProgressCallback(callback: InitProgressCallback) {
        const index = AgentChain.llmLoadProgressCallbacks.indexOf(callback);
        if (index !== -1) {
            AgentChain.llmLoadProgressCallbacks.splice(index, 1);
        }
    }

    public model: ChatWebLLM;
    public loadProgress?: InitProgressReport;
    private loadProgressCallback?: InitProgressCallback;
    private chatHistory: BaseMessage[] = [];
    private navHistory: History;
    private navLocation: Location;
    private appName: string;

    public chain: Runnable<CommonInputType, string | null | undefined | void>;

    constructor(
        appName: string,
        navLocation: Location,
        navHistory: History,
        loadProgressCallback?: InitProgressCallback
    ) {
        this.loadProgressCallback = loadProgressCallback;
        this.model = ChatWebLLM.createDefaultModel({
            loadProgressCallback: this.onProgress.bind(this)
        });
        this.appName = appName;
        this.navHistory = navHistory;
        this.navLocation = navLocation;
        this.chain = this.createChain();
    }

    setAppName(appName: string) {
        this.appName = appName;
    }

    setNavLocation(location: Location) {
        this.navLocation = location;
    }

    setNavHistory(history: History) {
        this.navHistory = history;
    }

    onProgress(progressReport: InitProgressReport) {
        this.loadProgress = progressReport;
        if (this.loadProgressCallback) {
            this.loadProgressCallback(progressReport);
        }
    }

    async stream(question: string): Promise<AsyncIterable<ChatEventMessage>> {
        const queue = new AsyncQueue<ChatEventMessage>();
        const input: ChainInput = {
            question,
            queue,
            appName: this.appName,
            location: this.navLocation,
            history: this.navHistory,
            model: this.model
        };

        new Promise(async (resolve, reject) => {
            const msgId = uuidv4();
            let buffer = "";
            let partialMsgSent = false;

            const stream = await this.chain.stream(input);

            for await (const chunk of stream) {
                if (chunk === null || typeof chunk === "undefined") {
                    continue;
                }
                partialMsgSent = true;
                queue.push(
                    createChatEventMessage(EVENT_TYPE_PARTIAL_MSG, {
                        id: msgId,
                        msg: chunk
                    })
                );
                buffer += chunk;
            }
            if (partialMsgSent) {
                queue.push(
                    createChatEventMessage(EVENT_TYPE_PARTIAL_MSG_FINISH, {
                        id: msgId
                    })
                );
            }
            queue.done();
            this.chatHistory.push(new AIMessage({ content: buffer }));
            resolve(buffer);
        }).catch((e) => {
            createChatEventMessage(EVENT_TYPE_ERROR, {
                error: e
            });
        });
        return queue;
    }

    createTools() {
        const type = getLocationType(this.navLocation);
        switch (type) {
            case "DATASET_PAGE":
                return [searchDatasets, defaultAgent];
            case "DISTRIBUTION_PAGE":
                return [searchDatasets, defaultAgent];
            default:
                return [searchDatasets, defaultAgent];
        }
    }

    createChain() {
        return RunnableLambda.from(async (input: ChainInput) => {
            const tools = this.createTools();
            const result = await this.model.invokeTool(
                input.question,
                tools,
                input
            );
            const value = result?.value;
            if (typeof value === "undefined" || value === null) {
                return;
            }
            return `${value}`;
        });
    }
}

export default AgentChain;
