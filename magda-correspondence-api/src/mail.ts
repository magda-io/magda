import * as nodemailer from "nodemailer";
import * as pug from "pug";
import * as path from "path";
import * as html2text from "html-to-text";

import { ApiRouterOptions } from "./createApiRouter";

import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";

/**
 * Send an email from posted form data
 * @param options - SMTP Server configurations
 * @param msg - to, from, message contents
 * @param postData - form posted data, used to fetch recordID
 */
export function sendMail(
    options: ApiRouterOptions,
    request: any,
    response: any
) {
    const opts = resolveConnectionOptions(options);
    getRecordAsPromise(
        options,
        encodeURIComponent(request.params.datasetId || "")
    )
        .then(result => {
            let templateContext = {
                agencyName: result.aspects["dcat-dataset-strings"].publisher,
                agencyEmail:
                    result.aspects["dcat-dataset-strings"].contactPoint,
                dataset: result.aspects["dcat-dataset-strings"].title,
                requesterName: request.body.senderName,
                requesterEmail: request.body.senderEmail,
                requesterMsg: request.body.message
            };

            //Mail configuration
            const messageConfig = {
                to: result.aspects["dcat-dataset-strings"].contactPoint,
                cc: request.body.senderEmail,
                replyTo: request.body.senderEmail,
                from: "data@digital.gov.au",
                subject: `A question for ${
                    result.aspects["dcat-dataset-strings"].publisher
                } from Data.gov.au`,
                text: html2text.fromString(
                    resolveTemplate(templateContext, request)
                ),
                html: resolveTemplate(templateContext, request),
                attachments: [
                    {
                        filename: "AU-Govt-Logo.jpg",
                        contentType: "image/jpeg",
                        contentDisposition: "inline",
                        path: path.resolve(
                            __dirname,
                            "assets/AU-Govt-Logo.jpg"
                        ),
                        cid: "govAUCrest"
                    },
                    {
                        filename: "Logo.jpg",
                        contentType: "image/jpeg",
                        contentDisposition: "inline",
                        path: path.resolve(__dirname, "assets/Logo.jpg"),
                        cid: "dataGovLogo"
                    }
                ]
            };

            console.log(`Creating SMTP Transport object with given args...`);
            let transporter = nodemailer.createTransport(opts);

            transporter.verify((err, success) => {
                console.log(`...Verifying SMTP Transport connection...`);
                if (err) {
                    console.error(err);
                    response.status(500).send("Something blew up");
                } else {
                    console.log(
                        `...Connection established! \n Attempting to send mail...`
                    );
                    transporter.sendMail(messageConfig, (err, info) => {
                        if (err) {
                            console.error(err);
                            transporter.close();
                            response.status(500).send("Something blew up");
                        } else {
                            console.log(`Mail sent!`);
                            console.log(
                                `Attempting to close SMTP transporter connection...`
                            );
                            transporter.close();
                            response.status(200).send("OK");
                            console.log(
                                `...Closed SMTP transporter connection. \n Success!!!`
                            );
                        }
                    });
                }
            });
        })
        .catch(err => {
            console.error(err);
        });
}

/**
 * Return a Promise<Record> given a dataset ID
 * @param reg Registry client to fetch from
 * @param id Dataset ID to query for
 */
function getRecordAsPromise(opts: ApiRouterOptions, id: string) {
    return new RegistryClient({ baseUrl: opts.registryUrl })
        .getRecord(id, ["dcat-dataset-strings"], [], true)
        .then(result => unionToThrowable(result));
}

/**
 * Return a rendered HTML string from a template, given the type
 * of POST request
 * @param context Object of variables for template
 * @param postedData Form posted data
 */
function resolveTemplate(context: object, postedData: any) {
    switch (postedData.path) {
        case "question":
            return pug.renderFile(
                path.resolve(__dirname, "templates/question.pug"),
                context
            );
        case "report":
            return pug.renderFile(
                path.resolve(__dirname, "templates/report.pug"),
                context
            );
        case "" || undefined:
            return pug.renderFile(
                path.resolve(__dirname, "templates/request.pug"),
                context
            );
    }
    //When in doubt, it's a request!
    return pug.renderFile(
        path.resolve(__dirname, "templates/request.pug"),
        context
    );
}

/**
 * Return an object of configuration arguments for Nodemailer createTransport
 * @param opts The module arguments specified, e.g SMTP port, hostname
 */
function resolveConnectionOptions(opts: ApiRouterOptions) {
    return {
        host: opts.smtpHostname,
        port: opts.smtpPort,
        secure: opts.smtpSecure,
        logger: false,
        debug: false,
        connectionTimeout: 1500,
        auth: {
            user: opts.smtpUsername,
            pass: opts.smtpPassword
        }
    };
}
