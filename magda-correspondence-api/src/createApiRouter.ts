import * as express from "express";
import * as SMTPConnection from "nodemailer/lib/smtp-connection";
import { Router } from "express";
import { DatasetMessage } from "./model";

export interface ApiRouterOptions {
    jwtSecret: string;
    smtpHostname: string;
    smtpUsername?: string;
    smtpPassword?: string;
    smtpPort: number;
    smtpSecure: boolean;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: Router = express.Router();

    router.get("/healthz", (req, res) => res.status(200).send("OK"));

    function handleDatasetMessage(req: express.Request, res: express.Response) {
        setTimeout(() => {
            const body = req.body as DatasetMessage;

            const randomFloat = Math.random();

            try {
                if (!body.message || !body.senderEmail || !body.senderName) {
                    return res.status(400).send({
                        status: "Failure",
                        error: "Missing input"
                    });
                }

                if (randomFloat > 0.1) {
                    // 1 in 10 chance of failing
                    return res.status(200).send({
                        status: "success"
                    });
                } else {
                    throw Error("Randomly generated error for fun");
                }
            } catch (e) {
                return res.status(500).send({
                    status: "failure",
                    error: e.message
                });
            }
        }, 1000);
    }

    function send(message: DatasetMessage) {
        let connection = new SMTPConnection({
            host: options.smtpHostname,
            port: options.smtpPort,
            secure: options.smtpSecure
        });
        connection.secure = true;
        connection.connect().then(() => {});
    }

    router.post("/public/send/dataset/request", send);

    router.post(
        "/public/send/dataset/:datasetId/question",
        handleDatasetMessage
    );

    router.post("/public/send/dataset/:datasetId/report", handleDatasetMessage);

    return router;
}
