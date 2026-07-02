import urijs from "urijs";
import buildJwt from "./session/buildJwt.js";

interface ApiClientBaseConfig {
    baseApiUrl?: string;
}

interface JWTBasedConfigOptions extends ApiClientBaseConfig {
    jwtSecret?: string;
    userId?: string;
}

interface ApiKeyBasedConfigOptions extends ApiClientBaseConfig {
    apiKeyId?: string;
    apiKey?: string;
}

export type BaseApiClientConfig = JWTBasedConfigOptions &
    ApiKeyBasedConfigOptions;

export default abstract class BaseApiClient {
    public readonly authMode: "jwtToken" | "apiKey" | "noAuth";

    protected baseApiUrl: string;
    private readonly baseApiUri: urijs;
    protected jwtSecret: string;
    public readonly apiKeyId: string;
    protected apiKey: string;
    public readonly userId: string;

    constructor(options: BaseApiClientConfig) {
        this.baseApiUrl = options.baseApiUrl;
        if (!this.baseApiUrl) {
            throw new Error("baseApiUrl cannot be empty!");
        }
        this.baseApiUri = urijs(this.baseApiUrl);

        this.apiKey = options.apiKey;
        this.apiKeyId = options.apiKeyId;
        this.jwtSecret = options.jwtSecret;
        this.userId = options.userId;

        if (this.apiKey && this.apiKeyId) {
            this.authMode = "apiKey";
        } else if (this.jwtSecret && this.userId) {
            this.authMode = "jwtToken";
        } else {
            this.authMode = "noAuth";
        }
    }

    protected getBaseApiUri() {
        return this.baseApiUri.clone();
    }

    protected setHeader(
        headers: HeadersInit | undefined | null,
        headerName: string,
        headerValue: string
    ) {
        if (!headers) {
            headers = {};
        }
        if (headers instanceof Headers) {
            headers.set(headerName, headerValue);
            return headers;
        } else {
            (headers as any)[headerName] = headerValue;
            return headers;
        }
    }

    protected addAuthHeader(config?: RequestInit) {
        config = config ? config : {};
        switch (this.authMode) {
            case "apiKey":
                let headers = config.headers;
                headers = this.setHeader(
                    headers,
                    "X-Magda-API-Key-Id",
                    this.apiKeyId
                );
                headers = this.setHeader(
                    headers,
                    "X-Magda-API-Key",
                    this.apiKey
                );
                return {
                    ...config,
                    headers
                };
            case "jwtToken":
                return {
                    ...config,
                    headers: this.setHeader(
                        config.headers,
                        "X-Magda-Session",
                        buildJwt(this.jwtSecret, this.userId)
                    )
                };
            case "noAuth":
                return { ...config };
        }
    }
}
