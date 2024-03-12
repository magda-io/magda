import MarkdownIt from "markdown-it";
import { DatasetMessage } from "./model.js";
import { Record } from "magda-typescript-common/src/generated/registry/api.js";
import appendUrlSegments from "magda-typescript-common/src/appendUrlSegments.js";
import EmailTemplateRender from "./EmailTemplateRender.js";
import { Attachment } from "./SMTPMailer.js";

export enum Templates {
    Feedback = "emailTemplates/feedback.html",
    Question = "emailTemplates/question.html",
    Request = "emailTemplates/request.html"
}

const md = new MarkdownIt({
    breaks: true
});

export interface RenderResult {
    renderedContent: string;
    attachments: Attachment[];
}

export default async function renderTemplate(
    templateRender: EmailTemplateRender,
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
            url: appendUrlSegments(externalUrl, ["dataset", dataset.id])
        }
    };

    const renderedContent = await templateRender.render(
        templateFile,
        templateContext
    );
    return { renderedContent, attachments: templateRender.attachments };
}
