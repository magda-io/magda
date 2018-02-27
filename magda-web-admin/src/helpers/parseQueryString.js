export default function parseQueryString(query) {
    if (!query) {
        return {};
    }

    return (/^[?#]/.test(query) ? query.slice(1) : query)
        .split("&")
        .reduce((params, param) => {
            let [key, value] = param.split("=");
            params[key] = value
                ? decodeURIComponent(value.replace(/\+/g, " "))
                : "";
            return params;
        }, {});
}
