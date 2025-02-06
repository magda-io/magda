/**
 * Modified from https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-community/src/chat_models/webllm.ts
 * MIT license
 */
import type { BaseChatModelParams } from "@langchain/core/language_models/chat_models";
import { SimpleChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseLanguageModelCallOptions } from "@langchain/core/language_models/base";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { BaseMessage, AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import * as webllm from "@mlc-ai/web-llm";
import { ChatCompletionMessageParam } from "@mlc-ai/web-llm/lib/openai_api_protocols";
import type {
    ExtensionMLCEngineConfig,
    ServiceWorkerMLCEngine
} from "@mlc-ai/web-llm/lib/extension_service_worker";
import { config } from "../../config";

const defaultExtensionId = config.llmExtensionId;
const defaultKeepAliveMs = 10000;

export interface WebLLMInputs extends BaseChatModelParams {
    config?: ExtensionMLCEngineConfig;
    keepAliveMs?: number;
    loadProgressCallback?: webllm.InitProgressCallback;
    chatOptions?: webllm.ChatOptions;
    temperature?: number;
    model: string;
}

export interface WebLLMToolArgDef {
    name: string;
    type:
        | "string"
        | "number"
        | "integer"
        | "object"
        | "array"
        | "boolean"
        | "null";
    description?: string;
}

export interface WebLLMTool {
    // can be async function. With or without parameters.
    func: Function;
    /**
     * The name of the function to be called. Must be a-z, A-Z, 0-9, or contain
     * underscores and dashes, with a maximum length of 64.
     */
    name: string;
    /**
     * A description of what the function does, used by the model to choose when and
     * how to call the function.
     */
    description?: string;
    /**
     * The parameters the functions accepts.
     *
     * Omitting `parameters` defines a function with an empty parameter list.
     */
    parameters?: WebLLMToolArgDef[];

    /**
     * Optionally specify which parameters are compulsory
     */
    requiredParameters?: string[];
}

export interface WebLLMToolCallResult<T = any> {
    // the name of the tool called
    name: string;
    value: T;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WebLLMCallOptions extends BaseLanguageModelCallOptions {}

/**
 * To use this model you need to have the `@mlc-ai/web-llm` module installed.
 * This can be installed using `npm install -S @mlc-ai/web-llm`.
 *
 * You can see a list of available model records here:
 * https://github.com/mlc-ai/web-llm/blob/main/src/config.ts
 * @example
 * ```typescript
 * // Initialize the ChatWebLLM model with the model record.
 * const model = new ChatWebLLM({
 *   model: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
 *   chatOptions: {
 *     temperature: 0.5,
 *   },
 * });
 *
 * // Call the model with a message and await the response.
 * const response = await model.invoke([
 *   new HumanMessage({ content: "My name is John." }),
 * ]);
 * ```
 */

const DEFAULT_MODEL_CONFIG: WebLLMInputs = {
    model: "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
    chatOptions: {
        temperature: 0
        // context_window_size: 32768,
        // sliding_window_size: -1
    }
};
export default class ChatWebLLM extends SimpleChatModel<WebLLMCallOptions> {
    static inputs: WebLLMInputs;

    protected engine: ServiceWorkerMLCEngine | null = null;
    protected enginePromise: Promise<ServiceWorkerMLCEngine | null> = Promise.resolve(
        null
    );

    config: ExtensionMLCEngineConfig;

    chatOptions?: webllm.ChatOptions;

    temperature?: number;

    model: string;

    keepAliveMs: number;

    loadProgressCallback?: webllm.InitProgressCallback;

    loadProgress?: webllm.InitProgressReport;

    static lc_name() {
        return "ChatWebLLM";
    }

    static createDefaultModel(modelConfig: Partial<WebLLMInputs> = {}) {
        const config = { ...DEFAULT_MODEL_CONFIG, ...modelConfig };
        if (modelConfig?.chatOptions) {
            config.chatOptions = {
                ...DEFAULT_MODEL_CONFIG.chatOptions,
                ...modelConfig.chatOptions
            };
        }
        return new ChatWebLLM(config);
    }

    constructor(inputs: WebLLMInputs) {
        super(inputs);
        this.config = inputs?.config ? inputs.config : {};
        this.chatOptions = inputs.chatOptions;
        this.model = inputs.model;
        this.temperature = inputs.temperature;
        this.keepAliveMs = inputs?.keepAliveMs
            ? inputs.keepAliveMs
            : defaultKeepAliveMs;
        this.loadProgressCallback = inputs?.loadProgressCallback;
    }

    private createEngine() {
        const { extensionId } = this.config;

        return new webllm.ExtensionServiceWorkerMLCEngine(
            {
                ...this.config,
                extensionId: extensionId ? extensionId : defaultExtensionId,
                onDisconnect: this.onDisconnect.bind(this),
                initProgressCallback: this.onLoadProgress.bind(this)
            },
            this.keepAliveMs
        );
    }

    async initialize() {
        const engine = this.createEngine();
        this.engine = engine;
        this.enginePromise = Promise.resolve(engine).then(async (engine) => {
            await engine.reload(this.model, this.chatOptions);
            return engine;
        });
        return (await this.enginePromise) as ServiceWorkerMLCEngine;
    }

    async getEngine(): Promise<ServiceWorkerMLCEngine> {
        const engine = await this.enginePromise;
        if (engine) {
            return engine;
        } else {
            return await this.initialize();
        }
    }

    onDisconnect() {
        this.engine = null;
        this.enginePromise = Promise.resolve(null);
        if (this.config?.onDisconnect) {
            this.config.onDisconnect();
        }
    }

    onLoadProgress(report: webllm.InitProgressReport) {
        this.loadProgress = { ...report };
        if (this.loadProgressCallback) {
            this.loadProgressCallback(this.loadProgress);
        }
        if (this.config?.initProgressCallback) {
            this.config.initProgressCallback(this.loadProgress);
        }
    }

    _llmType() {
        return "web-llm";
    }

    async reload(modelId: string, newChatOpts?: webllm.ChatOptions) {
        const engine = await this.enginePromise;
        if (!engine) {
            return engine;
        }
        await engine.reload(modelId, newChatOpts);
        return engine;
    }

    async *_streamResponseChunks(
        messages: BaseMessage[],
        options: this["ParsedCallOptions"],
        runManager?: CallbackManagerForLLMRun
    ): AsyncGenerator<ChatGenerationChunk> {
        const messagesInput: ChatCompletionMessageParam[] = messages.map(
            (message) => {
                if (typeof message.content !== "string") {
                    throw new Error(
                        "ChatWebLLM does not support non-string message content in sessions."
                    );
                }
                const langChainType = message._getType();
                let role;
                if (langChainType === "ai") {
                    role = "assistant" as const;
                } else if (langChainType === "human") {
                    role = "user" as const;
                } else if (langChainType === "system") {
                    role = "system" as const;
                } else {
                    throw new Error(
                        "Function, tool, and generic messages are not supported."
                    );
                }
                return {
                    role,
                    content: message.content
                };
            }
        );

        const engine = await this.getEngine();
        const stream = await engine.chat.completions.create({
            stream: true,
            messages: messagesInput,
            stop: options.stop,
            logprobs: true
        });
        for await (const chunk of stream) {
            // Last chunk has undefined content
            const text = chunk.choices[0].delta.content ?? "";
            yield new ChatGenerationChunk({
                text,
                message: new AIMessageChunk({
                    content: text,
                    additional_kwargs: {
                        logprobs: chunk.choices[0].logprobs,
                        finish_reason: chunk.choices[0].finish_reason
                    }
                })
            });
            await runManager?.handleLLMNewToken(text);
        }
    }

    async _call(
        messages: BaseMessage[],
        options: this["ParsedCallOptions"],
        runManager?: CallbackManagerForLLMRun
    ): Promise<string> {
        const chunks = [] as string[];
        for await (const chunk of this._streamResponseChunks(
            messages,
            options,
            runManager
        )) {
            chunks.push(chunk.text);
        }
        return chunks.join("");
    }

    async invokeTool<T = any>(
        userMessage: webllm.ChatCompletionUserMessageParam | string,
        tools: WebLLMTool[],
        thisObj: any = undefined
    ): Promise<WebLLMToolCallResult<T> | undefined> {
        const toolDefs = tools.map((item) => {
            const { func, parameters, requiredParameters, ...def } = item;
            const functionDef: webllm.FunctionDefinition = {
                ...def
            };
            if (parameters?.length) {
                const properties = {};
                parameters.forEach((item) => {
                    const { name, ...parameterTypeDef } = item;
                    properties[name] = parameterTypeDef;
                });
                functionDef.parameters = {
                    type: "object",
                    properties,
                    ...(requiredParameters?.length
                        ? { required: requiredParameters }
                        : {})
                };
            }
            return {
                type: "function" as const,
                function: functionDef
            };
        });
        const request: webllm.ChatCompletionRequest = {
            stream: false,
            messages:
                typeof userMessage === "string"
                    ? [
                          {
                              role: "user",
                              content: userMessage
                          }
                      ]
                    : [userMessage],
            tool_choice: "auto",
            tools: toolDefs
        };
        const engine = await this.getEngine();
        const reply = await engine.chat.completions.create(request);
        const finish_reason = reply?.choices?.[0]?.finish_reason;
        switch (finish_reason) {
            case "length":
                throw new Error(
                    "The LLM failed to process your request because it exceeds the context window limit."
                );
            case "abort":
                throw new Error(
                    "The LLM could not process your request as it was aborted."
                );
            case "stop":
                throw new Error(
                    "The LLM could not process your request as it was stopped."
                );
        }
        if (!reply?.choices?.[0]?.message?.tool_calls?.length) {
            return undefined;
        }
        const toolCall = reply.choices[0].message.tool_calls[0].function;
        const funcName = toolCall.name;
        const funcArgsObj: Record<string, any> = toolCall?.arguments?.length
            ? JSON.parse(toolCall.arguments)
            : {};
        const toolCalled = tools.find((tool) => tool.name === funcName);
        if (!toolCalled) {
            throw new Error(
                `Invalid LLM response: Cannot locate tool with name: ${funcName}`
            );
        }
        const funcArgs = (toolCalled?.parameters?.length
            ? toolCalled.parameters
            : []
        ).map((item) => funcArgsObj?.[item.name]);
        const result = await toolCalled.func.call(thisObj, ...funcArgs);
        return {
            name: toolCalled.name,
            value: result as T
        };
    }
}
