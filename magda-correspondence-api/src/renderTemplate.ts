import * as MarkdownIt from "markdown-it";
import * as rp from "request-promise-native";
import * as Mustache from "mustache";

import { DatasetMessage } from "./model";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";

export enum Templates {
    Feedback = "feedback.mustache",
    Question = "question.mustache",
    Request = "request.mustache"
}

const md = new MarkdownIt({
    breaks: true
});

export default async function renderTemplate(
    contentApiUrl: string,
    templateFile: string,
    message: DatasetMessage,
    subject: string,
    externalUrl: string,
    dataset?: Record
) {
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

    const tplContent = await rp(`${contentApiUrl}${templateFile}`);
    return Mustache.render(tplContent, templateContext);
}
