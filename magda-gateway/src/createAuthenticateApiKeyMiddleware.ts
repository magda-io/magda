import { Request, Response, NextFunction } from "express";
import fetch from "isomorphic-fetch";
import isUUID from "is-uuid";
/**
 * attempt to authenticate api key via auth api
 * if successfully authenticated, return true
 * otherwise, return false
 *
 * @param {express.Request} req
 * @returns {boolean}
 */

const createAuthenticateApiKeyMiddleware = (authApiBaseUrl: string) => async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const apiKey = req.header("X-Magda-API-Key");
    const apiKeyId = req.header("X-Magda-API-Key-Id");

    if (!apiKeyId || !isUUID.anyNonNil(apiKeyId)) {
        // --- 400 Bad Request
        throw new GenericError(
            "Expect the last URL segment to be valid API key ID in uuid format",
            400
        );
    }

    if (!apiKey) {
        // --- 400 Bad Request
        throw new GenericError("X-Magda-API-Key header cannot be empty", 400);
    }

    const res = await fetch(
        `${authApiBaseUrl}/private/getUserByApiKey/${apiKey}`
    );
    console.log(fetch);
    return false;
};
