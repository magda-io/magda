import express from "express";
import isUUID from "is-uuid";
import bcrypt from "bcrypt";

import Database from "./Database";
import { getUserIdHandling } from "magda-typescript-common/src/session/GetUserId";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError";
import AuthError from "magda-typescript-common/src/authorization-api/AuthError";
import { installStatusRouter } from "magda-typescript-common/src/express/status";
import respondWithError from "./respondWithError";
import handleMaybePromise from "./handleMaybePromise";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import createOrgUnitApiRouter from "./apiRouters/createOrgUnitApiRouter";
import createUserApiRouter from "./apiRouters/createUserApiRouter";
import createRoleApiRouter from "./apiRouters/createRoleApiRouter";

export interface ApiRouterOptions {
    database: Database;
    registryApiUrl: string;
    opaUrl: string;
    authDecisionClient: AuthDecisionQueryClient;
    jwtSecret: string;
    tenantId: number;
}

/**
 * @apiDefine Auth Authorization API
 */

export default function createApiRouter(options: ApiRouterOptions) {
    const database = options.database;

    const router: express.Router = express.Router();

    const status = {
        probes: {
            database: database.check.bind(database)
        }
    };
    installStatusRouter(router, status);
    installStatusRouter(router, status, "/private");
    installStatusRouter(router, status, "/public");

    const MUST_BE_ADMIN = function (req: any, res: any, next: any) {
        //--- private API requires admin level access
        getUserIdHandling(
            req,
            res,
            options.jwtSecret,
            async (userId: string) => {
                try {
                    const user = (await database.getUser(userId)).valueOrThrow(
                        new AuthError(
                            `Cannot locate user record by id: ${userId}`,
                            401
                        )
                    );
                    if (!user.isAdmin)
                        throw new AuthError(
                            "Only admin users are authorised to access this API",
                            403
                        );
                    req.user = {
                        // the default session data type is UserToken
                        // But any auth plugin provider could choose to customise the session by adding more fields
                        // avoid losing customise session data here
                        ...(req.user ? req.user : {}),
                        ...user
                    };
                    next();
                } catch (e) {
                    console.warn(e);
                    if (e instanceof AuthError)
                        res.status(e.statusCode).send(e.message);
                    else res.status(401).send("Not authorized");
                }
            }
        );
    };

    /**
     * retrieve user info with api key id & api key
     * this api is only meant to be accessed internally (by gateway)
     * This route needs to run without MUST_BE_ADMIN middleware as it will authenticate request by APIkey itself
     */
    router.get("/private/users/apikey/:apiKeyId", async function (req, res) {
        try {
            const apiKey = req.get("X-Magda-API-Key");
            const apiKeyId = req.params.apiKeyId;

            if (!apiKeyId || !isUUID.anyNonNil(apiKeyId)) {
                // --- 400 Bad Request
                throw new GenericError(
                    "Expect the last URL segment to be valid API key ID in uuid format",
                    400
                );
            }

            if (!apiKey) {
                // --- 400 Bad Request
                throw new GenericError(
                    "X-Magda-API-Key header cannot be empty",
                    400
                );
            }

            const apiKeyRecord = await database.getUserApiKeyById(apiKeyId);
            const match = await bcrypt.compare(apiKey, apiKeyRecord.hash);
            if (match) {
                const user = (
                    await database.getUser(apiKeyRecord["user_id"])
                ).valueOr(null);

                if (!user) {
                    throw new GenericError("Unauthorized", 401);
                }

                res.json(user);
                res.status(200);
            } else {
                throw new GenericError("Unauthorized", 401);
            }
        } catch (e) {
            const error =
                e instanceof GenericError ? e : new GenericError("" + e);
            respondWithError("/private/users/apikey/:apiKeyId", res, error);
        }
        res.end();
    });

    router.all("/private/*", MUST_BE_ADMIN);

    router.get("/private/users/lookup", function (req, res) {
        const source = req.query.source as string;
        const sourceId = req.query.sourceId as string;

        handleMaybePromise(
            res,
            database.getUserByExternalDetails(source, sourceId),
            "/private/users/lookup"
        );
    });

    router.get("/private/users/:userId", function (req, res) {
        const userId = req.params.userId;

        handleMaybePromise(
            res,
            database.getUser(userId),
            "/private/users/:userId"
        );
    });

    router.post("/private/users", async function (req, res) {
        try {
            const user = await database.createUser(req.body);
            res.json(user);
        } catch (e) {
            respondWithError("/private/users", res, e);
        }
    });

    // attach orgunits apis
    router.use(
        "/public/orgunits",
        createOrgUnitApiRouter({
            database,
            authDecisionClient: options.authDecisionClient
        })
    );

    router.use(
        "/public/users",
        createUserApiRouter({
            database,
            authDecisionClient: options.authDecisionClient,
            jwtSecret: options.jwtSecret
        })
    );

    // in order to be backwards compatible, we make role apis avaiable at /role as well
    router.use(
        "/public/role",
        createRoleApiRouter({
            database,
            authDecisionClient: options.authDecisionClient
        })
    );

    router.use(
        "/public/roles",
        createRoleApiRouter({
            database,
            authDecisionClient: options.authDecisionClient
        })
    );

    // This is for getting a JWT in development so you can do fake authenticated requests to a local server.
    if (process.env.NODE_ENV !== "production") {
        router.get("public/jwt", function (req, res) {
            res.status(200);
            res.write("X-Magda-Session: " + req.header("X-Magda-Session"));
            res.send();
        });
    }

    return router;
}
