import { Request, Response, NextFunction } from "express";
// --- let passport populate express namespace
import "passport";
import fetch from "isomorphic-fetch";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError";
import isUUID from "is-uuid";
/**
 * attempt to authenticate api key via auth api
 * if successfully authenticated, return true
 * otherwise, return false
 *
 * @param {express.Request} req
 * @returns {boolean}
 */

const createAuthApiKeyMiddleware = (authApiBaseUrl: string) => async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const apiKey = req.header("X-Magda-API-Key");
        const apiKeyId = req.header("X-Magda-API-Key-Id");

        if (!apiKeyId || !isUUID.anyNonNil(apiKeyId)) {
            // --- 400 Bad Request
            throw new GenericError("Invalid API Key ID", 400);
        }

        if (!apiKey) {
            // --- 400 Bad Request
            throw new GenericError("Invalid API Key", 400);
        }

        const res = await fetch(
            `${authApiBaseUrl}/private/getUserByApiKey/${apiKeyId}`,
            {
                headers: {
                    "X-Magda-API-Key": apiKey
                }
            }
        );

        if (!res.ok) {
            throw new GenericError(await res.text(), res.status);
        }

        //req.logIn();

        console.log(fetch);
        return false;
    } catch (e) {
        console.error(e);

        if (e instanceof GenericError) {
            res.status(e.statusCode).send(e.message);
        } else {
            res.sendStatus(500);
        }
    }
};

export default createAuthApiKeyMiddleware;
