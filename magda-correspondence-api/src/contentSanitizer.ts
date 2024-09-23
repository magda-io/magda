import { DatasetMessage } from "./model.js";

const urlRegex = /((https?|ftp|sftp|msteams|app):\/\/)((www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*))/gi;
export const sanitizeUrl = (text: string) => text.replace(urlRegex, "[URL]$3");
export const textSanitizer = (text: string) => {
    return sanitizeUrl(text);
};

function contentSanitizer<T extends string | DatasetMessage>(input: T): T {
    if (typeof input === "string") {
        return textSanitizer(input) as T;
    } else {
        let result = input as DatasetMessage;
        if (result?.senderName) {
            result = {
                ...result,
                senderName: textSanitizer(result.senderName)
            };
        }
        if (input?.message) {
            result = {
                ...result,
                message: textSanitizer(result.message)
            };
        }
        if (input?.note) {
            result = {
                ...result,
                note: textSanitizer(result.note)
            };
        }
        return result as T;
    }
}

export default contentSanitizer;
