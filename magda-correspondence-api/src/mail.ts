import * as html2text from "html-to-text";

import { Message, SMTPMailer } from "./SMTPMailer";
import { DatasetMessage } from "./model";

const auGovtLogoPath = require.resolve("../templates/assets/AU-Govt-Logo.jpg");
const dataGovLogoPath = require.resolve("../templates/assets/Logo.jpg");

/**
 * Send an email from posted form data
 * @param options - SMTP Server configurations
 * @param msg - to, from, message contents
 * @param postData - form posted data, used to fetch recordID
 */
export function sendMail(
    mailer: SMTPMailer,
    defaultRecipient: string,
    input: DatasetMessage,
    html: string,
    subject: string,
    to: string = defaultRecipient
): Promise<{}> {
    const message: Message = {
        to,
        from: `${input.senderName} via data.gov.au <${defaultRecipient}>`,
        replyTo: `${input.senderName} <${input.senderEmail}>`,
        subject,
        text: html2text.fromString(html),
        html,
        attachments: [
            {
                filename: "AU-Govt-Logo.jpg",
                contentType: "image/jpeg",
                contentDisposition: "inline",
                path: auGovtLogoPath,
                cid: "govAUCrest"
            },
            {
                filename: "Logo.jpg",
                contentType: "image/jpeg",
                contentDisposition: "inline",
                path: dataGovLogoPath,
                cid: "dataGovLogo"
            }
        ]
    };

    console.log(
        `Sending with subject ${subject} from ${input.senderEmail} to ${to}`
    );

    return mailer.send(message);
}
