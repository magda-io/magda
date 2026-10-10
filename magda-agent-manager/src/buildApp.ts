import express from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";
import { createAdminAuth } from "./auth.js";
import { AgentManager } from "./manager.js";
import { ManagerConfig } from "./types.js";

export default function buildApp(config: ManagerConfig, manager: AgentManager) {
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "32kb" }));

    app.get("/v0/status/live", (_req, res) => res.json({ status: "ok" }));
    app.get("/v0/status/ready", (_req, res) => res.json({ status: "ok" }));

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
    router.use(
        createAdminAuth({
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
