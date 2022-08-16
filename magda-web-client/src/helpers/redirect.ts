import { History } from "history";
import urijs from "urijs";
import { config } from "../config";
const { uiBaseUrl } = config;

// We likely never need this function as history is auto-configured with based by react-router
// https://github.com/remix-run/history/blob/3f69f9e07b0a739419704cffc3b3563133281548/modules/createBrowserHistory.js#L151
function getCompleteUrl(url: string): string {
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
): void {
    if (!queryParams || typeof queryParams !== "object") {
        history.push(url);
        return;
    }
    const uri = urijs(url);
    history.push(
        uri.search({ ...uri.search(true), ...queryParams }).toString()
    );
}

export default redirect;
