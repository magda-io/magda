import { CoreOptions } from "request";
import request from "@magda/typescript-common/dist/request";
import * as http from "http";
import DevNull from "./DevNull";

/**
 * Depends on statusCode, determine a request is failed or not
 * @param response http.IncomingMessage
 */
function processResponse(response: http.IncomingMessage) {
    if (
        (response.statusCode >= 200 && response.statusCode <= 299) ||
        response.statusCode === 429
    ) {
        return response.statusCode;
    } else {
        throw new BadHttpResponseError(
            response.statusMessage,
            response,
            response.statusCode
        );
    }
}

/**
 * Send head request to the URL
 * Received data will be discarded
 * @param url String: url to be tested
 */
export async function headRequest(
    url: string,
    requestOpts: CoreOptions = {}
): Promise<number> {
    return doRequest(url, "head", requestOpts);
}

/**
 * Send head request to the URL
 * Received data will be discarded
 * @param url String: url to be tested
 */
export async function getRequest(
    url: string,
    requestOpts: CoreOptions = {}
): Promise<number> {
    return doRequest(url, "get", {
        ...requestOpts,
        headers: {
            Range: "bytes=0-50"
        }
    });
}

/**
 * Send request to the URL
 * Received data will be discarded
 * @param url String: url to be tested
 */
export async function doRequest(
    url: string,
    method: "get" | "head",
    requestOpts: CoreOptions = {}
): Promise<number> {
    const devnull = new DevNull();
    console.info(`${method} ${url}`);

    let resolveResponse: (number: number) => void;
    let resolveStreamEnd: () => void;
    let rejectResponse: (error: Error) => void;
    let rejectStreamEnd: (error: Error) => void;

    const reqPromise: Promise<number> = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });

    const streamPromise = new Promise((resolve, reject) => {
        rejectStreamEnd = reject;
        resolveStreamEnd = resolve;
    });

    const req = request[method](url, requestOpts)
        .on("error", err => rejectResponse(err))
        .on("response", (response: http.IncomingMessage) => {
            try {
                console.info(
                    `Got ${response.statusCode} from ${method} ${url}`
                );

                resolveResponse(processResponse(response));
            } catch (e) {
                rejectResponse(e);
            }
        })
        .on("complete", () => {
            console.log("Finished");
            resolveStreamEnd();
        });

    req.pipe(devnull).on("error", rejectStreamEnd);
    // .on("finish", () => {
    // });

    const [responseCode] = await Promise.all([reqPromise, streamPromise]);

    return responseCode;
}

export class BadHttpResponseError extends Error {
    public response: http.IncomingMessage;
    public httpStatusCode: number;

    constructor(
        message?: string,
        response?: http.IncomingMessage,
        httpStatusCode?: number
    ) {
        super(message);
        this.message = message;
        this.response = response;
        this.httpStatusCode = httpStatusCode;
        this.stack = new Error().stack;
    }
}
