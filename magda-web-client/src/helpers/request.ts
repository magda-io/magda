import { config } from "config";
import fetch from "isomorphic-fetch";

export default async function request(
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

    const response = await fetch(url, fetchOptions);

    if (response.status >= 200 && response.status < 300) {
        // wrapping this in try/catch as the request succeeded
        // this is just haggling over response content
        try {
            return await response.json();
        } catch (e) {
            try {
                return await response.text();
            } catch (e) {
                return;
            }
        }
    }
    throw new Error(await response.text());
}
