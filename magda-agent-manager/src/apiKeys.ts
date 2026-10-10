import jwt from "jsonwebtoken";

export interface ManagedApiKey {
    id: string;
    key: string;
}

export interface ApiKeyClientOptions {
    authApiUrl: string;
    jwtSecret: string;
    systemUserId: string;
    name: string;
}

export class ManagedApiKeyClient {
    private readonly baseUrl: string;

    constructor(private readonly options: ApiKeyClientOptions) {
        this.baseUrl = options.authApiUrl.replace(/\/$/, "");
    }

    private url(userId: string, id?: string) {
        return `${this.baseUrl}/private/users/${encodeURIComponent(
            userId
        )}/systemApiKeys${
            id ? `/${encodeURIComponent(id)}` : ""
        }?name=${encodeURIComponent(this.options.name)}`;
    }

    private headers(json = false): Record<string, string> {
        const serviceToken = jwt.sign(
            { userId: this.options.systemUserId },
            this.options.jwtSecret,
            { algorithm: "HS256", expiresIn: "2m" }
        );
        return {
            "X-Magda-Session": serviceToken,
            ...(json ? { "content-type": "application/json" } : {})
        };
    }

    async list(userId: string): Promise<Array<{ id: string }>> {
        const response = await fetch(this.url(userId), {
            headers: this.headers(),
            signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok) {
            throw new Error(
                `List managed API keys failed: HTTP ${response.status}`
            );
        }
        return (await response.json()) as Array<{ id: string }>;
    }

    async create(userId: string, expiryTime: Date): Promise<ManagedApiKey> {
        const response = await fetch(this.url(userId), {
            method: "POST",
            headers: this.headers(true),
            body: JSON.stringify({
                name: this.options.name,
                expiryTime: expiryTime.toISOString()
            }),
            signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok) {
            throw new Error(
                `Create managed API key failed: HTTP ${response.status}`
            );
        }
        return (await response.json()) as ManagedApiKey;
    }

    async delete(userId: string, id?: string): Promise<void> {
        const response = await fetch(this.url(userId, id), {
            method: "DELETE",
            headers: this.headers(),
            signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok && response.status !== 404) {
            throw new Error(
                `Delete managed API key failed: HTTP ${response.status}`
            );
        }
    }

    async rotate(userId: string, expiryTime: Date): Promise<ManagedApiKey> {
        await this.delete(userId);
        return this.create(userId, expiryTime);
    }
}
