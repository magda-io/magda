import * as express from "express";

import { Router } from "express";
import { sendMail } from "./mail";
import { DatasetMessage } from "./model";

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

    //Get from POSTED form
    const msg: DatasetMessage = {
        senderName: "",
        senderEmail: "",
        message: ""
    };

    router.post("/public/send/dataset/request", function(req, res) {
        sendMail(options, msg, req);
    });

    router.post("/public/send/dataset/:datasetId/question", function(req, res) {
        sendMail(options, msg, req);
    });

    router.post("/public/send/dataset/:datasetId/report", function(req, res) {
        sendMail(options, msg, req);
    });

    return router;
}
