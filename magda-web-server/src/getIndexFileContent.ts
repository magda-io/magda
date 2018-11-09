import * as fs from "fs";
import * as path from "path";
import "isomorphic-fetch";
import { throttle, memoize } from "lodash";

import getStaticStyleSheetFileName from "./getStaticStyleSheetFileName";

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
                `Received status ${response.status}: ${
                    response.statusText
                } from ${url} when getting dynamic content`
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
 */
async function getIndexFileContent(
    clientRoot: string,
    useLocalStyleSheet: boolean,
    contentApiBaseUrlInternal: string
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

    if (useLocalStyleSheet) {
        const cssFileName = getStaticStyleSheetFileName(clientRoot);
        indexFileContent = indexFileContent.replace(
            "/api/v0/content/stylesheet.css",
            `/static/css/${cssFileName}`
        );
    }

    return indexFileContent;
}

export default throttle(getIndexFileContent, 60000);
