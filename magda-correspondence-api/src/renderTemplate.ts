import * as MarkdownIt from "markdown-it";

import { DatasetMessage } from "./model";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import EmailTemplateRender from "./EmailTemplateRender";
import { Attachment } from "./SMTPMailer";

export enum Templates {
    Feedback = "emailTpls/feedback.html",
    Question = "emailTpls/question.html",
    Request = "emailTpls/request.html"
}

const md = new MarkdownIt({
    breaks: true
});

export interface RenderResult {
    renderedContent: string;
    attachments: Attachment[];
}

export default async function renderTemplate(
    tplRender: EmailTemplateRender,
    templateFile: string,
    message: DatasetMessage,
    subject: string,
    externalUrl: string,
    dataset?: Record
): Promise<RenderResult> {
    const templateContext = {
        message: {
            ...message,
            html: md.render(message.message)
        },
        subject,
        dataset: dataset && {
            ...dataset.aspects["dcat-dataset-strings"],
            url: externalUrl + "/dataset/" + encodeURIComponent(dataset.id)
        }
    };

    const renderedContent = await tplRender.render(
        templateFile,
        templateContext
    );
    return { renderedContent, attachments: tplRender.attachments };
}
