import { History } from "history";
import urijs from "urijs";
import { config } from "../config";
const { uiBaseUrl } = config;

function getCompleteUrl(url: string) {
    const uri = urijs(url);
    if (uri.hostname()) {
        // --- absolute url, should be the final url
        return url;
    }
    if (url.indexOf("/") !== 0) {
        // not starts with "/", it will be considered as relative url
        // redirect directly
        return url;
    }

    const uiBaseUrlStr = typeof uiBaseUrl !== "string" ? "" : uiBaseUrl.trim();

    if (!uiBaseUrlStr || uiBaseUrlStr === "/") {
        return url;
    }

    const completeUrl =
        (uiBaseUrlStr.lastIndexOf("/") === uiBaseUrlStr.length - 1
            ? uiBaseUrlStr.substr(0, uiBaseUrlStr.length - 1)
            : uiBaseUrlStr) + url;

    if (completeUrl.indexOf("/") !== 0) {
        return "/" + completeUrl;
    } else {
        return completeUrl;
    }
}

function redirect(
    history: History,
    url: string,
    queryParams?: { [key: string]: any }
) {
    const completeUrl = getCompleteUrl(url);
    if (!queryParams || typeof queryParams !== "object") {
        history.push(completeUrl);
        return;
    }
    const completeUri = urijs(completeUrl);
    history.push(
        completeUri
            .search({ ...completeUri.search(true), ...queryParams })
            .toString()
    );
}

export default redirect;
