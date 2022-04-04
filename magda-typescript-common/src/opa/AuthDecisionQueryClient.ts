import fetch from "isomorphic-fetch";
import urijs from "urijs";
import AuthDecision, { UnconditionalTrueDecision } from "./AuthDecision";

export type AuthDecisionReqConfig = {
    operationUri: string;
    resourceUri?: string;
    unknowns?: string[];
    rawAst?: boolean;
    explain?: string;
    pretty?: boolean;
    humanReadable?: boolean;
    concise?: boolean;
    input?: {
        [key: string]: any;
    };
};

class AuthDecisionQueryClient {
    private readonly authApiBaseUrl: string = "";
    public readonly skipQuery: boolean;

    public static fetchOptions: RequestInit = {};
    public fetchOptions: RequestInit = {};

    constructor(authApiBaseUrl: string, skipQuery: boolean = false) {
        this.authApiBaseUrl = authApiBaseUrl;
        this.skipQuery = skipQuery;
        if (this.skipQuery) {
            console.warn(
                "WARNING: Skip OPA (policy engine) querying option is turned on! This is fine for testing or playing around, but this should NOT BE TURNED ON FOR PRODUCTION!"
            );
        }
    }

    async getAuthDecision(
        config: AuthDecisionReqConfig,
        jwtToken?: string
    ): Promise<AuthDecision> {
        if (this.skipQuery) {
            console.warn(
                "WARNING: return unconditional true as Skip OPA (policy engine) querying option is turned on!"
            );
            return UnconditionalTrueDecision;
        }

        const queryParams: { [key: string]: any } = {};

        if (config?.rawAst) {
            queryParams.rawAst = config.rawAst;
        }
        if (config?.concise) {
            queryParams.concise = config.concise;
        }
        if (config?.explain) {
            queryParams.explain = config.explain;
        }
        if (config?.pretty) {
            queryParams.pretty = config.pretty;
        }
        if (config?.humanReadable) {
            queryParams.humanReadable = config.humanReadable;
        }
        if (config?.unknowns && !config.unknowns.length) {
            queryParams.unknowns = "";
        }

        const usePost =
            config?.input || config?.unknowns?.length || config?.resourceUri;

        const baseUri = urijs(this.authApiBaseUrl);
        const urlSegments = baseUri
            .segmentCoded()
            .concat(["opa", "decision"])
            .concat(urijs(config.operationUri).segmentCoded());

        const reqUri = baseUri.segmentCoded(urlSegments).search(queryParams);

        const fetchConfig: RequestInit = {
            headers: {} as Record<string, string>,
            ...AuthDecisionQueryClient.fetchOptions,
            ...this.fetchOptions,
            method: usePost ? "POST" : "GET"
        };

        if (jwtToken) {
            (fetchConfig.headers as Record<string, string>)[
                "X-Magda-Session"
            ] = jwtToken;
        }

        const requestData: { [key: string]: any } = {};

        if (config?.input) {
            requestData.input = config.input;
        }

        if (config?.unknowns?.length) {
            requestData.unknowns = config.unknowns;
        }

        if (config?.resourceUri) {
            requestData.resourceUri = config.resourceUri;
        }

        if (usePost) {
            fetchConfig.body = JSON.stringify(requestData);
            (fetchConfig.headers as Record<string, string>)["Content-Type"] =
                "application/json";
        }

        const res = await fetch(reqUri.toString(), fetchConfig);
        if (res.status != 200) {
            const bodyText = await res.text();
            const errorMsg = `Failed to retrieve auth decision for operation \`${config.operationUri}\` from policy engine: ${bodyText}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        const data = await res.json();

        return AuthDecision.fromJson(data);
    }
}

export default AuthDecisionQueryClient;
