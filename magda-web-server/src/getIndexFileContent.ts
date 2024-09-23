import fs from "fs";
import path from "path";
import fetch from "cross-fetch";
import throttle from "lodash/throttle.js";
import memoize from "lodash/memoize.js";

const STATIC_STYLE_REGEX = new RegExp(
    '<link href="\\.\\/static\\/css\\/.*.css" rel="stylesheet">',
    "g"
);

/**
 * Gets the content stored under "includeHtml" in the content api. On failure
 * simply returns a blank string.
 *
 * @param contentApiBaseUrlInternal The base content api to get the content from.
 */
async function getIncludeHtml(contentApiBaseUrlInternal: string) {
    const url = `${contentApiBaseUrlInternal}includeHtml.text`;

    try {
        const response = await fetch(url);

        if (response.status === 200) {
            return response.text();
        } else {
            throw new Error(
                `Received status ${response.status}: ${response.statusText} from ${url} when getting dynamic content`
            );
        }
    } catch (e) {
        console.error(e);
        return Promise.resolve("");
    }
}

/**
 * Gets the base index html file.
 *
 * @param clientRoot The root of the client directory to get the file from.
 */
function getIndexHtml(clientRoot: string): Promise<string> {
    return new Promise((resolve, reject) =>
        fs.readFile(
            path.join(clientRoot, "build/index.html"),
            {
                encoding: "utf-8"
            },
            (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            }
        )
    );
}

/**
 * getIndexHtml, but memoized so that it's not repeatedly accessing a file.
 */
const memoizedGetIndexHtml = memoize(getIndexHtml);

/**
 * Gets the content of the index.html file, including dynamic portions.
 *
 * @param clientRoot The base of the client directory
 * @param useLocalStyleSheet Whether to use a local stylesheet instead of the content api
 * @param contentApiBaseUrlInternal The base URL of the content api
 * @param uiBaseUrl the base URL where the UI serves at. If not specify or empty, assume it's "/"
 * @param appBasePath the base URL where the app gateway / APIs serves at. If not specify or empty, assume it's "/"
 * @param externalUIComponents a list of external UI component JS bundle file urls
 * @param externalCssFiles a list of external CSS file urls
 */
async function getIndexFileContent(
    clientRoot: string,
    useLocalStyleSheet: boolean,
    contentApiBaseUrlInternal: string,
    uiBaseUrl: string,
    appBasePath: string,
    externalUIComponents?: string[],
    externalCssFiles?: string[]
) {
    const dynamicContentPromise = getIncludeHtml(contentApiBaseUrlInternal);
    const indexHtmlPromise = memoizedGetIndexHtml(clientRoot);

    let [dynamicContent, indexFileContent] = await Promise.all([
        dynamicContentPromise,
        indexHtmlPromise
    ]);

    indexFileContent = indexFileContent.replace(
        "</body>",
        dynamicContent + "</body>"
    );

    if (!useLocalStyleSheet) {
        indexFileContent = indexFileContent.replace(STATIC_STYLE_REGEX, "");
        indexFileContent = indexFileContent.replace(
            "</head>",
            `<link href="/api/v0/content/stylesheet.css" rel="stylesheet">\n</head>`
        );

        // --- if `uiBaseUrl` is '/' do nothing
        if (uiBaseUrl !== "/") {
            indexFileContent = indexFileContent.replace(
                '<base href="/">',
                `<base href="${uiBaseUrl}">`
            );
        }

        // -- add sitemap link
        if (uiBaseUrl !== "/") {
            indexFileContent = indexFileContent.replace(
                "</head>",
                `<link rel="sitemap" type="application/xml" href="${uiBaseUrl}sitemap.xml" />\n</head>`
            );
        } else {
            indexFileContent = indexFileContent.replace(
                "</head>",
                '<link rel="sitemap" type="application/xml" href="/sitemap.xml" />\n</head>'
            );
        }

        if (appBasePath !== "/") {
            // if appBasePath not "/", add basePath to API urls
            indexFileContent = indexFileContent.replace(
                /\/api\/v0\//g,
                `${appBasePath}/api/v0/`
            );
        }
    }

    if (externalCssFiles?.length) {
        indexFileContent = indexFileContent.replace(
            "</head>",
            externalCssFiles
                .map((url) => `<link href="${url}" rel="stylesheet">`)
                .join("\n") + `\n</head>`
        );
    }

    if (externalUIComponents?.length) {
        indexFileContent = indexFileContent.replace(
            "</head>",
            externalUIComponents
                .map((url) => `<script src="${url}"></script>`)
                .join("\n") + `\n</head>`
        );
    }

    return indexFileContent;
}

export default throttle(getIndexFileContent, 60000);
