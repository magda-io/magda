// The profile management API (#3838 API-1 to API-6), under `/v0` (the Gateway
// exposes it as `/api/v0/llm`).

import express, { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { AuthApiUnavailableError } from "../access/CallerAccess.js";
import ServedModels, { wildcardAliases } from "../access/ServedModels.js";
import { AuthApiRequestError } from "../authApi/AuthApiClient.js";
import ProfileService, {
    ProfileLifecycleError,
    UnexpectedPermissionError
} from "./ProfileService.js";
import { AccessProfile, ProfileFields } from "./types.js";
import {
    isUuid,
    ProfileValidationError,
    validateProfileFields
} from "./validation.js";

export type ManagementOperation =
    | "llm/access/create"
    | "llm/access/read"
    | "llm/access/update"
    | "llm/access/delete";

export interface ProfileRouterOptions {
    jwtSecret: string;
    authApiUrl: string;
    allowedModels: ReadonlySet<string>;
    servedModels: ServedModels;
    /** `undefined` without a database: every endpoint answers 503. */
    profiles?: ProfileService;
}

function sendError(
    res: Response,
    status: number,
    message: string,
    code?: string,
    extra: Record<string, unknown> = {}
) {
    res.status(status).json({
        error: { message, ...(code ? { code } : {}), ...extra }
    });
}

export function profileToJson(profile: AccessProfile) {
    return {
        ...profile,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString()
    };
}

function sendProfile(res: Response, profile: AccessProfile, status = 200) {
    res.setHeader("ETag", `"${profile.revision}"`);
    res.status(status).json(profileToJson(profile));
}

/** `If-Match: "3"` (or `3`, or `W/"3"`) → 3. */
export function parseIfMatch(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const match = /^(?:W\/)?"?(\d+)"?$/.exec(value.trim());
    if (!match) return undefined;
    const revision = Number(match[1]);
    return Number.isSafeInteger(revision) && revision > 0
        ? revision
        : undefined;
}

function pagination(req: Request, defaultLimit: number, maxLimit: number) {
    const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
    const limit = Math.min(
        Math.max(1, Math.floor(Number(req.query.limit) || defaultLimit)),
        maxLimit
    );
    return { offset, limit };
}

function queryText(value: unknown): string {
    return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

export default function createProfileRouter(options: ProfileRouterOptions) {
    const { jwtSecret, allowedModels, servedModels, profiles } = options;
    const decisions = new AuthDecisionQueryClient(
        options.authApiUrl.replace(/\/$/, "")
    );
    const router = express.Router();

    /**
     * AUTH-3 / EVAL-4: a plain decision on the management operation, made
     * with the **caller's** session. Constrained grants are denied by the
     * policy.
     */
    function requireOperation(operationUri: ManagementOperation) {
        return async (req: Request, res: Response, next: NextFunction) => {
            // every response is user-specific (Public API)
            res.setHeader("Cache-Control", "private, no-store");
            const token = req.get("X-Magda-Session");
            if (!token) {
                sendError(res, 401, "Magda authentication required");
                return;
            }
            let payload: JwtPayload;
            try {
                payload = jwt.verify(token, jwtSecret, {
                    algorithms: ["HS256"]
                }) as JwtPayload;
            } catch {
                sendError(res, 401, "Invalid Magda session");
                return;
            }
            if (typeof payload.userId !== "string" || !payload.userId) {
                sendError(res, 401, "Invalid Magda session");
                return;
            }
            try {
                const decision = await decisions.getAuthDecision(
                    // `unknowns: []`: a full decision, no residual
                    { operationUri, unknowns: [] },
                    token
                );
                if (decision.hasResidualRules || decision.result !== true) {
                    sendError(
                        res,
                        403,
                        "You don't have permission to do this",
                        "llm_access_denied"
                    );
                    return;
                }
            } catch (error) {
                console.error(
                    JSON.stringify({
                        event: "llm-profile-decision-failed",
                        operationUri,
                        error:
                            error instanceof Error ? error.message : "unknown"
                    })
                );
                sendError(res, 503, "Unable to verify Magda LLM access");
                return;
            }
            res.locals.userId = payload.userId;
            if (!profiles) {
                sendError(
                    res,
                    503,
                    "The LLM Services database is not configured"
                );
                return;
            }
            next();
        };
    }

    /** Wraps a handler: maps lifecycle, validation and Auth API errors. */
    function handle(
        action: string,
        handler: (req: Request, res: Response) => Promise<void>
    ) {
        return async (req: Request, res: Response) => {
            try {
                await handler(req, res);
            } catch (error) {
                if (error instanceof ProfileValidationError) {
                    sendError(res, 422, error.message, "llm_profile_invalid");
                } else if (error instanceof ProfileLifecycleError) {
                    const status = {
                        not_found: 404,
                        not_ready: 409,
                        role_not_found: 404,
                        role_not_allowed: 422
                    }[error.reason];
                    sendError(res, status, error.message);
                } else if (error instanceof AuthApiUnavailableError) {
                    console.error(
                        JSON.stringify({
                            event: "llm-profile-auth-api-unavailable",
                            action,
                            error: error.message
                        })
                    );
                    sendError(
                        res,
                        503,
                        "The Authorization API is unavailable; retry shortly"
                    );
                } else if (error instanceof AuthApiRequestError) {
                    console.error(
                        JSON.stringify({
                            event: "llm-profile-auth-api-refused",
                            action,
                            status: error.status,
                            error: error.message
                        })
                    );
                    sendError(
                        res,
                        502,
                        "The Authorization API refused the change"
                    );
                } else {
                    console.error(
                        JSON.stringify({
                            event:
                                error instanceof UnexpectedPermissionError
                                    ? "llm-profile-unexpected-permission"
                                    : "llm-profile-request-failed",
                            action,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : "unknown"
                        })
                    );
                    sendError(res, 500, "Unable to complete the request");
                }
            }
        };
    }

    /** MODEL-1 / MODEL-2: aliases a profile may name explicitly. */
    async function availableAliases(): Promise<Set<string>> {
        return new Set(
            wildcardAliases(allowedModels, await servedModels.served())
        );
    }

    async function validateFields(
        body: unknown,
        previous?: AccessProfile
    ): Promise<ProfileFields> {
        const fields = validateProfileFields(body, await availableAliases());
        if (
            fields.orgUnitId &&
            fields.orgUnitId !== previous?.orgUnitId &&
            !(await profiles!.orgUnitExists(fields.orgUnitId))
        ) {
            throw new ProfileValidationError("orgUnitId doesn't exist");
        }
        return fields;
    }

    function profileId(req: Request): string {
        const id = req.params.id;
        if (!isUuid(id)) {
            throw new ProfileLifecycleError("not_found", "Profile not found");
        }
        return id;
    }

    // API-6: aliases the profile form can offer
    router.get(
        "/available-models",
        requireOperation("llm/access/read"),
        handle("list available models", async (_req, res) => {
            const served = await servedModels.served();
            res.json({
                items: wildcardAliases(allowedModels, served),
                servedListAvailable: served !== null
            });
        })
    );

    // API-1: list and search
    router.get(
        "/access-profiles",
        requireOperation("llm/access/read"),
        handle("list profiles", async (req, res) => {
            const { offset, limit } = pagination(req, 50, 500);
            const result = await profiles!.repository.list({
                search: queryText(req.query.q),
                offset,
                limit
            });
            res.json({
                items: result.items.map(profileToJson),
                total: result.total
            });
        })
    );

    // API-2 / LIFE-1: create
    router.post(
        "/access-profiles",
        requireOperation("llm/access/create"),
        express.json({ limit: "64kb" }),
        handle("create profile", async (req, res) => {
            const fields = await validateFields(req.body);
            const profile = await profiles!.create(fields, res.locals.userId);
            res.setHeader("Location", `access-profiles/${profile.id}`);
            sendProfile(res, profile, 201);
        })
    );

    // API-1: read
    router.get(
        "/access-profiles/:id",
        requireOperation("llm/access/read"),
        handle("read profile", async (req, res) => {
            const profile = await profiles!.repository.get(profileId(req));
            if (!profile) {
                throw new ProfileLifecycleError(
                    "not_found",
                    "Profile not found"
                );
            }
            sendProfile(res, profile);
        })
    );

    // API-2 / LIFE-2 / DATA-4: update with If-Match
    router.put(
        "/access-profiles/:id",
        requireOperation("llm/access/update"),
        express.json({ limit: "64kb" }),
        handle("update profile", async (req, res) => {
            const id = profileId(req);
            const expected = parseIfMatch(req.get("If-Match"));
            if (expected === undefined) {
                sendError(
                    res,
                    428,
                    'An If-Match header with the profile revision (e.g. "3") is required',
                    "llm_profile_revision_required"
                );
                return;
            }
            const current = await profiles!.repository.get(id);
            if (!current) {
                throw new ProfileLifecycleError(
                    "not_found",
                    "Profile not found"
                );
            }
            const fields = await validateFields(req.body, current);
            const result = await profiles!.repository.update(
                id,
                expected,
                fields,
                res.locals.userId
            );
            if (result.status === "not_found") {
                throw new ProfileLifecycleError(
                    "not_found",
                    "Profile not found"
                );
            }
            if (result.status === "stale") {
                if (result.profile.state !== "ready") {
                    throw new ProfileLifecycleError(
                        "not_ready",
                        `The profile is ${result.profile.state}; retry shortly`
                    );
                }
                res.setHeader("ETag", `"${result.profile.revision}"`);
                sendError(
                    res,
                    409,
                    "The profile was changed by someone else; reload it and try again",
                    "llm_profile_stale_revision",
                    { currentRevision: result.profile.revision }
                );
                return;
            }
            sendProfile(res, result.profile);
        })
    );

    // API-2 / LIFE-4: delete
    router.delete(
        "/access-profiles/:id",
        requireOperation("llm/access/delete"),
        handle("delete profile", async (req, res) => {
            await profiles!.delete(profileId(req));
            res.status(204).end();
        })
    );

    // API-3: roles holding the profile's permission
    router.get(
        "/access-profiles/:id/roles",
        requireOperation("llm/access/read"),
        handle("list profile roles", async (req, res) => {
            const { offset, limit } = pagination(req, 100, 500);
            res.json({
                items: await profiles!.roles(profileId(req), offset, limit)
            });
        })
    );

    // API-4: role picker
    router.get(
        "/access-profiles/:id/role-candidates",
        requireOperation("llm/access/update"),
        handle("list role candidates", async (req, res) => {
            const { limit } = pagination(req, 20, 100);
            res.json({
                items: await profiles!.roleCandidates(
                    profileId(req),
                    queryText(req.query.q),
                    limit
                )
            });
        })
    );

    // API-5 / LIFE-3: attach and detach
    router.put(
        "/access-profiles/:id/roles/:roleId",
        requireOperation("llm/access/update"),
        handle("attach role", async (req, res) => {
            await profiles!.attachRole(profileId(req), req.params.roleId);
            res.status(204).end();
        })
    );
    router.delete(
        "/access-profiles/:id/roles/:roleId",
        requireOperation("llm/access/update"),
        handle("detach role", async (req, res) => {
            await profiles!.detachRole(profileId(req), req.params.roleId);
            res.status(204).end();
        })
    );

    // LIFE-5 on demand, from the profile page
    router.post(
        "/access-profiles/:id/reconcile",
        requireOperation("llm/access/update"),
        handle("reconcile profile", async (req, res) => {
            const profile = await profiles!.reconcileOne(profileId(req));
            if (!profile) {
                res.status(204).end();
                return;
            }
            sendProfile(res, profile);
        })
    );

    return router;
}
