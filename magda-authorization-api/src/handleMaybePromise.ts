import express from "express";
import { Maybe } from "@magda/tsmonad";
import respondWithError from "./respondWithError.js";

export default function handleMaybePromise<T>(
    res: express.Response,
    promise: Promise<Maybe<T>>,
    route: string,
    notFoundMessage: string = "Could not find resource"
) {
    return promise
        .then((resource) =>
            resource.caseOf({
                just: (resource) => res.json(resource),
                nothing: () =>
                    res.status(404).json({
                        isError: true,
                        errorCode: 404,
                        errorMessage: notFoundMessage
                    })
            })
        )
        .catch((e) => {
            respondWithError(route, res, e);
        })
        .then(() => res.end());
}
