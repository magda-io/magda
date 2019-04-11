import { config } from "config";
import fetch from "isomorphic-fetch";

export default function request(
    method: string,
    url: string,
    body: any = undefined,
    contentType: string = "application/json"
) {
    const fetchOptions = Object.assign({}, config.fetchOptions, {
        method
    });
    if (body !== undefined) {
        if (contentType === "application/json") {
            fetchOptions.body = JSON.stringify(body);
            fetchOptions.headers = {
                "Content-type": "application/json"
            };
        } else {
            fetchOptions.body = body;
            fetchOptions.headers = {
                "Content-type": contentType
            };
        }
    }

    console.log(method, url, fetchOptions);
    return fetch(url, fetchOptions).then(async response => {
        if (response.status >= 200 && response.status < 300) {
            return response.json();
        }
        throw new Error(await response.text());
    });
}
