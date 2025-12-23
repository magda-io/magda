import * as sass from "sass";
import cleancss from "clean-css";
import fse from "fs-extra";
import escapeStringRegexp from "escape-string-regexp";
import postcss from "postcss";
import autoprefixer from "autoprefixer";
import path from "path";

const cssImportRegex = /@import\s+(?:url\()?['"]([^'"]+\.css)['"]\)?\s*;?/gi;
const urlLikeRegex = /^[a-z][a-z0-9+.-]*:/i;

const collectCssImports = async (
    files: string[]
): Promise<Map<string, string>> => {
    const cssImports = new Map<string, string>();
    for (const file of files) {
        const contents = await fse.readFile(file, { encoding: "utf-8" });
        for (const match of contents.matchAll(cssImportRegex)) {
            const importPath = match[1];
            if (!importPath || urlLikeRegex.test(importPath)) {
                continue;
            }
            const resolvedPath = path.isAbsolute(importPath)
                ? importPath
                : path.resolve(path.dirname(file), importPath);
            if (!fse.existsSync(resolvedPath)) {
                console.warn(
                    `Skipping CSS import "${importPath}" from ${file} (missing at ${resolvedPath}).`
                );
                continue;
            }
            if (!cssImports.has(importPath)) {
                cssImports.set(
                    importPath,
                    await fse.readFile(resolvedPath, { encoding: "utf-8" })
                );
            }
        }
    }
    return cssImports;
};

const inlineCssImports = (css: string, cssImports: Map<string, string>) => {
    let result = css;
    for (const [importPath, contents] of cssImports) {
        const importRegex = new RegExp(
            `@import\\s+(?:url\\()?['\\"]${escapeStringRegexp(
                importPath
            )}['\\"]\\)?\\s*;?`,
            "g"
        );
        result = result.replace(importRegex, `\n${contents}\n`);
    }
    return result;
};

export const renderScssData = async (
    clientRoot: string,
    data: string,
    cssImports?: Map<string, string>
) => {
    const result = sass.compileString(data, {
        loadPaths: [
            path.join(clientRoot, "src"),
            path.join(clientRoot, "node_modules"),
            path.resolve(clientRoot, "../.."),
            path.resolve(clientRoot, "../../../component/node_modules")
        ]
    });
    const rawCss =
        cssImports && cssImports.size
            ? inlineCssImports(result.css, cssImports)
            : result.css;
    const postCssResult = await postcss([autoprefixer]).process(rawCss, {
        //--- from & to are name only used for sourcemap
        from: "sass-raw.css",
        to: "stylesheet.css"
    });
    postCssResult.warnings().forEach((warn) => {
        console.warn(warn.toString());
    });
    const cssOption: any = { returnPromise: true, inline: ["none"] };
    const cssResult = await new cleancss(cssOption).minify(postCssResult.css);
    return cssResult.styles;
};

export const renderScssFiles = async (
    clientRoot: string,
    files: string[],
    params: object = {}
) => {
    const cssImports = await collectCssImports(files);
    return await renderScssData(
        clientRoot,
        files.map((file: string) => `@import "${file}";`).join(""),
        cssImports
    );
};

export const replaceParamsFromScss = (data: string, params: any = {}) => {
    let result = data;
    Object.keys(params).forEach((key) => {
        const varName = escapeStringRegexp(key);
        const regex = new RegExp(`\\$${varName}:[^;]+;`, "img");
        result = result.replace(regex, `$${key}: ${params[key]};`);
    });
    return result;
};

export const renderScssFilesExtra = async (
    clientRoot: string,
    orgIdxfile: string,
    orgVarFile: string,
    otherfiles: string[],
    params: object = {}
) => {
    const varFileContent: string = await fse.readFile(orgVarFile, {
        encoding: "utf-8"
    });
    await fse.writeFile(
        orgVarFile,
        replaceParamsFromScss(varFileContent, params)
    );

    otherfiles.unshift(orgIdxfile);
    const cssImports = await collectCssImports(otherfiles);
    return await renderScssData(
        clientRoot,
        otherfiles.map((file: string) => `@import "${file}";`).join(""),
        cssImports
    );
};
