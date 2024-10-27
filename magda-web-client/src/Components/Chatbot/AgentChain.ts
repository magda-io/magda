import { v4 as uuidv4 } from "uuid";
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
import { searchDatasets } from "api-clients/SearchApis";
import toYaml from "../../libs/toYaml";
import AsyncQueue from "@ai-zen/async-queue";
import {
    CommonInputType,
    ChatEventMessage,
    createChatEventMessageCompleteMsg,
    createChatEventMessage,
    strChain2PartialMessageChain,
    EVENT_TYPE_PARTIAL_MSG,
    EVENT_TYPE_PARTIAL_MSG_FINISH
} from "./Messaging";

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
    static create(loadProgressCallback?: InitProgressCallback) {
        if (AgentChain.agentChain) {
            if (loadProgressCallback) {
                AgentChain.llmLoadProgressCallbacks.push(loadProgressCallback);
            }
            return AgentChain.agentChain;
        } else {
            if (loadProgressCallback) {
                AgentChain.llmLoadProgressCallbacks.push(loadProgressCallback);
            }
            AgentChain.agentChain = new AgentChain((report) => {
                AgentChain.llmLoadProgressCallbacks.forEach((cb) => cb(report));
            });
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

    public chain: Runnable<CommonInputType, string>;

    constructor(loadProgressCallback?: InitProgressCallback) {
        this.loadProgressCallback = loadProgressCallback;
        this.model = new ChatWebLLM({
            model: "Qwen2-7B-Instruct-q4f16_1-MLC",
            loadProgressCallback: this.onProgress.bind(this),
            chatOptions: {
                temperature: 0
                // context_window_size: 32768,
                // sliding_window_size: -1
            }
        });
        this.chain = this.createChain();
    }

    onProgress(progressReport: InitProgressReport) {
        this.loadProgress = progressReport;
        if (this.loadProgressCallback) {
            this.loadProgressCallback(progressReport);
        }
    }

    async retrieveDatasets(question: string) {
        const notFound = "No datasets found.";
        if (!question) {
            return notFound;
        }
        const result = await searchDatasets({ q: question, limit: 3 });
        if (!result?.dataSets?.length) {
            return notFound;
        }
        const datasets = result.dataSets.map((item) => ({
            datasetTitle: item.title,
            description: item.description,
            distributions: item.distributions.map((dist) => ({
                title: dist.title,
                description: dist.description,
                downloadURL: dist.downloadURL,
                format: dist.format
            }))
        }));
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 3000,
            chunkOverlap: 1
        });
        return (
            await Promise.all(
                datasets
                    .map((item) => toYaml(item))
                    .map(async (item) => {
                        const doc = await splitter.createDocuments([item]);
                        return doc[0].pageContent;
                    })
            )
        ).join("\n");
    }

    async stream(question: string): Promise<AsyncIterable<ChatEventMessage>> {
        const queue = new AsyncQueue<ChatEventMessage>();
        const stream = await this.chain.stream({
            question,
            queue
        });

        new Promise(async (resolve, reject) => {
            const msgId = uuidv4();
            let buffer = "";

            for await (const chunk of stream) {
                queue.push(
                    createChatEventMessage(EVENT_TYPE_PARTIAL_MSG, {
                        id: msgId,
                        msg: chunk
                    })
                );
                buffer += chunk;
            }
            queue.push(
                createChatEventMessage(EVENT_TYPE_PARTIAL_MSG_FINISH, {
                    id: msgId
                })
            );
            queue.done();
            this.chatHistory.push(new AIMessage({ content: buffer }));
            resolve(buffer);
        });
        return queue;
    }

    createChain() {
        const promptTemplate = ChatPromptTemplate.fromMessages([
            ["system", systemPromptTemplate],
            new MessagesPlaceholder("chat_history"),
            ["human", "{question}"]
        ]);

        function isGeneralConversation(question: string) {
            return ["hello", "hi", "hey", "how are you"].some(
                (greeting) => question.toLowerCase().indexOf(greeting) !== -1
            );
        }

        return RunnableSequence.from([
            new RunnableLambda({
                func: async (input: CommonInputType) => {
                    const qText =
                        typeof input.question === "string"
                            ? input.question.trim()
                            : "";
                    const chatHistory = [...this.chatHistory];
                    this.chatHistory.push(
                        new HumanMessage({ content: input.question })
                    );
                    let relevantDatasets = "";
                    if (isGeneralConversation(qText)) {
                        relevantDatasets =
                            "No dataset required for answering user's inquiry.";
                    } else {
                        input.queue.push(
                            createChatEventMessageCompleteMsg(
                                "Querying relevant datasets, one moment please..."
                            )
                        );
                        relevantDatasets = await this.retrieveDatasets(qText);
                        input.queue.push(
                            createChatEventMessageCompleteMsg(
                                "Let me think about it, one moment..."
                            )
                        );
                    }
                    return {
                        queue: input.queue,
                        question: qText,
                        chat_history: chatHistory,
                        relevant_datasets: relevantDatasets,
                        today_date: new Date().toLocaleString()
                    };
                }
            }),
            promptTemplate,
            RunnableLambda.from((input) => {
                console.log("propmt:", input?.messages?.[0]?.content);
                return input;
            }),
            this.model,
            new StringOutputParser()
        ]);
    }
}

export default AgentChain;
