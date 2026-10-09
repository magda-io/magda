/** image types accepted by the content API image items (e.g. `header/logo`) */
export const SUPPORTED_IMAGE_TYPES = [
    "image/png",
    "image/gif",
    "image/jpeg",
    "image/webp",
    "image/svg+xml"
];

/** the content API stores `favicon.ico` as `image/x-icon` */
export const FAVICON_MIME_TYPE = "image/x-icon";
export const FAVICON_FILE_TYPES = [
    FAVICON_MIME_TYPE,
    "image/vnd.microsoft.icon"
];

/** the content API accepts uploads up to 10mb */
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

export function isFaviconFile(file: File) {
    return (
        FAVICON_FILE_TYPES.indexOf(file.type) !== -1 ||
        // some browsers / OSes report no type for .ico files
        (!file.type && /\.ico$/i.test(file.name))
    );
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
