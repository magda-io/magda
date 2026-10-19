import express from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";
import { createWorkspaceAuth } from "./auth.js";
import { AgentManager } from "./manager.js";
import { ManagerConfig } from "./types.js";
import createAgentSkillRouter from "./skills/router.js";
import { AgentSkillError, AgentSkillService } from "./skills/service.js";
import { DownstreamServiceError } from "./skills/clients.js";

export default function buildApp(
    config: ManagerConfig,
    manager: AgentManager,
    skillService?: AgentSkillService
) {
    const app = express();
    app.disable("x-powered-by");

    app.get("/v0/status/live", (_req, res) => res.json({ status: "ok" }));
    app.get("/v0/status/ready", (_req, res) => res.json({ status: "ok" }));

    // Keep Agent Skill authorization ahead of every body parser so denied create
    // requests are rejected before ZIP bytes are buffered or parsed.
    if (skillService) {
        app.use(
            "/v0/skills",
            createAgentSkillRouter({
                service: skillService,
                jwtSecret: config.jwtSecret,
                authApiUrl: config.authApiUrl,
                maxCompressedBytes: config.skillArchiveMaxCompressedBytes
            })
        );
    }

    app.use(express.json({ limit: "32kb" }));

    const privateRouter = express.Router();
    privateRouter.use((req, res, next) => {
        const token = req.get("X-Magda-Session");
        const providedSecret = Buffer.from(
            req.get("X-Magda-Agent-Control") || ""
        );
        const expectedSecret = Buffer.from(config.controlPlaneSecret);
        try {
            if (
                providedSecret.length !== expectedSecret.length ||
                !timingSafeEqual(providedSecret, expectedSecret)
            ) {
                throw new Error();
            }
            const payload = jwt.verify(token || "", config.jwtSecret, {
                algorithms: ["HS256"]
            }) as JwtPayload;
            if (payload.userId !== config.systemUserId) throw new Error();
            next();
        } catch {
            res.status(403).json({
                state: "DEGRADED",
                message: "Agent Workspace control-plane access denied"
            });
        }
    });
    privateRouter.delete("/users/:userId/session", async (req, res, next) => {
        try {
            res.json(await manager.delete(req.params.userId, true));
        } catch (error) {
            next(error);
        }
    });
    app.use("/v0/private", privateRouter);

    const router = express.Router();
    // Every user-facing lifecycle route requires `agentWorkspace/access` and
    // only ever acts on the authenticated user's own Workspace.
    router.use(
        createWorkspaceAuth({
            jwtSecret: config.jwtSecret,
            authApiUrl: config.authApiUrl
        })
    );
    router.get("/session", async (req, res, next) => {
        try {
            res.json(await manager.status(req.agentUser!.id));
        } catch (error) {
            next(error);
        }
    });
    router.post("/session", async (req, res, next) => {
        try {
            res.status(202).json(await manager.start(req.agentUser!.id));
        } catch (error) {
            next(error);
        }
    });
    router.post("/session/resume", async (req, res, next) => {
        try {
            res.status(202).json(await manager.resume(req.agentUser!.id));
        } catch (error) {
            next(error);
        }
    });
    router.post("/session/reset", async (req, res, next) => {
        try {
            res.status(202).json(await manager.reset(req.agentUser!.id));
        } catch (error) {
            next(error);
        }
    });
    router.delete("/session", async (req, res, next) => {
        try {
            const wait = req.query.wait === "true";
            res.status(wait ? 200 : 202).json(
                await manager.delete(req.agentUser!.id, wait)
            );
        } catch (error) {
            next(error);
        }
    });
    app.use("/v0", router);

    app.use(
        (
            error: Error,
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction
        ) => {
            if (error instanceof AgentSkillError) {
                res.status(error.status).json({
                    error: {
                        code: error.code,
                        message: error.message,
                        retryable: error.retryable,
                        ...(error.recordId ? { id: error.recordId } : {})
                    }
                });
                return;
            }
            if (error instanceof DownstreamServiceError) {
                const status = [400, 401, 403, 404, 409].includes(error.status)
                    ? error.status
                    : 503;
                res.status(status).json({
                    error: {
                        code: `${error.service.toUpperCase()}_ERROR`,
                        message: error.message,
                        retryable: status >= 500
                    }
                });
                return;
            }
            if ((error as { type?: string }).type === "entity.too.large") {
                res.status(413).json({
                    error: {
                        code: "SKILL_ARCHIVE_TOO_LARGE",
                        message:
                            "ZIP archive exceeds the compressed size limit",
                        retryable: false
                    }
                });
                return;
            }
            console.error("Agent Manager request failed", error);
            res.status(500).json({
                state: "DEGRADED",
                message: "Agent Workspace request failed",
                retryable: true
            });
        }
    );
    return app;
}
