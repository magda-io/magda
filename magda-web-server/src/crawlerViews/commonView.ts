import markdownToHtml from "magda-typescript-common/src/markdownToHtml.js";

interface ContentType {
    title?: string;
    __content: string;
    canonicalUrl: string;
    sitemapUrl: string;
}

const commonView = (
    { title, __content, canonicalUrl, sitemapUrl }: ContentType,
    shouldShowFullVersionLink: boolean = false,
    fullVersionUrl: string = ""
) => {
    return `<!doctype html>
    <html>
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            ${
                canonicalUrl
                    ? `<link rel="canonical" href="${canonicalUrl}">`
                    : ""
            }
            ${
                sitemapUrl
                    ? `<link rel="sitemap" type="application/xml" href="${sitemapUrl}">`
                    : ""
            }
        </head>
        <body>
            ${markdownToHtml(__content, true)}
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
