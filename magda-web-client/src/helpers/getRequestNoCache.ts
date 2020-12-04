import request from "./request";
import createNoCacheFetchOptions from "api-clients/createNoCacheFetchOptions";

export default async function getRequestNoCache<T = any, CT = string>(
    url: string,
    extraFetchOptions: RequestInit = {}
) {
    return await request<T, CT>(
        "get",
        url,
        undefined,
        undefined,
        undefined,
        createNoCacheFetchOptions(extraFetchOptions)
    );
}
