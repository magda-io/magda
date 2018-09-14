import * as sass from "node-sass";
import * as cleancss from "clean-css";
import * as tempy from "tempy";
import * as fse from "fs-extra";
import * as escapeStringRegexp from "escape-string-regexp";

export const renderScssData = (clientRoot: string, data: string) => {
    return new Promise((resolve, reject) => {
        sass.render(
            {
                data,
                includePaths: [clientRoot + "/src"]
            },
            (error, result) => {
                if (!error) {
                    resolve(result);
                } else {
                    reject(error);
                }
            }
        );
    })
        .then((result: sass.Result) => {
            const cssOption: any = { returnPromise: true };
            return new cleancss(cssOption).minify(result.css);
        })
        .then(cssResult => cssResult.styles);
};

export const renderScssFiles = async (
    clientRoot: string,
    files: string[],
    params: object = {}
) => {
    return await renderScssData(
        clientRoot,
        files.map((file: string) => `@import "${file}";`).join("")
    );
};

export const replaceParamsFromScss = (data: string, params: any = {}) => {
    let result = data;
    Object.keys(params).forEach(key => {
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
    const varFile = tempy.file();
    await fse.writeFile(varFile, replaceParamsFromScss(varFileContent, params));
    const idxFileContent: string = await fse.readFile(orgIdxfile, {
        encoding: "utf-8"
    });
    const indexFile = tempy.file();
    await fse.writeFile(
        indexFile,
        idxFileContent.replace(`@import "variables";`, "")
    );

    otherfiles.unshift(indexFile);
    otherfiles.unshift(varFile);
    return await renderScssData(
        clientRoot,
        otherfiles.map((file: string) => `@import "${file}";`).join("")
    );
};
