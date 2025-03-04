import fetch from "cross-fetch";
import merge from "lodash/merge.js";
import ServerError from "./ServerError.js";

type RequestContentTypeJson = "application/json";
type RequestContentTypePlainText = "text/plain";
type RequestContentTypeForm = "application/x-www-form-urlencoded";
type RequestContentTypeBinary = "application/octet-stream";
type RequestContentTypeMultipartForm = "multipart/form-data";

type RequestContentType =
    | RequestContentTypeJson
    | RequestContentTypePlainText
    | RequestContentTypeForm
    | RequestContentTypeBinary
    | RequestContentTypeMultipartForm;

let defaultRequestInitOptions: RequestInit = {};

export function setDefaultRequestInitOptions(options: RequestInit) {
    defaultRequestInitOptions = options;
}

export function getDefaultRequestInitOptions() {
    return defaultRequestInitOptions;
}

export default async function fetchRequest<T = any, CT = string>(
    method: string,
    url: string,
    body?: any,
    contentType?: CT | RequestContentType | undefined | null,
    returnHeaders?: false,
    extraRequestOptions?: RequestInit
): Promise<T>;

export default async function fetchRequest<T = any, CT = string>(
    method: string,
    url: string,
    body?: any,
    contentType?: CT | RequestContentType | undefined | null,
    returnHeaders?: true,
    extraRequestOptions?: RequestInit
): Promise<[T, Headers]>;

export default async function fetchRequest<T = any, CT = string>(
    method: string,
    url: string,
    body: any = undefined,
    contentType:
        | CT
        | RequestContentType
        | undefined
        | null = "application/json",
    returnHeaders: boolean = false,
    extraRequestOptions: RequestInit = {}
): Promise<[T, Headers] | T> {
    const defaultOptions = {
        ...(defaultRequestInitOptions ? defaultRequestInitOptions : {})
    };
    const fetchOptions = merge(defaultOptions, {
        method,
        ...extraRequestOptions
    });
    if (body !== undefined) {
        if (contentType === "application/json") {
            fetchOptions.body = JSON.stringify(body);
            fetchOptions.headers = {
                "Content-type": "application/json"
            };
        } else {
            fetchOptions.body = body;
            if (typeof contentType === "string") {
                fetchOptions.headers = {
                    "Content-type": contentType
                };
            }
        }
    }

    const response = await fetch(url, fetchOptions);

    if (response.status >= 200 && response.status < 300) {
        // wrapping this in try/catch as the request succeeded
        // this is just haggling over response content
        return returnHeaders
            ? ([(await response.json()) as T, response.headers] as [T, Headers])
            : ((await response.json()) as T);
    }
    // --- get responseText and remove any HTML tags
    const responseText = (await response.text()).replace(/<(.|\n)*?>/g, "");
    throw new ServerError(responseText, response.status);
}
