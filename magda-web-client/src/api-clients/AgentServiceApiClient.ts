import { LettaClient, Letta } from "@letta-ai/letta-client";
import { config } from "../config";

// -- Letta
interface RequestOptions {
    /** The maximum time to wait for a response in seconds. */
    timeoutInSeconds?: number;
    /** The number of times to retry the request. Defaults to 2. */
    maxRetries?: number;
    /** A hook to abort the request. */
    abortSignal?: AbortSignal;
    /** Additional headers to include in the request. */
    headers?: Record<string, string>;
}

export default class AgentServiceApiClient {
    public client: LettaClient;
    constructor() {
        const { agentServiceBaseUrl } = config;
        this.client = new LettaClient({ baseUrl: agentServiceBaseUrl });
    }

    async createMessageStream(
        agentId: string,
        request: Letta.LettaStreamingRequest,
        requestOptions?: RequestOptions
    ) {
        return await this.client.agents.messages.createStream(
            agentId,
            request,
            requestOptions
        );
    }
}

let agentServiceApiClient: AgentServiceApiClient;

export const getAgentServiceApiClient = () =>
    agentServiceApiClient ? agentServiceApiClient : new AgentServiceApiClient();
