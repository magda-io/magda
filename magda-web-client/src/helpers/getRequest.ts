import request from "./request";
import getRequestNoCache from "./getRequestNoCache";

export default async function getRequest<T = any, CT = string>(
    url: string,
    noCache: boolean = false,
    extraFetchOptions: RequestInit = {}
) {
    if (noCache) {
        return await getRequestNoCache<T, CT>(url, extraFetchOptions);
    } else {
        return await request<T, CT>(
            "GET",
            url,
            undefined,
            undefined,
            undefined,
            extraFetchOptions
        );
    }
}
