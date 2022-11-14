import { config } from "../config";
import urijs from "urijs";

const isStorageApiUrl = (resourceUrl: string) => {
    const uri = urijs(resourceUrl);
    if (uri.protocol() === "magda" && uri.hostname() === "storage-api") {
        return true;
    } else if (resourceUrl.indexOf(config.storageApiBaseUrl) !== -1) {
        return true;
    } else {
        return false;
    }
};

export default isStorageApiUrl;
