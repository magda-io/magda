function getFileExtension(filename?: string) {
    if (!filename) {
        return "";
    }
    const ext = filename.split(".").pop();
    if (ext === filename) return "";
    return ext;
}

function getFormatFromFileName(filename?: string) {
    const ext = getFileExtension(filename);
    return ext ? ext.toUpperCase() : "UNKNOWN";
}

export default getFormatFromFileName;
