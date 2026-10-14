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
                    req.agentUser as AuthenticatedUser
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
                req.agentUser as AuthenticatedUser
            );
            res.status(204).end();
        })
    );

    return router;
}
