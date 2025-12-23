import {} from "mocha";
import { expect } from "chai";
import tempy from "tempy";
import path from "path";
import fse from "fs-extra";
import { renderScssFilesExtra } from "../renderScss.js";
import getScssFileList from "../getScssFileList.js";

describe("renderScssFilesExtra", () => {
    it("compiles scss with variable overrides and inlines css imports", async () => {
        const clientRoot = tempy.directory();
        try {
            const srcDir = path.join(clientRoot, "src");
            await fse.ensureDir(srcDir);

            const varFile = path.join(srcDir, "_variables.scss");
            await fse.writeFile(varFile, `$main-color: #123456;`);

            const indexFile = path.join(srcDir, "index.scss");
            await fse.writeFile(
                indexFile,
                `@import "variables"; .root{color:$main-color;}`
            );

            const cssFile = path.join(srcDir, "external.css");
            await fse.writeFile(cssFile, `.external{background:#654321;}`);

            const extraScss = path.join(srcDir, "extra.scss");
            await fse.writeFile(
                extraScss,
                `@import "./external.css"; .extra{margin:0;}`
            );

            const files = await getScssFileList(clientRoot);
            const result = await renderScssFilesExtra(
                clientRoot,
                path.join(clientRoot, "src/index.scss"),
                path.join(clientRoot, "src/_variables.scss"),
                files,
                { "main-color": "#1a2b3c" }
            );

            expect(files).to.include(extraScss);
            expect(result).to.contain(".root{color:#1a2b3c}");
            expect(result).to.contain(".external{background:#654321}");
            expect(result).to.contain(".extra{margin:0}");
        } finally {
            await fse.remove(clientRoot);
        }
    });
});
