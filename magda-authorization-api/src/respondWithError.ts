import express from "express";
import { NodeNotFoundError } from "./NestedSetModelQueryer.js";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError.js";
import ServerError from "magda-typescript-common/src/ServerError.js";

export default function respondWithError(
    route: string,
    res: express.Response,
    e: unknown
) {
    console.error(`Error happened when processed "${route}"`);
    console.error(e);

    if (e instanceof NodeNotFoundError) {
        res.status(404).json({
            isError: true,
            errorCode: 404,
            errorMessage: e.message || "Could not find resource"
        });
    } else if (e instanceof GenericError || e instanceof ServerError) {
        res.status(e.statusCode).json({
            isError: true,
            errorCode: e.statusCode,
            errorMessage: e.message
        });
    } else {
        res.status(500).json({
            isError: true,
            errorCode: 500,
            errorMessage: `Internal server error: ${e}`
        });
    }
}
