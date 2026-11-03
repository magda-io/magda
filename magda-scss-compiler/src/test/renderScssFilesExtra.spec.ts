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

    it("inlines a node_modules css import when web-client is installed as a package", async () => {
        // the docker image layout: web-client sits in `node_modules/@magda/web-client`,
        // so a relative import written for the monorepo layout misses the hoisted package
        const appRoot = tempy.directory();
        try {
            const clientRoot = path.join(
                appRoot,
                "node_modules/@magda/web-client"
            );
            const srcDir = path.join(clientRoot, "src");
            await fse.ensureDir(path.join(srcDir, "Components/Map"));
            await fse.writeFile(
                path.join(srcDir, "_variables.scss"),
                `$main-color: #123456;`
            );
            await fse.writeFile(path.join(srcDir, "index.scss"), `.root{}`);
            await fse.outputFile(
                path.join(appRoot, "node_modules/leaflet/dist/leaflet.css"),
                `.leaflet-pane{z-index:400}`
            );
            const mapScss = path.join(srcDir, "Components/Map/Map.scss");
            await fse.writeFile(
                mapScss,
                `@import "../../../../node_modules/leaflet/dist/leaflet.css"; .map{margin:0;}`
            );

            const result = await renderScssFilesExtra(
                clientRoot,
                path.join(srcDir, "index.scss"),
                path.join(srcDir, "_variables.scss"),
                [mapScss]
            );

            expect(result).to.contain(".leaflet-pane{z-index:400}");
            expect(result).not.to.contain("@import");
        } finally {
            await fse.remove(appRoot);
        }
    });
});

describe("getScssFileList", () => {
    it("returns files in a stable, sorted order", async () => {
        const clientRoot = tempy.directory();
        try {
            const files: string[] = [];
            for (const dir of ["a", "b", "c", "d", "e"]) {
                for (let i = 0; i < 10; i++) {
                    const file = path.join(
                        clientRoot,
                        "src",
                        dir,
                        `file${i}.scss`
                    );
                    await fse.outputFile(file, `.${dir}${i}{margin:0;}`);
                    files.push(file);
                }
            }

            for (let i = 0; i < 5; i++) {
                expect(await getScssFileList(clientRoot)).to.deep.equal(
                    files.slice().sort()
                );
            }
        } finally {
            await fse.remove(clientRoot);
        }
    });
});
