import { createClient } from "redis";
import type { RedisClientType } from "redis";

export interface RedisClientOptions {
    host: string;
    port: number;
    db?: number;
    keyPrefix?: string;
    // ms
    connectTimeout?: number;
}

export interface RedisClientEnvOptions {
    hostEnv?: string;
    portEnv?: string;
    dbEnv?: string;
    keyPrefixEnv?: string;
    connectTimeoutEnv?: string;
}

export default class RedisClient {
    private readonly options: RedisClientOptions;
    private client?: RedisClientType;
    private connectingPromise?: Promise<RedisClientType | void>;

    constructor(options: RedisClientOptions) {
        this.options = {
            db: 0,
            keyPrefix: "",
            connectTimeout: 5000,
            ...options
        };
    }

    static fromEnv(
        env: NodeJS.ProcessEnv = process.env,
        map: RedisClientEnvOptions = {}
    ): RedisClient {
        const hostKey = map.hostEnv ?? "REDIS_HOST";
        const portKey = map.portEnv ?? "REDIS_PORT";
        const dbKey = map.dbEnv ?? "REDIS_DB";
        const keyPrefixKey = map.keyPrefixEnv ?? "REDIS_KEY_PREFIX";
        const timeoutKey = map.connectTimeoutEnv ?? "REDIS_CONNECT_TIMEOUT_MS";

        const host = env[hostKey] ?? "localhost";
        const port = Number(env[portKey] ?? 6379);
        const db = Number(env[dbKey] ?? 0);
        const keyPrefix = env[keyPrefixKey] ?? "";
        const connectTimeout = Number(env[timeoutKey] ?? 5000);

        return new RedisClient({
            host,
            port,
            db,
            keyPrefix,
            connectTimeout
        });
    }

    private withPrefix(key: string): string {
        return this.options.keyPrefix ? `${this.options.keyPrefix}${key}` : key;
    }

    private async ensureConnected(): Promise<RedisClientType> {
        if (this.client?.isOpen) {
            return this.client;
        }

        if (!this.client) {
            const url = `redis://${this.options.host}:${this.options.port}`;
            this.client = createClient({
                url,
                database: this.options.db,
                socket: {
                    connectTimeout: this.options.connectTimeout
                }
            });

            this.client.on("error", (e: Error) => {
                // Keep this light; caller handles retry/fallback.
                console.error("[RedisClient] error:", e);
            });
        }

        if (!this.client.isOpen) {
            if (!this.connectingPromise) {
                this.connectingPromise = this.client
                    .connect()
                    .finally((): void => (this.connectingPromise = undefined));
            }
            await this.connectingPromise;
        }

        return this.client;
    }

    async get(key: string): Promise<string | null> {
        const c = await this.ensureConnected();
        return c.get(this.withPrefix(key));
    }

    async set(key: string, value: string): Promise<string | null> {
        const c = await this.ensureConnected();
        return c.set(this.withPrefix(key), value);
    }

    async setEx(
        key: string,
        ttlSeconds: number,
        value: string
    ): Promise<string | null> {
        const c = await this.ensureConnected();
        return c.set(this.withPrefix(key), value, { EX: ttlSeconds });
    }

    async sAdd(key: string, values: string[]): Promise<number> {
        if (!values.length) return 0;
        const c = await this.ensureConnected();
        return c.sAdd(this.withPrefix(key), values);
    }

    async sMembers(key: string): Promise<string[]> {
        const c = await this.ensureConnected();
        return c.sMembers(this.withPrefix(key));
    }

    async expire(key: string, ttlSeconds: number): Promise<boolean> {
        const c = await this.ensureConnected();
        return c.expire(this.withPrefix(key), ttlSeconds);
    }

    async del(key: string): Promise<number> {
        const c = await this.ensureConnected();
        return c.del(this.withPrefix(key));
    }

    async quit(): Promise<void> {
        if (this.client?.isOpen) {
            await this.client.quit();
        }
    }
}
