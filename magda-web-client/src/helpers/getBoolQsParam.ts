import { Location } from "history";

function getBoolQsParam<T = boolean>(
    paramName: string,
    location?: Location,
    defaultValue: T = false as T
): T {
    const params = location
        ? new URLSearchParams(location?.search ? location.search : "")
        : new URL(window.location.href).searchParams;
    if (!params.size) {
        return defaultValue as T;
    }
    if (!params.has(paramName)) {
        return defaultValue as T;
    }
    const paramVal = params.get(paramName)?.toLowerCase();
    return (paramVal === "false" || paramVal === "0" ? false : true) as T;
}

export default getBoolQsParam;
