import request from "./request";
import getRequestNoCache from "./getRequestNoCache";
import { config } from "../config";

export default async function getRequest<T = any, CT = string>(
    url: string,
    noCache: boolean = false,
    extraFetchOptions: RequestInit = {}
) {
    const fetchOptions = {
        ...config.commonFetchRequestOptions,
        ...extraFetchOptions,
        ...(extraFetchOptions?.headers
            ? {
                  headers: {
                      ...config.commonFetchRequestOptions.headers,
                      ...extraFetchOptions.headers
                  }
              }
            : {})
    };
    if (noCache) {
        return await getRequestNoCache<T, CT>(url, fetchOptions);
    } else {
        return await request<T, CT>(
            "GET",
            url,
            undefined,
            undefined,
            undefined,
            fetchOptions
        );
    }
}
