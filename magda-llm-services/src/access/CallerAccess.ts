// Who is calling, and which access profiles may they invoke? (#3838 EVAL-1,
// EVAL-3, AUTH-4, AUTH-10)

import jwt, { JwtPayload } from "jsonwebtoken";
import SQLSyntax from "sql-syntax";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { isTrueEquivalent } from "magda-typescript-common/src/opa/AuthDecision.js";
import { ADMIN_USERS_ROLE_ID } from "magda-typescript-common/src/authorization-api/constants.js";
import { PROFILE_TABLE_ALIAS } from "../profiles/ProfileRepository.js";

export const INVOKE_OPERATION = "llm/access/invoke";
/** The partial decision's unknown: the profile (DATA-1 field names = columns). */
export const PROFILE_UNKNOWN = "input.object.llmAccessProfile";

export const DEFAULT_DECISION_CACHE_SECONDS = 30;

export type InvokeAccess =
    /**
     * A MAGDA administrator (AUTH-10): any deployment-allowed alias, without
     * a profile and without quota checks.
     */
    | { kind: "admin" }
    /**
     * The profiles the caller may invoke: a SQL condition over
     * `access_profiles` alias `p`. An empty condition (an unconditional
     * `true`, e.g. an unconstrained invoke grant) means every profile; quotas
     * still apply.
     */
    | { kind: "profiles"; condition: SQLSyntax }
    /** An unconditional `false`: no profile at all. */
    | { kind: "none" };

export interface Caller {
    /** The verified session user (USE-2). */
    userId: string;
    access: InvokeAccess;
}

export type ResolveResult =
    | { status: "ok"; caller: Caller }
    | { status: "unauthenticated" }
    | { status: "invalid_session" }
    /**
     * A valid session for a user who no longer exists (the Auth API's
     * `whoami` answers `404`): not an outage.
     */
    | { status: "unknown_user" };

/** The Auth API couldn't answer: not an access decision (API-11: 503). */
export class AuthApiUnavailableError extends Error {}

export function parseDecisionCacheSeconds(value: string | undefined): number {
    if (value === undefined || value.trim() === "") {
        return DEFAULT_DECISION_CACHE_SECONDS;
    }
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 300) {
        throw new Error(
            "DECISION_CACHE_SECONDS must be an integer from 0 to 300"
        );
    }
    return seconds;
}

export interface CallerAccessOptions {
    jwtSecret: string;
    /** The Auth API base URL, e.g. `http://authorization-api/v0`. */
    authApiUrl: string;
    /** EVAL-3: per-user cache TTL; `0` disables the cache. */
    decisionCacheSeconds?: number;
    /** Upper bound on cached users. */
    maxCacheEntries?: number;
}

interface CacheEntry {
    expiresAt: number;
    access: InvokeAccess;
}

/**
 * Resolves a request's caller: verifies the MAGDA session, then makes **one**
 * partial `llm/access/invoke` decision with the caller's own session, with the
 * profile unknown (EVAL-1). The residual is translated into SQL over
 * `access_profiles` once and cached per user for `decisionCacheSeconds`
 * (EVAL-3): that TTL is the documented delay before a revoked grant stops
 * working. Profile attributes are read from SQL on every request, so profile
 * changes apply at once.
 */
export default class CallerAccessResolver {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly decisionClient: AuthDecisionQueryClient;
    private readonly cacheMs: number;
    private readonly maxCacheEntries: number;

    constructor(private readonly options: CallerAccessOptions) {
        this.decisionClient = new AuthDecisionQueryClient(
            options.authApiUrl.replace(/\/$/, "")
        );
        this.cacheMs =
            (options.decisionCacheSeconds ?? DEFAULT_DECISION_CACHE_SECONDS) *
            1000;
        this.maxCacheEntries = options.maxCacheEntries ?? 10_000;
    }

    async resolve(token: string | undefined): Promise<ResolveResult> {
        if (!token) return { status: "unauthenticated" };
        let payload: JwtPayload;
        try {
            payload = jwt.verify(token, this.options.jwtSecret, {
                algorithms: ["HS256"]
            }) as JwtPayload;
        } catch {
            return { status: "invalid_session" };
        }
        const userId = payload.userId;
        if (typeof userId !== "string" || !userId) {
            return { status: "invalid_session" };
        }
        const now = Date.now();
        const cached = this.cache.get(userId);
        if (cached && cached.expiresAt > now) {
            return { status: "ok", caller: { userId, access: cached.access } };
        }
        const access = await this.lookup(userId, token);
        if (access === "invalid_session") return { status: "invalid_session" };
        if (access === "unknown_user") return { status: "unknown_user" };
        if (this.cacheMs > 0) this.store(userId, access, now);
        return { status: "ok", caller: { userId, access } };
    }

    private store(userId: string, access: InvokeAccess, now: number) {
        this.cache.delete(userId);
        if (this.cache.size >= this.maxCacheEntries) {
            for (const [key, entry] of this.cache) {
                if (entry.expiresAt <= now) this.cache.delete(key);
            }
            // still full: drop the oldest insertion
            if (this.cache.size >= this.maxCacheEntries) {
                const oldest = this.cache.keys().next().value;
                if (oldest !== undefined) this.cache.delete(oldest);
            }
        }
        this.cache.set(userId, { expiresAt: now + this.cacheMs, access });
    }

    private async lookup(
        userId: string,
        token: string
    ): Promise<InvokeAccess | "invalid_session" | "unknown_user"> {
        const base = this.options.authApiUrl.replace(/\/$/, "");
        let user: { id?: string; roles?: Array<{ id?: string }> } | undefined;
        let missing = false;
        try {
            const response = await fetch(`${base}/public/users/whoami`, {
                headers: { "X-Magda-Session": token },
                signal: AbortSignal.timeout(10_000)
            });
            // 404: the session names a user who has been deleted
            missing = response.status === 404;
            if (!response.ok && response.status !== 401 && !missing) {
                throw new Error(
                    `Session verification failed with HTTP ${response.status}`
                );
            }
            user = response.ok ? await response.json() : undefined;
        } catch (error) {
            throw new AuthApiUnavailableError(
                error instanceof Error ? error.message : String(error)
            );
        }
        if (missing) return "unknown_user";
        if (!user || user.id !== userId) return "invalid_session";
        // AUTH-10: administrators hold the OPA override; an unconstrained
        // invoke grant also gives an unconditional `true`, so tell them apart
        // by the role, as the entrypoint policy does.
        if (user.roles?.some((role) => role?.id === ADMIN_USERS_ROLE_ID)) {
            return { kind: "admin" };
        }
        let decision;
        try {
            decision = await this.decisionClient.getAuthDecision(
                {
                    operationUri: INVOKE_OPERATION,
                    // Always explicit: without it the endpoint derives an
                    // unknown from the operation's resource URI.
                    unknowns: [PROFILE_UNKNOWN]
                },
                token
            );
        } catch (error) {
            throw new AuthApiUnavailableError(
                error instanceof Error ? error.message : String(error)
            );
        }
        if (!decision.hasResidualRules) {
            return isTrueEquivalent(decision.result)
                ? { kind: "profiles", condition: SQLSyntax.empty }
                : { kind: "none" };
        }
        return {
            kind: "profiles",
            condition: decision.toSql({
                prefixes: [PROFILE_UNKNOWN],
                tableRef: PROFILE_TABLE_ALIAS
            })
        };
    }
}
