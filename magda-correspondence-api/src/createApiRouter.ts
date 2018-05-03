import * as express from "express";
import * as SMTPConnection from "nodemailer/lib/smtp-connection";
import * as pug from "pug";
import * as path from "path";

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

    /**
     * Send an email to a SMTP backend, give the args provided by the API
     * @param message - Message object, contains a to, from and body
     */
    function sendMail(message: DatasetMessage) {
        //SMTP Connection
        let connection = new SMTPConnection({
            host: options.smtpHostname,
            port: options.smtpPort,
            secure: options.smtpSecure,
            logger: true,
            debug: false,
            connectionTimeout: 3000
        });

        //SMTP Authenticate credentials
        const auth = {
            user: options.smtpUsername,
            pass: options.smtpPassword
        };

        //SMTP 'Header'
        const envelope = {
            to: "",
            from: ""
        };

        //SMTP Template body
        const msg = pug.compileFile(
            path.resolve(__dirname, "templates/request.pug")
        );

        //SMTP Template context
        const templateContext = {
            agencyName: "",
            agencyEmail: "",
            dataset: "",
            requesterName: "",
            requesterEmail: "",
            requesterMsg: ""
        };

        connection.connect(() => {
            console.log(
                `Attempting to establish SMTP connection with SMTP server...`
            );
            connection.login(auth, err => {
                if (err) {
                    console.error(`${err}`);
                } else {
                    console.log(
                        `...Connection established! \n Attempting to authenticate...`
                    );
                }
                connection.send(envelope, msg(templateContext), (info, err) => {
                    if (err) {
                        console.error(`${JSON.stringify(err)}`);
                    } else {
                        console.log(
                            `...Authenticatation successful! Sending mail.`
                        );
                        connection.quit();
                    }
                });
            });
        });
    }

    router.post("/public/send/dataset/request", handleDatasetMessage);

    router.post(
        "/public/send/dataset/:datasetId/question",
        handleDatasetMessage
    );

    router.post("/public/send/dataset/:datasetId/report", handleDatasetMessage);

    return router;
}
