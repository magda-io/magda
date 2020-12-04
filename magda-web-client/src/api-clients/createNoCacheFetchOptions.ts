export default function createNoCacheFetchOptions(
    fetchOptions: RequestInit = {}
) {
    const options = { ...fetchOptions };
    if (!options.headers) {
        options.headers = {};
    }
    options.headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    options.headers["Pragma"] = "no-cache";
    options.headers["Expires"] = "0";
    options.cache = "reload";
    return options;
}
