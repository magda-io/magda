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
export async function headRequest(url: string): Promise<number> {
    const devnull = new DevNull();

    const reqPromise: Promise<number> = new Promise((resolve, reject) => {
        request
            .head(url)
            .on("error", err => reject(err))
            .on("response", (response: http.IncomingMessage) => {
                try {
                    resolve(processResponse(response));
                } catch (e) {
                    reject(e);
                }
            })
            .pipe(devnull);
    });

    const connectionPromise: Promise<void> = new Promise(resolve => {
        devnull.setOnComplete(resolve);
    });

    const statusCode = await reqPromise;
    await connectionPromise;

    return statusCode;
}

/**
 * Send head request to the URL
 * Received data will be discarded
 * @param url String: url to be tested
 */
export async function getRequest(url: string): Promise<number> {
    const devnull = new DevNull();

    const reqPromise: Promise<number> = new Promise((resolve, reject) => {
        request
            .get(url, {
                headers: {
                    Range: "bytes=0-50"
                }
            })
            .on("error", err => reject(err))
            .on("response", (response: http.IncomingMessage) => {
                try {
                    resolve(processResponse(response));
                } catch (e) {
                    reject(e);
                }
            })
            .pipe(devnull);
    });

    const connectionPromise: Promise<void> = new Promise(resolve => {
        devnull.setOnComplete(resolve);
    });

    const statusCode = await reqPromise;
    await connectionPromise;

    return statusCode;
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
