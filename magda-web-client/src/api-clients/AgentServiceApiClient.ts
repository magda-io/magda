import { LettaClient, Letta } from "@letta-ai/letta-client";
import * as lettaCode from "@letta-ai/letta-client/core";
import * as serializers from "@letta-ai/letta-client/serialization";
import * as errors from "@letta-ai/letta-client/errors";
import { Messages } from "@letta-ai/letta-client/api/resources/agents/resources/messages/client/Client";
import getAbsoluteUrl from "@magda/typescript-common/dist/getAbsoluteUrl.js";
import { config } from "../config";
import request from "helpers/request";
import * as stream from "stream";
import ServerError from "@magda/typescript-common/dist/ServerError";

interface AgentServiceApiClientOptions {
    fetcher?: lettaCode.FetchFunction;
}

export default class AgentServiceApiClient {
    public client: LettaClient;
    private agentServiceBaseUrl: string;
    private fetcher?: lettaCode.FetchFunction;

    constructor(options: AgentServiceApiClientOptions = {}) {
        this.fetcher = options?.fetcher ? options.fetcher : undefined;
        this.agentServiceBaseUrl = config.agentServiceBaseUrl;
        const absoluteUrl = getAbsoluteUrl("/letta", this.agentServiceBaseUrl);
        this.client = new LettaClient({ baseUrl: absoluteUrl });
    }

    private getRequestUrl(path: string) {
        return getAbsoluteUrl(path, this.agentServiceBaseUrl);
    }

    async createMessageStream(
        agentId: string,
        request: Letta.LettaStreamingRequest,
        requestOptions?: Messages.RequestOptions
    ) {
        return await this.createStream(
            this.getRequestUrl(
                `/agents/${encodeURIComponent(agentId)}/messages/stream`
            ),
            request,
            requestOptions
        );
    }

    async getCoreMemory(agentId: string) {
        const requestUrl = this.getRequestUrl(
            `/agents/${encodeURIComponent(agentId)}/core-memory/blocks`
        );
        return await request<Letta.Memory>("GET", requestUrl);
    }

    async existDatasetInterviewAgent(datasetId: string) {
        const requestUrl = this.getRequestUrl(
            `/datasets/${encodeURIComponent(datasetId)}/interviewAgent`
        );
        try {
            await request("GET", requestUrl);
            return true;
        } catch (e) {
            if ((e as ServerError)?.statusCode === 404) {
                return false;
            }
            throw e;
        }
    }

    async createDatasetInterviewAgentMessageStream(
        datasetId: string,
        request: Letta.LettaStreamingRequest,
        requestOptions?: Messages.RequestOptions
    ) {
        return await this.createStream(
            this.getRequestUrl(
                `/datasets/${encodeURIComponent(
                    datasetId
                )}/interviewAgent/messages/stream`
            ),
            request,
            requestOptions
        );
    }

    async getDatasetInterviewAgentMemoryBlocks(datasetId: string) {
        const requestUrl = this.getRequestUrl(
            `/datasets/${encodeURIComponent(datasetId)}/interviewAgent/blocks`
        );
        return await request<Letta.Block[]>("GET", requestUrl);
    }

    async initializeDatasetInterviewAgent(datasetId: string) {
        const requestUrl = this.getRequestUrl(
            `/datasets/${encodeURIComponent(datasetId)}/interviewAgent`
        );
        debugger;
        return await request<{
            agentId: string;
            sharableMemoryBlockIds: string[];
        }>("PUT", requestUrl);
    }

    public createStream(
        agentId: string,
        request: Letta.LettaStreamingRequest,
        requestOptions?: Messages.RequestOptions
    ): lettaCode.HttpResponsePromise<
        lettaCode.Stream<Letta.agents.LettaStreamingResponse>
    > {
        debugger;
        // return this.client.agents.messages.createStream(
        //     agentId,
        //     request,
        //     requestOptions
        // );
        return lettaCode.HttpResponsePromise.fromPromise(
            this.__createStream(agentId, request, requestOptions)
        );
    }

    private async __createStream(
        streamEndpoint: string,
        request: Letta.LettaStreamingRequest,
        requestOptions?: Messages.RequestOptions
    ): Promise<
        lettaCode.WithRawResponse<
            lettaCode.Stream<Letta.agents.LettaStreamingResponse>
        >
    > {
        const _response = await (this.fetcher ?? lettaCode.fetcher)<
            stream.Readable
        >({
            url: streamEndpoint,
            method: "POST",
            headers: {
                "X-Fern-Language": "JavaScript",
                "X-Fern-SDK-Name": "@letta-ai/letta-client",
                "X-Fern-SDK-Version": "0.1.181",
                "User-Agent": "@letta-ai/letta-client/0.1.181",
                "X-Fern-Runtime": lettaCode.RUNTIME.type,
                "X-Fern-Runtime-Version": lettaCode.RUNTIME.version,
                ...requestOptions?.headers
            },
            contentType: "application/json",
            requestType: "json",
            body: serializers.LettaStreamingRequest.jsonOrThrow(request, {
                unrecognizedObjectKeys: "strip"
            }),
            responseType: "sse",
            timeoutMs:
                requestOptions?.timeoutInSeconds != null
                    ? requestOptions.timeoutInSeconds * 1000
                    : 60000,
            maxRetries: requestOptions?.maxRetries,
            abortSignal: requestOptions?.abortSignal
        });
        if (_response.ok) {
            return {
                data: new lettaCode.Stream({
                    stream: _response.body,
                    parse: async (data) => {
                        return serializers.agents.LettaStreamingResponse.parseOrThrow(
                            data,
                            {
                                unrecognizedObjectKeys: "passthrough",
                                allowUnrecognizedUnionMembers: true,
                                allowUnrecognizedEnumValues: true,
                                skipValidation: true,
                                breadcrumbsPrefix: ["response"]
                            }
                        );
                    },
                    signal: requestOptions?.abortSignal,
                    eventShape: {
                        type: "sse",
                        streamTerminator: "[DONE]"
                    }
                }),
                rawResponse: _response.rawResponse
            };
        }

        if (_response.error.reason === "status-code") {
            switch (_response.error.statusCode) {
                case 422:
                    throw new Letta.UnprocessableEntityError(
                        serializers.HttpValidationError.parseOrThrow(
                            _response.error.body,
                            {
                                unrecognizedObjectKeys: "passthrough",
                                allowUnrecognizedUnionMembers: true,
                                allowUnrecognizedEnumValues: true,
                                skipValidation: true,
                                breadcrumbsPrefix: ["response"]
                            }
                        ),
                        _response.rawResponse
                    );
                default:
                    throw new errors.LettaError({
                        statusCode: _response.error.statusCode,
                        body: _response.error.body,
                        rawResponse: _response.rawResponse
                    });
            }
        }

        switch (_response.error.reason) {
            case "non-json":
                throw new errors.LettaError({
                    statusCode: _response.error.statusCode,
                    body: _response.error.rawBody,
                    rawResponse: _response.rawResponse
                });
            case "timeout":
                throw new errors.LettaTimeoutError(
                    `Timeout exceeded when calling POST ${streamEndpoint}.`
                );
            case "unknown":
                throw new errors.LettaError({
                    message: _response.error.errorMessage,
                    rawResponse: _response.rawResponse
                });
        }
    }
}

let agentServiceApiClient: AgentServiceApiClient;

export const getAgentServiceApiClient = () =>
    agentServiceApiClient ? agentServiceApiClient : new AgentServiceApiClient();
