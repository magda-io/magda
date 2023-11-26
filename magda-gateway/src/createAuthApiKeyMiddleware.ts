import { Request, Response, NextFunction, RequestHandler } from "express";
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
 * @param {string} authApiBaseUrl Auth API base url
 * @param {boolean} enableSession Whether or not to enable session.
 *  We likely always want to disable session as it's for API key authentication to avoid unnecessary performance tax.
 *  Clients use API key are for API access and unlikely want to keep the session.
 *  Plus, our session data is very empty at this moment.
 *
 * @returns {RequestHandler} express middleware
 */
const createAuthApiKeyMiddleware = (
    authApiBaseUrl: string,
    enableSession: boolean = false
): RequestHandler => async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        let apiKey = req.header("X-Magda-API-Key");
        let apiKeyId = req.header("X-Magda-API-Key-Id");

        if (!apiKey && !apiKeyId) {
            // allow supplying apikey & apiKeyId via bearer token in format: "Bearer [apiKeyId]:[apikey]"
            const bearerToken = req
                .header("Authorization")
                ?.replace(/^Bearer\s+/i, "");
            if (!bearerToken) {
                // --- no bearer token. proceed to other middlewares
                return next();
            }
            const bearerTokenParts = bearerToken.split(":");
            if (bearerTokenParts?.length === 2) {
                apiKeyId = bearerTokenParts[0];
                apiKey = bearerTokenParts[1];
            } else {
                // --- bearerToken is in invalid format. proceed to other middlewares
                return next();
            }
        }

        if (!apiKeyId || !isUUID.anyNonNil(apiKeyId)) {
            // --- 400 Bad Request
            throw new GenericError("Invalid API Key ID", 400);
        }

        if (!apiKey) {
            // --- 400 Bad Request
            throw new GenericError("Invalid API Key", 400);
        }

        const authRes = await fetch(
            `${authApiBaseUrl}/private/users/apikey/${apiKeyId}`,
            {
                headers: {
                    "X-Magda-API-Key": apiKey
                }
            }
        );

        if (!authRes.ok) {
            throw new GenericError(await authRes.text(), authRes.status);
        }

        const user = await authRes.json();

        // to be consistent with all other oauth plugins, we set req.user UserToken type here
        req.logIn(
            { id: user.id } as any,
            {
                // --- by default, we do not enable session here for APIkey authentication
                session:
                    typeof enableSession === "boolean" ? enableSession : false
            },
            next
        );
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
