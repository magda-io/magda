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

let skipQuery: boolean = false;

export const setSkipQuery = (v: boolean) => (skipQuery = v);
export const getSkipQuery = () => skipQuery;

class AuthDecisionQueryClient {
    private authApiBaseUrl: string = "";

    constructor(authApiBaseUrl: string) {
        this.authApiBaseUrl = authApiBaseUrl;
    }

    async getAuthDecision(
        jwtToken: string | undefined,
        config: AuthDecisionReqConfig
    ): Promise<AuthDecision> {
        if (skipQuery) {
            console.warn(
                "WARNING: Skip OPA (policy engine) querying option is turned on! This is fine for testing or playing around, but this should NOT BE TURNED ON FOR PRODUCTION!"
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
            .concat(["v0", "opa", "decision"])
            .concat(urijs(config.operationUri).segmentCoded());

        const reqUri = baseUri.segmentCoded(urlSegments).search(queryParams);

        const fetchConfig: RequestInit = {
            method: usePost ? "POST" : "GET"
        };

        if (jwtToken) {
            fetchConfig.headers = {
                "X-Magda-Session": jwtToken
            };
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
