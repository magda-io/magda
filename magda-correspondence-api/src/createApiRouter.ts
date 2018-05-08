import * as express from "express";

import { Router } from "express";
import { sendMail } from "./mail";

export interface ApiRouterOptions {
    jwtSecret: string;
    registryUrl: string;
    smtpHostname: string;
    smtpUsername?: string;
    smtpPassword?: string;
    smtpPort: number;
    smtpSecure: boolean;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: Router = express.Router();
    router.get("/healthz", (req, res) => res.status(200).send("OK"));

    router.post("/public/send/dataset/request", function(req, res) {
        sendMail(options, req, res);
    });

    router.post("/public/send/dataset/:datasetId/question", function(req, res) {
        sendMail(options, req, res);
    });

    router.post("/public/send/dataset/:datasetId/report", function(req, res) {
        sendMail(options, req, res);
    });

    return router;
}
