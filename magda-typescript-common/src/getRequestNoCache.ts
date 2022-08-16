import fetchRequest from "./fetchRequest";
import createNoCacheFetchOptions from "./createNoCacheFetchOptions";

export default async function getRequestNoCache<T = any, CT = string>(
    url: string,
    extraFetchOptions: RequestInit = {}
) {
    return await fetchRequest<T, CT>(
        "get",
        url,
        undefined,
        undefined,
        undefined,
        createNoCacheFetchOptions(extraFetchOptions)
    );
}
