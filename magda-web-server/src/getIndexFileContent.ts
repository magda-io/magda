import * as fs from "fs";
import * as path from "path";
import "isomorphic-fetch";
import { throttle } from "lodash";

import getStaticStyleSheetFileName from "./getStaticStyleSheetFileName";

async function getDynamicContent(contentApiBaseUrl: string) {
    const url = `${contentApiBaseUrl}includeHtml.text`;

    const response = await fetch(url);

    if (response.status === 200) {
        return response.text();
    } else {
        console.error(
            `Received status ${response.status}: ${
                response.statusText
            } from ${url} when getting dynamic content`
        );
        return Promise.resolve("");
    }
}

async function getIndexFileContent(
    clientRoot: string,
    useLocalStyleSheet: boolean,
    contentApiBaseUrl: string
) {
    const dynamicContentPromise = getDynamicContent(contentApiBaseUrl);

    let indexFileContent = fs.readFileSync(
        path.join(clientRoot, "build/index.html"),
        {
            encoding: "utf-8"
        }
    );

    const dynamicContent = await dynamicContentPromise;

    if (dynamicContent) {
        indexFileContent = indexFileContent.replace(
            "</body>",
            dynamicContent + "</body>"
        );
    }

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
