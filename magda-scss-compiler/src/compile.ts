import getScssFileList from "./getScssFileList";
import { renderScssFilesExtra } from "./renderScss";
const compile = async (clientRoot: string, scssVars: object = {}) => {
    console.log("Scanning SCSS files from web-client...");
    const files = await getScssFileList(clientRoot);
    return await renderScssFilesExtra(
        clientRoot + "/src/index.scss",
        clientRoot + "/src/_variables.scss",
        files,
        scssVars
    );
};

export default compile;
