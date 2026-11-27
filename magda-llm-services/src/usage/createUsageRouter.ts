// The usage API (#3838 API-7, API-8, API-12, AUTH-9, USE-8), under `/v0` (the
// Gateway exposes it as `/api/v0/llm`):
//
// - `GET /usage/me`, `GET /usage/me/daily`: any authenticated user, always the
//   session's own user; a user ID in the path or query is never read (API-7).
// - `GET /usage/users`, `GET /usage/users/:userId`,
//   `GET /usage/users/:userId/daily`: unconstrained `llm/usage/read` (AUTH-9).
// - `GET /access-help`: the operator's optional no-access help (DEP-3
//   `noAccessHelp`), for the Agent Workspace and My Usage.

import express, { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import buildJwt from "magda-typescript-common/src/session/buildJwt.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import CallerAccessResolver, {
    AuthApiUnavailableError,
    Caller
} from "../access/CallerAccess.js";
import Admission from "../access/Admission.js";
import { isUuid } from "../profiles/validation.js";
import UsageLedger, { PeriodAmounts, zeroAmounts } from "./UsageLedger.js";
import {
    periodRemainingQuota,
    PeriodName,
    remainingQuota,
    RemainingQuota
} from "./quota.js";
import { addDays, isLocalDate } from "./periods.js";
import UserDirectory, { UserDetails } from "./UserDirectory.js";

export const USAGE_READ_OPERATION = "llm/usage/read";

/** DEP-3 `noAccessHelp`: text, a link, or both. */
export interface NoAccessHelp {
    text?: string;
    url?: string;
}

const MAX_HELP_TEXT = 1000;

/**
 * Validate the `noAccessHelp` settings at startup (`NO_ACCESS_HELP_TEXT`,
 * `NO_ACCESS_HELP_URL`). The link must be absolute `http:` or `https:`, so a
 * misconfigured value can't become a script link on the pages. Returns
 * `undefined` when neither is set.
 */
export function parseNoAccessHelp(
    env: Record<string, string | undefined>
): NoAccessHelp | undefined {
    const text = env.NO_ACCESS_HELP_TEXT?.trim() || undefined;
    const url = env.NO_ACCESS_HELP_URL?.trim() || undefined;
    if (text && text.length > MAX_HELP_TEXT) {
        throw new Error(
            `NO_ACCESS_HELP_TEXT must be at most ${MAX_HELP_TEXT} characters`
        );
    }
    if (url) {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error("NO_ACCESS_HELP_URL must be an absolute URL");
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error("NO_ACCESS_HELP_URL must be an http or https URL");
        }
    }
    if (!text && !url) return undefined;
    return { ...(text ? { text } : {}), ...(url ? { url } : {}) };
}

export interface UsageRouterOptions {
    jwtSecret: string;
    authApiUrl: string;
    callers: CallerAccessResolver;
    admission: Admission;
    /** `undefined` without a database: the usage endpoints answer 503. */
    ledger?: UsageLedger;
    noAccessHelp?: NoAccessHelp;
    /** API-12 lookups; by default against `authApiUrl`. */
    userDirectory?: UserDirectory;
}

/** A model alias in a usage report. */
export interface ModelUsage {
    modelAlias: string;
    /** Covered by at least one eligible profile (or an administrator). */
    eligible: boolean;
    /** USE-8 overall: when admission will stop. */
    remaining: RemainingQuota;
    /** USE-8 per period, across eligible profiles. */
    periodRemaining: Record<PeriodName, RemainingQuota>;
    usage: PeriodAmounts;
}

function sendError(
    res: Response,
    status: number,
    message: string,
    code?: string
) {
    res.status(status).json({
        error: { message, ...(code ? { code } : {}) }
    });
}

function zeroPeriodAmounts(): PeriodAmounts {
    return {
        allTime: zeroAmounts(),
        day: zeroAmounts(),
        week: zeroAmounts(),
        month: zeroAmounts()
    };
}

const UNLIMITED: RemainingQuota = { status: "unlimited" };
const NO_PROFILE: RemainingQuota = { status: "no_eligible_profile" };

class BadRequestError extends Error {}

function textQuery(req: Request, name: string): string | undefined {
    const value = req.query[name];
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
        throw new BadRequestError(`${name} must be a single value`);
    }
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 200) : undefined;
}

function pagination(req: Request, defaultLimit: number, maxLimit: number) {
    const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
    const limit = Math.min(
        Math.max(1, Math.floor(Number(req.query.limit) || defaultLimit)),
        maxLimit
    );
    return { offset, limit };
}

/**
 * The shared filters: `model`, and `from` / `to` local dates (`YYYY-MM-DD`,
 * both **inclusive**, in the accounting time zone).
 */
function usageFilter(req: Request) {
    const modelAlias = textQuery(req, "model");
    const from = textQuery(req, "from");
    const to = textQuery(req, "to");
    if (from !== undefined && !isLocalDate(from)) {
        throw new BadRequestError("from must be a date (YYYY-MM-DD)");
    }
    if (to !== undefined && !isLocalDate(to)) {
        throw new BadRequestError("to must be a date (YYYY-MM-DD)");
    }
    if (from !== undefined && to !== undefined && from > to) {
        throw new BadRequestError("from must not be after to");
    }
    return {
        modelAlias,
        fromDate: from,
        // the ledger's ranges are half-open
        toDate: to === undefined ? undefined : addDays(to, 1)
    };
}

export default function createUsageRouter(options: UsageRouterOptions) {
    const { jwtSecret, callers, admission, ledger, noAccessHelp } = options;
    const decisions = new AuthDecisionQueryClient(
        options.authApiUrl.replace(/\/$/, "")
    );
    const directory =
        options.userDirectory ??
        new UserDirectory({ authApiUrl: options.authApiUrl });
    const router = express.Router();

    function verifySession(req: Request, res: Response): string | undefined {
        const token = req.get("X-Magda-Session");
        if (!token) {
            sendError(res, 401, "Magda authentication required");
            return undefined;
        }
        let payload: JwtPayload;
        try {
            payload = jwt.verify(token, jwtSecret, {
                algorithms: ["HS256"]
            }) as JwtPayload;
        } catch {
            sendError(res, 401, "Invalid Magda session");
            return undefined;
        }
        if (typeof payload.userId !== "string" || !payload.userId) {
            sendError(res, 401, "Invalid Magda session");
            return undefined;
        }
        res.locals.userId = payload.userId;
        return token;
    }

    /** Wraps a handler: maps bad filters, Auth API and ledger failures. */
    function handle(
        action: string,
        handler: (req: Request, res: Response) => Promise<void>
    ) {
        return async (req: Request, res: Response) => {
            // every response is user-specific (Public API)
            res.setHeader("Cache-Control", "private, no-store");
            try {
                await handler(req, res);
            } catch (error) {
                if (error instanceof BadRequestError) {
                    sendError(res, 400, error.message, "llm_usage_invalid");
                    return;
                }
                const authApi = error instanceof AuthApiUnavailableError;
                console.error(
                    JSON.stringify({
                        event: authApi
                            ? "llm-usage-auth-api-unavailable"
                            : "llm-usage-read-failed",
                        action,
                        error:
                            error instanceof Error ? error.message : "unknown"
                    })
                );
                if (authApi) {
                    sendError(res, 503, "Unable to verify Magda LLM access");
                } else {
                    // API-11: never the database error itself
                    sendError(
                        res,
                        503,
                        "LLM usage accounting is temporarily unavailable",
                        "llm_usage_unavailable"
                    );
                }
            }
        };
    }

    function requireLedger(_req: Request, res: Response, next: NextFunction) {
        res.setHeader("Cache-Control", "private, no-store");
        if (!ledger) {
            sendError(
                res,
                503,
                "LLM usage accounting is temporarily unavailable",
                "llm_usage_unavailable"
            );
            return;
        }
        next();
    }

    /** API-7: the session's own user, with their invoke access resolved. */
    async function requireSelf(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        res.setHeader("Cache-Control", "private, no-store");
        let result;
        try {
            result = await callers.resolve(req.get("X-Magda-Session"));
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: "llm-usage-auth-api-unavailable",
                    error: error instanceof Error ? error.message : "unknown"
                })
            );
            sendError(res, 503, "Unable to verify Magda LLM access");
            return;
        }
        if (result.status === "unauthenticated") {
            sendError(res, 401, "Magda authentication required");
            return;
        }
        if (result.status === "invalid_session") {
            sendError(res, 401, "Invalid Magda session");
            return;
        }
        res.locals.subject = result.caller;
        next();
    }

    /**
     * AUTH-9: a plain decision on `llm/usage/read`, made with the **caller's**
     * session. Constrained grants are denied by the policy.
     */
    async function requireUsageRead(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        res.setHeader("Cache-Control", "private, no-store");
        const token = verifySession(req, res);
        if (!token) return;
        try {
            const decision = await decisions.getAuthDecision(
                { operationUri: USAGE_READ_OPERATION, unknowns: [] },
                token
            );
            if (decision.hasResidualRules || decision.result !== true) {
                sendError(
                    res,
                    403,
                    "You don't have permission to read other users' LLM usage",
                    "llm_access_denied"
                );
                return;
            }
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: "llm-usage-decision-failed",
                    error: error instanceof Error ? error.message : "unknown"
                })
            );
            sendError(res, 503, "Unable to verify Magda LLM access");
            return;
        }
        res.locals.callerToken = token;
        next();
    }

    /**
     * The invoke access of another user, for User Usage (API-8). Their
     * eligibility depends on their own grants, so the partial invoke decision
     * is made with an internal session **for that user**: it's only read,
     * after the caller passed `llm/usage/read`. An unknown user has no access.
     */
    async function resolveUser(userId: string): Promise<Caller> {
        const result = await callers.resolve(buildJwt(jwtSecret, userId));
        return result.status === "ok"
            ? result.caller
            : { userId, access: { kind: "none" } };
    }

    /** API-7 / API-8 report: totals, per-alias remaining quota (USE-8). */
    async function usageReport(subject: Caller) {
        const at = new Date();
        const summary = await ledger!.summary(subject.userId, at);
        const administrator = subject.access.kind === "admin";
        const invocable = await admission.invocableModels(subject);
        const eligibleAliases = new Set(invocable);
        const usedAliases = summary.byModel
            .map((m) => m.modelAlias)
            .filter((alias) => !eligibleAliases.has(alias));
        const models: ModelUsage[] = [];
        for (const alias of [...invocable, ...usedAliases]) {
            const used = summary.byModel.find((m) => m.modelAlias === alias);
            const usage: PeriodAmounts = used
                ? {
                      allTime: used.allTime,
                      day: used.day,
                      week: used.week,
                      month: used.month
                  }
                : zeroPeriodAmounts();
            if (!eligibleAliases.has(alias)) {
                models.push({
                    modelAlias: alias,
                    eligible: false,
                    remaining: NO_PROFILE,
                    periodRemaining: {
                        day: NO_PROFILE,
                        week: NO_PROFILE,
                        month: NO_PROFILE
                    },
                    usage
                });
            } else if (administrator) {
                // AUTH-10: administrators have no quota
                models.push({
                    modelAlias: alias,
                    eligible: true,
                    remaining: UNLIMITED,
                    periodRemaining: {
                        day: UNLIMITED,
                        week: UNLIMITED,
                        month: UNLIMITED
                    },
                    usage
                });
            } else {
                const eligibility = await admission.eligibility(
                    subject,
                    alias,
                    at
                );
                models.push({
                    modelAlias: alias,
                    eligible: eligibility.profiles.length > 0,
                    remaining: remainingQuota(
                        eligibility.profiles,
                        eligibility.usage
                    ),
                    periodRemaining: periodRemainingQuota(
                        eligibility.profiles,
                        eligibility.usage
                    ),
                    usage
                });
            }
        }
        const hasAccess = models.some((m) => m.eligible);
        return {
            timeZone: ledger!.timeZone,
            asOf: at.toISOString(),
            periods: summary.periods,
            access: administrator
                ? "administrator"
                : hasAccess
                ? "profiles"
                : "none",
            totals: summary.totals,
            models,
            noAccessHelp: hasAccess ? null : noAccessHelp ?? null
        };
    }

    async function dailyReport(userId: string, req: Request) {
        const filter = usageFilter(req);
        const { offset, limit } = pagination(req, 31, 366);
        const history = await ledger!.dailyHistory(userId, {
            ...filter,
            offset,
            limit
        });
        return { timeZone: ledger!.timeZone, ...history };
    }

    // DEP-3: shown when a user has no eligible model (UI doc). Only verifies
    // the session: the text is the same for everyone.
    router.get("/access-help", (req, res) => {
        res.setHeader("Cache-Control", "private, no-store");
        if (!verifySession(req, res)) return;
        res.json({ noAccessHelp: noAccessHelp ?? null });
    });

    // API-7: always the session's own user. A `userId` in the query is
    // never read.
    router.get(
        "/usage/me",
        requireSelf,
        requireLedger,
        handle("usage-me", async (_req, res) => {
            const subject = res.locals.subject as Caller;
            res.json({
                user: { id: subject.userId },
                ...(await usageReport(subject))
            });
        })
    );

    router.get(
        "/usage/me/daily",
        requireSelf,
        requireLedger,
        handle("usage-me-daily", async (req, res) => {
            const subject = res.locals.subject as Caller;
            res.json(await dailyReport(subject.userId, req));
        })
    );

    /**
     * API-8 / API-12: users with usage, most tokens first. `q` is a user ID
     * (that user, even without usage) or a name or email, searched with the
     * caller's session; names appear only where the caller may read users.
     */
    router.get(
        "/usage/users",
        requireUsageRead,
        requireLedger,
        handle("usage-users", async (req, res) => {
            const token = res.locals.callerToken as string;
            const q = textQuery(req, "q");
            const filter = usageFilter(req);
            const { offset, limit } = pagination(req, 20, 100);
            let userIds: string[] | undefined;
            let userSearch: "id" | "name" | undefined;
            if (q !== undefined && isUuid(q)) {
                userIds = [q.toLowerCase()];
                userSearch = "id";
            } else if (q !== undefined) {
                const found = await directory.search(q, token);
                userIds = found.users.map((user) => user.id);
                userSearch = "name";
            }
            const page = await ledger!.usersWithUsage({
                ...filter,
                userIds,
                offset,
                limit
            });
            let items = page.items;
            let total = page.total;
            if (userSearch === "id" && !items.length && offset === 0) {
                // a user ID always finds that user, with or without usage
                items = [
                    {
                        userId: userIds![0],
                        lastUsageDate: null,
                        ...zeroAmounts()
                    }
                ];
                total = 1;
            }
            const names = await directory.describe(
                items.map((item) => item.userId),
                token
            );
            res.json({
                items: items.map((item) => ({
                    ...item,
                    user: names.get(item.userId) ?? { id: item.userId }
                })),
                total
            });
        })
    );

    function targetUserId(req: Request): string {
        const userId = req.params.userId;
        if (!isUuid(userId)) {
            throw new BadRequestError("userId must be a UUID");
        }
        return userId.toLowerCase();
    }

    router.get(
        "/usage/users/:userId",
        requireUsageRead,
        requireLedger,
        handle("usage-user", async (req, res) => {
            const userId = targetUserId(req);
            const token = res.locals.callerToken as string;
            const [subject, names] = await Promise.all([
                resolveUser(userId),
                directory.describe([userId], token)
            ]);
            const user: UserDetails = names.get(userId) ?? { id: userId };
            res.json({ user, ...(await usageReport(subject)) });
        })
    );

    router.get(
        "/usage/users/:userId/daily",
        requireUsageRead,
        requireLedger,
        handle("usage-user-daily", async (req, res) => {
            res.json(await dailyReport(targetUserId(req), req));
        })
    );

    return router;
}
