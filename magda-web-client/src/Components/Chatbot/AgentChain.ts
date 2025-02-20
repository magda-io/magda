import { v4 as uuidv4 } from "uuid";
import { ChainInput, KeyContextData } from "./commons";
import { InitProgressCallback, InitProgressReport } from "@mlc-ai/web-llm";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { Runnable, RunnableLambda } from "@langchain/core/runnables";
import ChatWebLLM, { WebLLMInputs } from "./ChatWebLLM";
import AsyncQueue from "@ai-zen/async-queue";
import {
    CommonInputType,
    ChatEventMessage,
    createChatEventMessage,
    EVENT_TYPE_PARTIAL_MSG,
    EVENT_TYPE_PARTIAL_MSG_FINISH,
    EVENT_TYPE_ERROR,
    createChatEventMessageErrorMsg
} from "./Messaging";
import { History, Location } from "history";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
import createTools from "./tools";

class AgentChain {
    static agentChain: AgentChain | null = null;
    static llmLoadProgressCallbacks: InitProgressCallback[] = [];
    static create(
        appName: string,
        navLocation: Location,
        navHistory: History,
        dataset: ParsedDataset | undefined,
        distribution: ParsedDistribution | undefined,
        loadProgressCallback?: InitProgressCallback,
        errorHandler?: (e) => void
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
                dataset,
                distribution,
                (report) => {
                    AgentChain.llmLoadProgressCallbacks.forEach((cb) =>
                        cb(report)
                    );
                }
            );
            AgentChain.agentChain.initialize(errorHandler);
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
    public chatHistory: BaseMessage[] = [];
    public navHistory: History;
    public navLocation: Location;
    public appName: string;
    public dataset: ParsedDataset | undefined;
    public distribution: ParsedDistribution | undefined;
    public keyContextData: KeyContextData = {
        queryResult: undefined
    };
    public debug: boolean = false;
    public directModelAccess: boolean = false;
    public chain: Runnable<CommonInputType, string | null | undefined | void>;

    constructor(
        appName: string,
        navLocation: Location,
        navHistory: History,
        dataset: ParsedDataset | undefined,
        distribution: ParsedDistribution | undefined,
        loadProgressCallback?: InitProgressCallback
    ) {
        this.loadProgressCallback = loadProgressCallback;
        this.model = ChatWebLLM.createDefaultModel({
            loadProgressCallback: this.onProgress.bind(this)
        });
        this.appName = appName;
        this.navHistory = navHistory;
        this.navLocation = navLocation;
        this.dataset = dataset;
        this.distribution = distribution;
        this.chain = this.createChain();
        // for debug purpose;
        (window as any).chatBotAgentChain = this;
    }

    async updateModelConfig(
        modelConfig: Partial<WebLLMInputs>,
        errorHandler: (e) => void
    ) {
        this.onProgress({
            progress: 0,
            timeElapsed: 0,
            text: "Unloading model in order to apply new model config..."
        });
        this.model.getEngine().then((engine) => engine.unload());
        this.model = ChatWebLLM.createDefaultModel({
            ...modelConfig,
            loadProgressCallback: this.onProgress.bind(this)
        });
        await this.initialize(errorHandler);
    }

    async initialize(errorHandler?: (e) => void) {
        try {
            await this.model.initialize();
        } catch (e) {
            if (errorHandler) {
                errorHandler(e);
            } else {
                throw e;
            }
        }
    }

    enableDirectModelAccess(modelConfig: Partial<WebLLMInputs> = {}) {
        this.model = ChatWebLLM.createDefaultModel({
            ...modelConfig,
            loadProgressCallback: this.onProgress.bind(this)
        });
        this.directModelAccess = true;
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

    setDataset(dataset: ParsedDataset | undefined) {
        this.dataset = dataset;
    }

    setDistribution(distribution: ParsedDistribution | undefined) {
        this.distribution = distribution;
    }

    setLoadProgressCallback(loadProgressCallback?: InitProgressCallback) {
        this.loadProgressCallback = loadProgressCallback;
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
            model: this.model,
            dataset: this.dataset,
            distribution: this.distribution,
            keyContextData: this.keyContextData
        };

        new Promise(async (resolve, reject) => {
            const msgId = uuidv4();
            let buffer = "";
            let partialMsgSent = false;

            const stream = await (this.directModelAccess
                ? this.model.stream(input.question)
                : this.chain.stream(input));

            for await (const chunk of stream) {
                if (chunk === null || typeof chunk === "undefined") {
                    continue;
                }
                partialMsgSent = true;
                const chunkText =
                    typeof chunk === "string" ? chunk : chunk.content;
                queue.push(
                    createChatEventMessage(EVENT_TYPE_PARTIAL_MSG, {
                        id: msgId,
                        msg: chunkText
                    })
                );
                buffer += chunkText;
            }
            if (partialMsgSent) {
                queue.push(
                    createChatEventMessage(EVENT_TYPE_PARTIAL_MSG_FINISH, {
                        id: msgId
                    })
                );
            }
            queue.done();
            if (this.debug) {
                this.chatHistory.push(new AIMessage({ content: buffer }));
            }
            if (this.directModelAccess) {
                console.log(buffer);
            }
            resolve(buffer);
        }).catch((e) => {
            createChatEventMessage(EVENT_TYPE_ERROR, {
                error: e
            });
        });
        return queue;
    }

    createChain() {
        return RunnableLambda.from(async (input: ChainInput) => {
            const { queue } = input;
            try {
                const tools = await createTools(input);
                if (this.debug) {
                    console.log("available tools: ", tools);
                }
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
            } catch (e) {
                queue.push(createChatEventMessageErrorMsg(e as Error));
                return;
            }
        });
    }
}

export default AgentChain;
