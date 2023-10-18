import { config } from "../config";

const { uiBaseUrl } = config;
const getAbsoluteUrlPath = (urlPath: string): string => {
    if (!uiBaseUrl || uiBaseUrl === "/") {
        return urlPath;
    }
    const absoluteUrlPath =
        (uiBaseUrl.lastIndexOf("/") === uiBaseUrl.length - 1
            ? uiBaseUrl.substr(0, uiBaseUrl.length - 1)
            : uiBaseUrl) + (urlPath.startsWith("/") ? urlPath : "/" + urlPath);
    return absoluteUrlPath.startsWith("/")
        ? absoluteUrlPath
        : "/" + absoluteUrlPath;
};
export default getAbsoluteUrlPath;
