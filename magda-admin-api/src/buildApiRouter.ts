import express from "express";

import _ from "lodash";
import K8SApi from "./k8sApi";
import { mustBeAdmin } from "magda-typescript-common/src/authorization-api/authMiddleware";
import {
    installStatusRouter,
    createServiceProbe
} from "magda-typescript-common/src/express/status";
import { HttpError } from "@kubernetes/client-node";

export interface Options {
    dockerRepo: string;
    authApiUrl: string;
    imageTag: string;
    registryApiUrl: string;
    pullPolicy: string;
    jwtSecret: string;
    userId: string;
    tenantId: number;
    namespace?: string;
}

export default function buildApiRouter(options: Options) {
    const router: express.Router = express.Router();

    const k8sApi = new K8SApi(options.namespace);

    const status = {
        probes: {
            k8s: async () => {
                await k8sApi.getJobs();
                return {
                    ready: true
                };
            },
            auth: createServiceProbe(options.authApiUrl)
        }
    };
    installStatusRouter(router, status);

    router.use(mustBeAdmin(options.authApiUrl, options.jwtSecret));

    router.get("/connectors", async (req, res) => {
        try {
            const connectors = await k8sApi.getConnectors();
            res.json(connectors);
        } catch (e) {
            if (e instanceof HttpError) {
                res.status(e.statusCode).send(e.body);
            } else {
                res.status(500).send(`${e}`);
            }
        }
    });

    router.get("/connectors/:id", async (req, res) => {
        try {
            const connector = await k8sApi.getConnector(req.params.id);
            res.json(connector);
        } catch (e) {
            if (e instanceof HttpError) {
                res.status(e.statusCode).send(e.body);
            } else {
                res.status(500).send(`${e}`);
            }
        }
    });

    router.put("/connectors/:id", async (req, res) => {
        const id = req.params.id;
        await k8sApi.updateConnector(id, req.body);
        const connector = await k8sApi.getConnector(id);
        res.json(connector);
    });

    router.delete("/connectors/:id", async (req, res) => {
        const id = req.params.id;
        const result = await k8sApi.deleteConnector(id);
        res.json({ result });
    });

    router.post("/connectors", async (req, res) => {
        const {
            id,
            dockerImageString,
            dockerImageName,
            ...restConfigData
        } = req.body;

        await k8sApi.createConnector(
            { id, ...restConfigData },
            {
                registryApiUrl: options.registryApiUrl,
                tenantId: options.tenantId,
                defaultUserId: options.userId,
                dockerImageString,
                dockerImageName,
                dockerImageTag: options.imageTag,
                dockerRepo: options.dockerRepo,
                pullPolicy: options.pullPolicy
            }
        );

        const data = await k8sApi.getConnector(id);
        res.json(data);
    });

    router.post("/connectors/:id/start", async (req, res) => {
        const id = req.params.id;
        await k8sApi.startConnector(id);
        res.json({ result: true });
    });

    router.post("/connectors/:id/stop", async (req, res) => {
        const id = req.params.id;
        await k8sApi.stopConnector(id);
        res.json({ result: true });
    });

    return router;
}
