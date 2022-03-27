import urijs from "urijs";
import { v4 as uuidv4 } from "uuid";
import md5 from "crypto-js/md5";

// max allowed s3 object key length
// minio implements an s3 alike / compatible API thus the similar limit should apply.
const MAX_KEY_LENGTH = 1024;
const InvalidCharsRegEx = /[^a-zA-Z0-9!\-_.*'()]/g;

function removeInvalidChars(input: string): string {
    if (!input || typeof input !== "string") {
        return "";
    }
    return input.replace(InvalidCharsRegEx, "").replace(/\.+$/, "");
}

/**
 * a valid s3 object key should be no more than 1024 char and only contains char as per:
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
 * Our goal is to construct a valid s3 object key that:
 * - in `datasetId/distId/fileName` pattern
 * - less than 1024 chars. preserve most of file name information.
 * - both `datasetId`, `distId` & `fileName` will be processed to make sure they doesn't contains invalid chars other than:
 *   - a-z, A-Z, 0-9
 *   - Exclamation point (!)
 *   - Hyphen (-)
 *   - Underscore (_)
 *   - Period (.), can't be the ending char.
 *   - Asterisk (*)
 *   - Single quote (')
 *   - Open parenthesis (()
 *   - Close parenthesis ())
 * - any invalid chars (i.e. any chars are not on the list above) will be removed.
 * - if the processed `datasetId` (i.e. after move all invalid chars) is longer than 72 chars, use md5 hash of the original `datasetId` as the `datasetId`.
 * - if the processed `distId` (i.e. after move all invalid chars) is longer than 72 chars, use md5 hash of the original `distId` as the `distId`.
 * - if the produced object key is still longer than 1024, we will make processed `fileName` (i.e. after move all invalid chars) shorter by:
 *   - keep any content after the last period (.) char if the portion is no longer than 32 chars.
 *   - for the portion before the last period (.) char, only keep the first a few chars so that the whole object key is less than 1024 chars.
 *
 * @export
 * @param {string} datasetId
 * @param {string} distId
 * @param {string} fileName
 * @return {*}  {string}
 */
export function getValidS3ObjectKey(
    datasetId: string,
    distId: string,
    fileName: string
): string {
    let processedDatasetId = removeInvalidChars(datasetId);
    let processedDistId = removeInvalidChars(distId);
    let processedFileName = removeInvalidChars(fileName);
    if (!processedDatasetId.length) {
        throw new Error(
            "Failed to create object key: DatasetId after processing is an empty string."
        );
    }
    if (!processedDistId.length) {
        throw new Error(
            "Failed to create object key: DistId after processing is an empty string."
        );
    }
    if (!processedFileName.length) {
        // the file name doesn't contain any valid chars.
        // we generate a file name here.
        processedFileName = `untitled_file_${uuidv4}.dat`;
    }

    // try to shorten the object key as per rules in description above
    if (processedDatasetId.length > 72) {
        processedDatasetId = md5(processedDatasetId).toString();
    }
    if (processedDistId.length > 72) {
        processedDistId = md5(processedDistId).toString();
    }

    const totalLength =
        processedDatasetId.length +
        processedDistId.length +
        processedFileName.length +
        2; // 2 delimiter chars (forward slash)

    if (totalLength < MAX_KEY_LENGTH) {
        // we already got a valid object key
        return `${processedDatasetId}/${processedDistId}/${processedFileName}`;
    }

    // if still too long, we need shorten the file name part.
    const extNameIdx = processedFileName.lastIndexOf(".");
    if (extNameIdx === -1) {
        //there is no extension name, just simply cut the file name to make object key length fall under MAX_KEY_LENGTH
        return `${processedDatasetId}/${processedDistId}/${processedFileName}`.substr(
            0,
            MAX_KEY_LENGTH
        );
    }
    // file extension name length (including `.`)
    const extNameLength = processedFileName.length - extNameIdx;
    const extNameLengthDiff = extNameLength - 32;
    if (extNameLengthDiff > 0) {
        // cut the extName to 32 chars long
        processedFileName = processedFileName.substr(
            0,
            processedFileName.length - extNameLengthDiff
        );

        if (totalLength - extNameLengthDiff < MAX_KEY_LENGTH) {
            return `${processedDatasetId}/${processedDistId}/${processedFileName}`;
        }
    }

    // still too long after cut file extension name, will have to shorten the portion before `.` of the file name
    const newExtNameIdx = processedFileName.lastIndexOf(".");
    const newExtName = processedFileName.substr(newExtNameIdx);
    const newFileNameNoExtName = processedFileName.substring(0, newExtNameIdx);
    // cut newFileNameNoExtName to make total length fall under MAX_KEY_LENGTH
    const excessLength =
        processedDatasetId.length +
        processedDistId.length +
        processedFileName.length +
        2 -
        MAX_KEY_LENGTH;
    return `${processedDatasetId}/${processedDistId}/${newFileNameNoExtName.substr(
        0,
        newFileNameNoExtName.length - excessLength
    )}${newExtName}`;
}

export default function getStorageUrl(
    datasetId: string,
    distId: string,
    fileName: string
) {
    const validObjectKey = getValidS3ObjectKey(datasetId, distId, fileName);
    const parts = validObjectKey.split("/");
    if (parts.length !== 3) {
        throw new Error(
            `Failed to create storage object download url for a file. Invalid object object key generated: ${validObjectKey}`
        );
    }
    return urijs("magda://storage-api").segmentCoded(parts).toString();
}
