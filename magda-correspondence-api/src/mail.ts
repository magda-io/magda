import { ApiRouterOptions } from "./createApiRouter";
import { Message } from "./SMTPMailer";
import * as html2text from "html-to-text";
import * as path from "path";
import * as pug from "pug";

// import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";
// import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";

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
    let templateContext = {
        requesterName: request.body.senderName,
        requesterEmail: request.body.senderEmail,
        requesterMsg: request.body.message
    };

    const message: Message = {
        to: "data@digital.gov.au",
        from: request.body.senderEmail,
        subject: `A question for from Data.gov.au`,
        text: html2text.fromString(resolveTemplate(templateContext)),
        html: resolveTemplate(templateContext),
        attachments: [
            {
                filename: "AU-Govt-Logo.jpg",
                contentType: "image/jpeg",
                contentDisposition: "inline",
                path: path.resolve(__dirname, "assets/AU-Govt-Logo.jpg"),
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
    options.smtpMailer
        .send(message)
        .then(() => response.status(200).send({ status: "OK" }))
        .catch(() => response.status(500).send({ status: "Failure" }));
}

/**
 * Return a Promise<Record> given a dataset ID
 * @param reg Registry client to fetch from
 * @param id Dataset ID to query for
 */
// function getRecordAsPromise(opts: ApiRouterOptions, id: string) {
//     return new RegistryClient({ baseUrl: opts.registryUrl })
//         .getRecord(id, ["dcat-dataset-strings"], [], true)
//         .then(result => unionToThrowable(result));
// }

function resolveTemplate(context: object) {
    return pug.renderFile(
        path.resolve(__dirname, "templates/request.pug"),
        context
    );
}
