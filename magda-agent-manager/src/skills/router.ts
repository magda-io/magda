import express, { NextFunction, Request, Response } from "express";
import { createAuthenticatedUserAuth } from "../auth.js";
import { AuthenticatedUser } from "../types.js";
import { AgentSkillError, AgentSkillService } from "./service.js";
import { AgentSkillRecord, AgentSkillType } from "./types.js";

function pathType(value: string): AgentSkillType {
    if (value !== "system" && value !== "user") {
        throw new Error("INVALID_TYPE");
    }
    return value;
}

function ifMatchChecksum(req: Request): string {
    const value = req.get("If-Match");
    if (value === undefined) {
        throw new AgentSkillError(
            "If-Match is required for Agent Skill replacement and deletion",
            428,
            "AGENT_SKILL_PRECONDITION_REQUIRED"
        );
    }
    const match = /^"([0-9a-f]{64})"$/.exec(value);
    if (!match) {
        throw new AgentSkillError(
            "If-Match must contain one strong quoted Agent Skill checksum",
            400,
            "INVALID_IF_MATCH"
        );
    }
    return match[1];
}

function queryString(value: unknown, name: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
        throw new AgentSkillError(
            `${name} must be supplied once as a string`,
            400,
            `INVALID_${name.toUpperCase()}`
        );
    }
    return value;
}

function queryInteger(
    value: unknown,
    name: string,
    fallback: number,
    min: number,
    max: number
): number {
    const raw = queryString(value, name);
    const parsed = raw === undefined ? fallback : Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new AgentSkillError(
            `${name} must be an integer from ${min} to ${max}`,
            400,
            `INVALID_${name.toUpperCase()}`
        );
    }
    return parsed;
}

function asyncRoute(
    handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        handler(req, res).catch(next);
    };
}

function asyncMiddleware(
    handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        handler(req, res).then(() => {
            if (!res.headersSent) next();
        }, next);
    };
}

export interface AgentSkillRouterOptions {
    service: AgentSkillService;
    jwtSecret: string;
    authApiUrl: string;
    maxCompressedBytes: number;
    maxConcurrentUploads?: number;
    uploadTimeoutMs?: number;
}

export default function createAgentSkillRouter(
    options: AgentSkillRouterOptions
): express.Router {
    const router = express.Router();
    const maxConcurrentUploads = options.maxConcurrentUploads ?? 4;
    const uploadTimeoutMs = options.uploadTimeoutMs ?? 60_000;
    let activeUploads = 0;
    const admitUpload = (req: Request, res: Response, next: NextFunction) => {
        if (activeUploads >= maxConcurrentUploads) {
            next(
                new AgentSkillError(
                    "Too many Agent Skill uploads are in progress",
                    429,
                    "AGENT_SKILL_UPLOAD_BUSY",
                    true
                )
            );
            return;
        }
        activeUploads += 1;
        let released = false;
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                res.set("Connection", "close");
                res.status(408).json({
                    error: {
                        code: "AGENT_SKILL_UPLOAD_TIMEOUT",
                        message: "Agent Skill upload timed out",
                        retryable: true
                    }
                });
            }
            req.destroy();
        }, uploadTimeoutMs);
        const stopBodyTimer = () => clearTimeout(timer);
        res.locals.stopAgentSkillUploadBodyTimer = stopBodyTimer;
        const release = () => {
            if (released) return;
            released = true;
            stopBodyTimer();
            activeUploads -= 1;
        };
        res.once("finish", release);
        res.once("close", release);
        next();
    };
    const uploadBodyReceived = (
        _req: Request,
        res: Response,
        next: NextFunction
    ) => {
        const stopTimer = res.locals.stopAgentSkillUploadBodyTimer as
            | (() => void)
            | undefined;
        stopTimer?.();
        next();
    };
    router.use(
        createAuthenticatedUserAuth({
            jwtSecret: options.jwtSecret,
            authApiUrl: options.authApiUrl
        })
    );

    router.get(
        "/local-sync-manifest",
        asyncRoute(async (req, res) => {
            if (Object.keys(req.query).length) {
                throw new AgentSkillError(
                    "Local sync manifest does not accept query parameters",
                    400,
                    "INVALID_LOCAL_SYNC_MANIFEST_QUERY"
                );
            }
            res.set("Cache-Control", "private, no-store");
            res.json(
                await options.service.getLocalSkillSyncManifest(
                    req.agentUser as AuthenticatedUser
                )
            );
        })
    );

    router.get(
        "/workspace-manifest",
        asyncRoute(async (req, res) => {
            if (Object.keys(req.query).length) {
                throw new AgentSkillError(
                    "Workspace manifest does not accept query parameters",
                    400,
                    "INVALID_WORKSPACE_MANIFEST_QUERY"
                );
            }
            res.set("Cache-Control", "private, no-store");
            res.json(
                await options.service.getWorkspaceSkillManifest(
                    req.agentUser as AuthenticatedUser
                )
            );
        })
    );

    router.get(
        "/",
        asyncRoute(async (req, res) => {
            if (req.query.scope !== undefined) {
                res.status(400).json({
                    error: {
                        code: "INVALID_TYPE",
                        message:
                            "scope was replaced by type; use type=all, system, or user"
                    }
                });
                return;
            }
            const rawType = queryString(req.query.type, "type") || "all";
            if (!(["all", "system", "user"] as string[]).includes(rawType)) {
                res.status(400).json({
                    error: {
                        code: "INVALID_TYPE",
                        message: "type must be all, system, or user"
                    }
                });
                return;
            }
            const rawUserId = queryString(req.query.userId, "userId");
            if (
                rawUserId !== undefined &&
                rawUserId !== "current" &&
                rawUserId !== "!current"
            ) {
                res.status(400).json({
                    error: {
                        code: "INVALID_USERID",
                        message: "userId must be current or !current"
                    }
                });
                return;
            }
            if (rawType === "system" && rawUserId !== undefined) {
                res.status(400).json({
                    error: {
                        code: "INVALID_USERID",
                        message:
                            "userId filtering applies only to user publications"
                    }
                });
                return;
            }
            const rawLimit = queryString(req.query.limit, "limit");
            const limit = rawLimit === undefined ? 20 : Number(rawLimit);
            if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
                res.status(400).json({
                    error: {
                        code: "INVALID_LIMIT",
                        message: "limit must be an integer from 1 to 100"
                    }
                });
                return;
            }
            const pageToken = queryString(req.query.pageToken, "pageToken");
            const q = queryString(req.query.q, "q");
            if ((pageToken?.length || 0) > 4096 || (q?.length || 0) > 200) {
                res.status(400).json({
                    error: {
                        code: "INVALID_QUERY",
                        message: "Catalogue query is too long"
                    }
                });
                return;
            }
            const result = await options.service.list(
                {
                    type: rawType as "all" | AgentSkillType,
                    ...(rawUserId
                        ? {
                              userId: rawUserId as "current" | "!current"
                          }
                        : {}),
                    limit,
                    pageToken,
                    q
                },
                req.agentUser as AuthenticatedUser
            );
            res.json({
                items: result.records,
                hasMore: result.hasMore,
                ...(result.nextPageToken
                    ? { nextPageToken: result.nextPageToken }
                    : {})
            });
        })
    );

    /* ----------------------- #3861 recipient installations ---------------------- */

    const jsonBody = express.json({ limit: "8kb" });

    router.get(
        "/installations",
        asyncRoute(async (req, res) => {
            const pageToken = queryString(req.query.pageToken, "pageToken");
            if ((pageToken?.length || 0) > 4096) {
                throw new AgentSkillError(
                    "pageToken is too long",
                    400,
                    "INVALID_QUERY"
                );
            }
            res.set("Cache-Control", "private, no-store");
            res.json(
                await options.service.installations.list(
                    {
                        limit: queryInteger(
                            req.query.limit,
                            "limit",
                            20,
                            1,
                            100
                        ),
                        pageToken
                    },
                    req.agentUser as AuthenticatedUser
                )
            );
        })
    );

    router.post(
        "/installations",
        jsonBody,
        asyncRoute(async (req, res) => {
            const body = req.body;
            if (
                !req.is("application/json") ||
                !body ||
                typeof body !== "object" ||
                Array.isArray(body) ||
                Object.keys(body).some(
                    (key) => key !== "sourceSkillId" && key !== "alias"
                )
            ) {
                // The recipient is always the authenticated caller.
                throw new AgentSkillError(
                    "Request body must be { sourceSkillId, alias? }",
                    400,
                    "INVALID_INSTALLATION_REQUEST"
                );
            }
            const result = await options.service.installations.install(
                body,
                req.agentUser as AuthenticatedUser
            );
            res.location(
                `/api/v0/agent/skills/installations/${encodeURIComponent(
                    result.installation.id
                )}`
            );
            res.status(result.created ? 201 : 200).json(result.installation);
        })
    );

    router.get(
        "/installations/:id",
        asyncRoute(async (req, res) => {
            res.set("Cache-Control", "private, no-store");
            res.json(
                await options.service.installations.get(
                    req.params.id,
                    req.agentUser as AuthenticatedUser
                )
            );
        })
    );

    router.delete(
        "/installations/:id",
        asyncRoute(async (req, res) => {
            await options.service.installations.uninstall(
                req.params.id,
                req.agentUser as AuthenticatedUser
            );
            res.status(204).end();
        })
    );

    // Publish an installed shared copy as the caller's own user skill in the
    // installation's place (`mgd agent-skill publish --force`).
    router.post(
        "/installations/:id/publish",
        asyncMiddleware(async (req, res) => {
            await options.service.prepareCreate(
                "user",
                req.agentUser as AuthenticatedUser
            );
        }),
        (req, res, next) => {
            if (
                req.get("content-type")?.split(";", 1)[0] !== "application/zip"
            ) {
                res.status(415).json({
                    error: {
                        code: "UNSUPPORTED_MEDIA_TYPE",
                        message: "Content-Type must be application/zip"
                    }
                });
                return;
            }
            next();
        },
        admitUpload,
        express.raw({
            type: "application/zip",
            limit: options.maxCompressedBytes
        }),
        uploadBodyReceived,
        asyncRoute(async (req, res) => {
            const result = await options.service.installations.fork(
                req.params.id,
                req.body as Buffer,
                req.agentUser as AuthenticatedUser
            );
            res.location(
                `/api/v0/agent/skills/user/${encodeURIComponent(
                    result.publication.id
                )}`
            );
            res.status(201).json(result);
        })
    );

    /* --------------------------- #3861 source access --------------------------- */

    const accessType = (value: string): AgentSkillType => {
        try {
            return pathType(value);
        } catch {
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        }
    };

    router.get(
        "/:type/:id/access",
        asyncRoute(async (req, res) => {
            res.set("Cache-Control", "private, no-store");
            res.json(
                await options.service.access.getAccess(
                    accessType(req.params.type),
                    req.params.id,
                    req.agentUser as AuthenticatedUser
                )
            );
        })
    );

    router.put(
        "/:type/:id/access",
        jsonBody,
        asyncRoute(async (req, res) => {
            const body = req.body;
            if (
                !body ||
                typeof body !== "object" ||
                Array.isArray(body) ||
                Object.keys(body).some(
                    (key) => key !== "public" && key !== "orgUnitId"
                )
            ) {
                throw new AgentSkillError(
                    "Request body must be { public?, orgUnitId? }",
                    400,
                    "INVALID_ACCESS_SETTINGS"
                );
            }
            res.json(
                await options.service.access.updateSystemAccess(
                    accessType(req.params.type),
                    req.params.id,
                    body,
                    req.agentUser as AuthenticatedUser
                )
            );
        })
    );

    router.get(
        "/:type/:id/access/users",
        asyncRoute(async (req, res) => {
            const keyword = queryString(req.query.keyword, "keyword");
            if ((keyword?.length || 0) > 200) {
                throw new AgentSkillError(
                    "keyword is too long",
                    400,
                    "INVALID_QUERY"
                );
            }
            res.set("Cache-Control", "private, no-store");
            res.json(
                await options.service.access.listRecipients(
                    accessType(req.params.type),
                    req.params.id,
                    {
                        offset: queryInteger(
                            req.query.offset,
                            "offset",
                            0,
                            0,
                            100_000
                        ),
                        limit: queryInteger(
                            req.query.limit,
                            "limit",
                            10,
                            1,
                            100
                        ),
                        keyword
                    },
                    req.agentUser as AuthenticatedUser
                )
            );
        })
    );

    router.put(
        "/:type/:id/access/users/:userId",
        asyncRoute(async (req, res) => {
            res.json(
                await options.service.access.addRecipient(
                    accessType(req.params.type),
                    req.params.id,
                    req.params.userId,
                    req.agentUser as AuthenticatedUser
                )
            );
        })
    );

    router.delete(
        "/:type/:id/access/users/:userId",
        asyncRoute(async (req, res) => {
            res.json(
                await options.service.access.removeRecipient(
                    accessType(req.params.type),
                    req.params.id,
                    req.params.userId,
                    req.agentUser as AuthenticatedUser
                )
            );
        })
    );

    router.post(
        "/:type",
        asyncMiddleware(async (req, res) => {
            let type: AgentSkillType;
            try {
                type = pathType(req.params.type);
            } catch {
                res.status(400).json({
                    error: {
                        code: "INVALID_TYPE",
                        message: "type must be system or user"
                    }
                });
                return;
            }
            if (
                req.query.id !== undefined ||
                req.query.userId !== undefined ||
                req.query.ownerId !== undefined
            ) {
                res.status(400).json({
                    error: {
                        code: "CALLER_SELECTED_SKILL_IDENTITY",
                        message:
                            "Agent Skill ids, intended users, and owners are derived from publication type, the authenticated user, and SKILL.md name"
                    }
                });
                return;
            }
            res.locals.agentSkillType = type;
            await options.service.prepareCreate(
                type,
                req.agentUser as AuthenticatedUser
            );
        }),
        (req, res, next) => {
            if (
                req.get("content-type")?.split(";", 1)[0] !== "application/zip"
            ) {
                res.status(415).json({
                    error: {
                        code: "UNSUPPORTED_MEDIA_TYPE",
                        message: "Content-Type must be application/zip"
                    }
                });
                return;
            }
            next();
        },
        admitUpload,
        express.raw({
            type: "application/zip",
            limit: options.maxCompressedBytes
        }),
        uploadBodyReceived,
        asyncRoute(async (req, res) => {
            const result = await options.service.createAuthorized(
                res.locals.agentSkillType as AgentSkillType,
                req.body as Buffer,
                req.agentUser as AuthenticatedUser
            );
            res.location(
                `/api/v0/agent/skills/${result.type}/${encodeURIComponent(
                    result.id
                )}`
            );
            res.status(201).json(result);
        })
    );

    router.get(
        "/:type/:id/archive",
        asyncRoute(async (req, res) => {
            let type: AgentSkillType;
            try {
                type = pathType(req.params.type);
            } catch {
                res.status(404).json({
                    error: {
                        code: "AGENT_SKILL_NOT_FOUND",
                        message: "Agent Skill not found"
                    }
                });
                return;
            }
            const record = await options.service.prepareExisting(
                type,
                req.params.id,
                "read",
                req.agentUser as AuthenticatedUser
            );
            const archive = await options.service.downloadAuthorized(
                record,
                req.agentUser as AuthenticatedUser
            );
            res.set({
                "Content-Type": "application/zip",
                "Content-Length": String(archive.length),
                "Content-Disposition": `attachment; filename="${record.name}-${record.id}.zip"`,
                ETag: `"${record.aspects["agent-skill"].checksum}"`
            });
            res.send(archive);
        })
    );

    router.put(
        "/:type/:id/archive",
        asyncMiddleware(async (req, res) => {
            let type: AgentSkillType;
            try {
                type = pathType(req.params.type);
            } catch {
                res.status(404).json({
                    error: {
                        code: "AGENT_SKILL_NOT_FOUND",
                        message: "Agent Skill not found"
                    }
                });
                return;
            }
            res.locals.agentSkillRecord = await options.service.prepareExisting(
                type,
                req.params.id,
                "update",
                req.agentUser as AuthenticatedUser
            );
            res.locals.agentSkillExpectedChecksum = ifMatchChecksum(req);
        }),
        (req, res, next) => {
            if (
                req.get("content-type")?.split(";", 1)[0] !== "application/zip"
            ) {
                res.status(415).json({
                    error: {
                        code: "UNSUPPORTED_MEDIA_TYPE",
                        message: "Content-Type must be application/zip"
                    }
                });
                return;
            }
            next();
        },
        admitUpload,
        express.raw({
            type: "application/zip",
            limit: options.maxCompressedBytes
        }),
        uploadBodyReceived,
        asyncRoute(async (req, res) => {
            res.json(
                await options.service.replaceAuthorized(
                    res.locals.agentSkillRecord as AgentSkillRecord,
                    req.body as Buffer,
                    req.agentUser as AuthenticatedUser,
                    res.locals.agentSkillExpectedChecksum as string
                )
            );
        })
    );

    router.get(
        "/:type/:id",
        asyncRoute(async (req, res) => {
            let type: AgentSkillType;
            try {
                type = pathType(req.params.type);
            } catch {
                res.status(404).json({
                    error: {
                        code: "AGENT_SKILL_NOT_FOUND",
                        message: "Agent Skill not found"
                    }
                });
                return;
            }
            const record = await options.service.prepareExisting(
                type,
                req.params.id,
                "read",
                req.agentUser as AuthenticatedUser
            );
            res.json(await options.service.readAuthorized(record));
        })
    );

    router.delete(
        "/:type/:id",
        asyncRoute(async (req, res) => {
            let type: AgentSkillType;
            try {
                type = pathType(req.params.type);
            } catch {
                res.status(404).json({
                    error: {
                        code: "AGENT_SKILL_NOT_FOUND",
                        message: "Agent Skill not found"
                    }
                });
                return;
            }
            const record = await options.service.prepareExisting(
                type,
                req.params.id,
                "delete",
                req.agentUser as AuthenticatedUser
            );
            await options.service.deleteAuthorized(
                record,
                req.agentUser as AuthenticatedUser,
                ifMatchChecksum(req)
            );
            res.status(204).end();
        })
    );

    return router;
}
