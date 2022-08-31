import express from "express";
import isUUID from "is-uuid";
import bcrypt from "bcrypt";

import Database from "./Database";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError";
import { installStatusRouter } from "magda-typescript-common/src/express/status";
import respondWithError from "./respondWithError";
import handleMaybePromise from "./handleMaybePromise";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import createOrgUnitApiRouter from "./apiRouters/createOrgUnitApiRouter";
import createUserApiRouter from "./apiRouters/createUserApiRouter";
import createRoleApiRouter from "./apiRouters/createRoleApiRouter";
import createResourceApiRouter from "./apiRouters/createResourceApiRouter";
import createOperationApiRouter from "./apiRouters/createOperationApiRouter";
import createPermissionApiRouter from "./apiRouters/createPermissionApiRouter";
import createAccessGroupApiRouter from "./apiRouters/createAccessGroupApiRouter";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import { requireUnconditionalAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";

export interface ApiRouterOptions {
    database: Database;
    opaUrl: string;
    authDecisionClient: AuthDecisionQueryClient;
    jwtSecret: string;
    tenantId: number;
    failedApiKeyAuthBackOffSeconds: number;
    registryClient: AuthorizedRegistryClient;
}

/**
 * @apiDefine Auth Authorization API
 */

export default function createApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    const status = {
        probes: {
            database: database.check.bind(database)
        }
    };
    installStatusRouter(router, status);
    installStatusRouter(router, status, "/private");
    installStatusRouter(router, status, "/public");

    /**
     * @apiGroup Auth API Keys
     * @api {get} /v0/private/users/apikey/:apiKeyId Api Key Verification API
     * @apiDescription Retrieve user info with api key id & api key.
     * This api is only available within cluster (i.e. it's not available via gateway) and only created for the gateway for purpose of verifying incoming API keys.
     * This route doesn't require auth decision to be made as a user must provide valid API key id & key to retrieve his own user info only.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "photoURL":"...",
     *        "OrgUnitId": "xxx"
     *        ...
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get("/private/users/apikey/:apiKeyId", async function (req, res) {
        try {
            const apiKey = req.get("X-Magda-API-Key");
            const apiKeyId = req.params.apiKeyId;
            const backOffSeconds = options.failedApiKeyAuthBackOffSeconds
                ? options.failedApiKeyAuthBackOffSeconds
                : 0;

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
            if (!apiKeyRecord?.enabled) {
                throw new GenericError("the api key is disabled.", 401);
            }
            if (
                apiKeyRecord?.expiry_time &&
                apiKeyRecord.expiry_time?.getTime() < new Date().getTime()
            ) {
                throw new GenericError("the api key is expired.", 401);
            }
            if (apiKeyRecord?.last_failed_attempt_time) {
                const lastFailTime = apiKeyRecord.last_failed_attempt_time?.getTime();
                if (
                    lastFailTime &&
                    lastFailTime + backOffSeconds * 1000 > new Date().getTime()
                ) {
                    throw new GenericError(
                        `the api key had failed verification attempts in the last ${backOffSeconds} seconds.`,
                        401
                    );
                }
            }
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
                // non-blocking call. any error will be printed on server log
                database.updateApiKeyAttemptNonBlocking(
                    req.params.apiKeyId,
                    true
                );
            } else {
                throw new GenericError("Unauthorized", 401);
            }
        } catch (e) {
            // non-blocking call. any error will be printed on server log
            database.updateApiKeyAttemptNonBlocking(req.params.apiKeyId, false);
            respondWithError("/private/users/apikey/:apiKeyId", res, e);
        }
        res.end();
    });

    /**
     * @apiGroup Auth Users
     * @api {get} /private/users/lookup Lookup User
     * @apiDescription Lookup user by `source` & `sourceId`.
     * require unconditional `authObject/user/read` permission to access.
     * @apiDeprecated use now (#Auth_Users:GetV0AuthUsers).
     * This api is only available within cluster (i.e. it's not available via gateway).
     * This route is deprecated as we have public facing API with fine-gained access control.
     *
     * @apiParam (Query String) {string} source The source string of user record to be fetched
     * @apiParam (Query String) {string} sourceId The sourceId of user record to be fetched
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "photoURL":"...",
     *        "OrgUnitId": "xxx"
     *        ...
     *    }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/private/users/lookup",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/read"
        }),
        function (req, res) {
            const source = req.query.source as string;
            const sourceId = req.query.sourceId as string;

            handleMaybePromise(
                res,
                database.getUserByExternalDetails(source, sourceId),
                "/private/users/lookup"
            );
        }
    );

    /**
     * @apiGroup Auth Users
     * @api {get} /private/users/:userId Get User by Id (Private)
     * @apiDescription Get user record by user id.
     * This api is only available within cluster (i.e. it's not available via gateway).
     * require unconditional `authObject/user/read` permission to access.
     * @apiDeprecated use now (#Auth_Users:GetV0AuthUsersUserid).
     * This route is deprecated as we have public facing API with fine-gained access control.
     *
     * @apiParam (URL Path) {string} userId the id of the user
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "photoURL":"...",
     *        "OrgUnitId": "xxx"
     *        ...
     *    }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/private/users/:userId",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/read"
        }),
        function (req, res) {
            const userId = req.params.userId;

            handleMaybePromise(
                res,
                database.getUser(userId),
                "/private/users/:userId"
            );
        }
    );

    /**
     * @apiGroup Auth Users
     * @api {post} /private/users Create a new user (private)
     * @apiDescription Create a new user record.
     * Supply a JSON object that contains fields of the new user in body.
     * This api is only available within cluster (i.e. it's not available via gateway).
     * require unconditional `authObject/user/create` permission to access.
     *
     * @apiDeprecated use now (#Auth_Users:PostV0AuthUsers).
     * This route is deprecated as we have public facing API with fine-gained access control.
     *
     * @apiParamExample (Body) {json}:
     *     {
     *       displayName: "xxxx",
     *       email: "sdds@sds.com"
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *      id: "2a92d9e7-9fb8-4fe4-a2d1-13b6bcf1776d",
     *      displayName: "xxxx",
     *      email: "sdds@sds.com",
     *      //....
     *    }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/private/users",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/create"
        }),
        async function (req, res) {
            try {
                const user = await database.createUser(req.body);
                res.json(user);
            } catch (e) {
                respondWithError("/private/users", res, e);
            }
        }
    );

    // attach orgunits apis
    router.use(
        "/public/orgunits",
        createOrgUnitApiRouter({
            database,
            authDecisionClient
        })
    );

    router.use(
        "/public/users",
        createUserApiRouter({
            database,
            authDecisionClient,
            jwtSecret: options.jwtSecret
        })
    );

    // in order to be backwards compatible, we make role apis available at /user as well
    router.use(
        "/public/user",
        createUserApiRouter({
            database,
            authDecisionClient,
            jwtSecret: options.jwtSecret
        })
    );

    // in order to be backwards compatible, we make role apis available at /role as well
    router.use(
        "/public/role",
        createRoleApiRouter({
            database,
            jwtSecret: options.jwtSecret,
            authDecisionClient
        })
    );

    // in order to be backwards compatible, we make role apis avaiable at /roles as well
    router.use(
        "/public/roles",
        createRoleApiRouter({
            database,
            jwtSecret: options.jwtSecret,
            authDecisionClient
        })
    );

    router.use(
        "/public/resources",
        createResourceApiRouter({
            database,
            authDecisionClient
        })
    );

    router.use(
        "/public/operations",
        createOperationApiRouter({
            database,
            authDecisionClient
        })
    );

    router.use(
        "/public/permissions",
        createPermissionApiRouter({
            database,
            jwtSecret: options.jwtSecret,
            authDecisionClient
        })
    );

    router.use(
        "/public/accessGroups",
        createAccessGroupApiRouter({
            database,
            jwtSecret: options.jwtSecret,
            authDecisionClient,
            registryClient: options.registryClient
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
