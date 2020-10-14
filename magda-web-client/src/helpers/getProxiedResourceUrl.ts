import { config } from "config";
import isStorageApiUrl from "./isStorageApiUrl";
import getStorageApiResourceAccessUrl from "./getStorageApiResourceAccessUrl";

export default function getProxiedResourceUrl(
    resourceUrl: string,
    disableCache: boolean = false
) {
    if (isStorageApiUrl(resourceUrl)) {
        return getStorageApiResourceAccessUrl(resourceUrl);
    } else {
        return config.proxyUrl + (disableCache ? "_0d/" : "") + resourceUrl;
    }
}
