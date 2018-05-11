import * as express from "express";

import { Router } from "express";
import { sendMail } from "./mail";
import { SMTPMailer } from "./SMTPMailer";

export interface ApiRouterOptions {
    jwtSecret: string;
    registryUrl: string;
    smtpMailer: SMTPMailer;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: Router = express.Router();

    router.get("/healthz", (req, res) => res.status(200).send("OK"));

    router.post("/public/send/dataset/request", function(req, res) {
        sendMail(options, req, res);
    });

    return router;
}
