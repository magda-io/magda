import * as fs from "fs";
import * as path from "path";
import getStaticStyleSheetFileName from "./getStaticStyleSheetFileName";

export default function getIndexFileContent(
    clientRoot: string,
    useLocalStyleSheet: boolean
) {
    const indexFileContent = fs.readFileSync(
        path.join(clientRoot, "build/index.html"),
        {
            encoding: "utf-8"
        }
    );
    if (useLocalStyleSheet) {
        const cssFileName = getStaticStyleSheetFileName(clientRoot);
        return indexFileContent.replace(
            "/api/v0/content/stylesheet.css",
            `/static/css/${cssFileName}`
        );
    }
    return indexFileContent;
}
