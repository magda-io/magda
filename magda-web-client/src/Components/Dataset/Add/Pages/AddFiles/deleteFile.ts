import { config } from "config";
import getStorageApiResourceAccessUrl from "helpers/getStorageApiResourceAccessUrl";
import { Distribution } from "../../DatasetAddCommon";
import UserVisibleError from "helpers/UserVisibleError";

/**
 * Deletes the file belonging to a distribution
 */
export default async function deleteFile(distToDelete: Distribution) {
    // While delete is in progress, warn the user not to close the tab if they try
    const unloadEventListener = (e: BeforeUnloadEvent) => {
        // Preventing default makes a warning come up in FF
        e.preventDefault();
        // Setting a return value shows the warning in Chrome
        e.returnValue =
            "Closing this page might cause the file not to be fully deleted, are you sure?";
        // The return value is shown inside the prompt in IE
    };

    window.addEventListener("beforeunload", unloadEventListener);

    // fetch to delete distribution - try to delete even if we hadn't completed the initial upload
    // just to be safe
    try {
        const res = await fetch(
            getStorageApiResourceAccessUrl(distToDelete.downloadURL!),
            {
                ...config.credentialsFetchOptions,
                method: "DELETE"
            }
        );
        // Even a delete on a non-existent file returns 200
        if (res.status !== 200) {
            throw new Error("Could not delete file");
        }
    } catch (err) {
        console.error(
            `Failed to delete file:\n URL: ${distToDelete.downloadURL!}\n ${
                "" + err
            }`
        );
        throw new UserVisibleError(
            `Failed to remove file ${distToDelete.title} from the system's storage. If you removed this ` +
                `file because it shouldn't be stored on the system, please contact ${
                    config.defaultContactEmail
                        ? config.defaultContactEmail
                        : "Administrator"
                }` +
                ` to ensure that it's properly removed.`
        );
    } finally {
        window.removeEventListener("beforeunload", unloadEventListener);
    }
}
