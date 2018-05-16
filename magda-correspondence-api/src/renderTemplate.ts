import * as pug from "pug";
import * as path from "path";

import { DatasetMessage } from "./model";

export enum Templates {
    Feedback = "feedback",
    Question = "question",
    Request = "request"
}

type TemplatesLookup = { [key in Templates]: pug.compileTemplate };

const templates: TemplatesLookup = {
    request: pug.compileFile(path.resolve(__dirname, "templates/request.pug")),
    question: pug.compileFile(
        path.resolve(__dirname, "templates/question.pug")
    ),
    feedback: pug.compileFile(path.resolve(__dirname, "templates/feedback.pug"))
};

export default function renderTemplate(
    template: Templates,
    message: DatasetMessage,
    subject: string,
    dataset?: object
) {
    const templateContext = {
        message,
        dataset,
        subject
    };

    const templateFn = (templates as { [x: string]: pug.compileTemplate })[
        template
    ];

    return templateFn(templateContext);
}
