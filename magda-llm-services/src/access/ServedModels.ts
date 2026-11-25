// The aliases the model backend (LiteLLM) serves, for `["*"]` coverage
// (#3838 MODEL-2).

export interface ServedModelsOptions {
    liteLlmUrl: URL;
    liteLlmKey: string;
    /** How long a successful answer is reused. */
    cacheMs?: number;
    /** How long an unavailable backend falls back before asking again. */
    failureCacheMs?: number;
    timeoutMs?: number;
}

/**
 * Reads LiteLLM's `/v1/models` with the master key and caches it briefly.
 * `served()` returns `null` when the backend's list is unavailable: MODEL-2
 * then treats `*` as the configured allowlist.
 */
export default class ServedModels {
    private value: ReadonlySet<string> | null = null;
    private expiresAt = 0;
    private pending: Promise<ReadonlySet<string> | null> | null = null;

    constructor(private readonly options: ServedModelsOptions) {}

    async served(): Promise<ReadonlySet<string> | null> {
        if (Date.now() < this.expiresAt) return this.value;
        if (!this.pending) {
            this.pending = this.fetch().finally(() => {
                this.pending = null;
            });
        }
        return this.pending;
    }

    private async fetch(): Promise<ReadonlySet<string> | null> {
        const { liteLlmUrl, liteLlmKey } = this.options;
        try {
            const response = await fetch(
                `${liteLlmUrl.href.replace(/\/$/, "")}/v1/models`,
                {
                    headers: { authorization: `Bearer ${liteLlmKey}` },
                    signal: AbortSignal.timeout(this.options.timeoutMs ?? 5_000)
                }
            );
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const body = (await response.json()) as {
                data?: Array<{ id?: unknown }>;
            };
            if (!Array.isArray(body?.data)) {
                throw new Error("unexpected model list");
            }
            const ids = new Set<string>();
            for (const item of body.data) {
                if (typeof item?.id === "string") ids.add(item.id);
            }
            this.value = ids;
            this.expiresAt = Date.now() + (this.options.cacheMs ?? 60_000);
        } catch (error) {
            console.warn(
                JSON.stringify({
                    event: "llm-served-models-unavailable",
                    message:
                        "Treating `*` profiles as the configured allowlist (MODEL-2)",
                    error: error instanceof Error ? error.message : "unknown"
                })
            );
            this.value = null;
            this.expiresAt =
                Date.now() + (this.options.failureCacheMs ?? 15_000);
        }
        return this.value;
    }
}

/**
 * MODEL-2: the aliases `["*"]` covers: deployment-allowed and served, or just
 * deployment-allowed when the backend's list is unavailable.
 */
export function wildcardAliases(
    allowedModels: ReadonlySet<string>,
    served: ReadonlySet<string> | null
): string[] {
    return [...allowedModels].filter((alias) => !served || served.has(alias));
}
