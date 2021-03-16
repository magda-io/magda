import markdownToHtml from "magda-typescript-common/src/markdownToHtml";

type ContentType = {
    title: string;
    __content: string;
};

const commonView = (
    { title, __content }: ContentType,
    shouldShowFullVersionLink: boolean = false,
    fullVersionUrl: string = ""
) => {
    return `<!doctype html>
    <html>
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style></style>
        </head>
        <body>
            ${markdownToHtml(__content)}
            ${
                shouldShowFullVersionLink && fullVersionUrl
                    ? `<br />
            <blockquote>
                <a href="${fullVersionUrl}">View full version of this page</a>
            </blockquote>`
                    : ""
            }
        </body>
    </html>
    `;
};

export default commonView;
