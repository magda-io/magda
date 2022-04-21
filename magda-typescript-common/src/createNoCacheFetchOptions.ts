export default function createNoCacheFetchOptions(
    fetchOptions: RequestInit = {}
) {
    const noCacheHeaders = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0"
    };
    const options = { ...fetchOptions };
    if (!options.headers) {
        options.headers = { ...noCacheHeaders };
    } else {
        options.headers = { ...options.headers, ...noCacheHeaders };
    }
    options.cache = "reload";
    return options;
}
