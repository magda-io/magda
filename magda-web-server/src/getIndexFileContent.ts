import * as fs from "fs";
import * as path from "path";
import "isomorphic-fetch";
import { throttle } from "lodash";
import getStaticStyleSheetFileName from "./getStaticStyleSheetFileName";

async function getDynamicContent() {
    // const response = await fetch(`${config.contentApiURL}includeHtml.text`);
    const response = await fetch(
        `https://dev.magda.io/api/v0/content/includeHtml.text`
    );

    if (response.status === 200) {
        return response.text();
    } else {
        return Promise.resolve("");
    }
}

const getDynamicContentThrottled = throttle(getDynamicContent, 60000);

export default async function getIndexFileContent(
    clientRoot: string,
    useLocalStyleSheet: boolean
) {
    const dynamicContentPromise = getDynamicContentThrottled();

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
