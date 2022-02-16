import { History } from "history";
import urijs from "urijs";
import { config } from "../config";
const { uiBaseUrl } = config;

function redirect(history: History, url: string) {
    const uri = urijs(url);
    if (uri.hostname()) {
        // --- absolute url, redirect directly
        history.push(url);
        return;
    }
    if (url.indexOf("/") !== 0) {
        // not starts with "/", it will be considered as relative url
        // redirect directly
        history.push(url);
        return;
    }

    const uiBaseUrlStr = typeof uiBaseUrl !== "string" ? "" : uiBaseUrl.trim();

    if (!uiBaseUrlStr || uiBaseUrlStr === "/") {
        history.push(url);
        return;
    }

    const completeUrl =
        (uiBaseUrlStr.lastIndexOf("/") === uiBaseUrlStr.length - 1
            ? uiBaseUrlStr.substr(0, uiBaseUrlStr.length - 1)
            : uiBaseUrlStr) + url;

    if (completeUrl.indexOf("/") !== 0) {
        history.push("/" + completeUrl);
    } else {
        history.push(completeUrl);
    }
}

export default redirect;
