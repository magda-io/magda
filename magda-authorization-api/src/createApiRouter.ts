import express, { Request, Response } from "express";
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
import createResourceApiRouter from "./apiRouters/createResourceApiRouter";
import createOperationApiRouter from "./apiRouters/createOperationApiRouter";
import createPermissionApiRouter from "./apiRouters/createPermissionApiRouter";

export interface ApiRouterOptions {
    database: Database;
    opaUrl: string;
    authDecisionClient: AuthDecisionQueryClient;
    jwtSecret: string;
    tenantId: number;
    failedApiKeyAuthBackOffSeconds: number;
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

    const MUST_BE_ADMIN = function (req: Request, res: Response, next: any) {
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
                            "Only admin users are authorised to access this API: " +
                                req.url,
                            403
                        );
                    (req as any).user = {
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
     * @apiGroup Auth
     * @api {get} /v0/private/users/apikey/:apiKeyId Api Key Verification API
     * @apiDescription Retrieve user info with api key id & api key.
     * This api is only available within cluster (i.e. it's not available via gateway) and only created for the gateway for purpose of verifying incoming API keys.
     * This route doesn't require auth decision to be made as a user must provide valid API key id & key to retrieve his own user info only.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        id: "xxx-xxx-xxxx-xxxx-xx",
     *        name: "View Datasets",
     *        resourceId: "xxx-xxx-xxxx-xx",
     *        resourceId: "object/dataset/draft",
     *        userOwnershipConstraint: true,
     *        orgUnitOwnershipConstraint: false,
     *        preAuthorisedConstraint: false,
     *        operations: [{
     *          id: "xxxxx-xxx-xxx-xxxx",
     *          name: "Read Draft Dataset",
     *          uri: "object/dataset/draft/read",
     *          description: "xxxxxx"
     *        }],
     *        permissionIds: ["xxx-xxx-xxx-xxx-xx", "xxx-xx-xxx-xx-xxx-xx"],
     *        description?: "This is an admin role",
     *    }]
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

    // in future, there will be no need for any private (in cluster access only endpoint)
    // after we add fine-gained access control to all private endpoints and make them public
    router.all("/private/*", MUST_BE_ADMIN);

    /**
     * Todo: we should move this API to public facing endpoint and add fine-gained access control.
     */
    router.get("/private/users/lookup", function (req, res) {
        const source = req.query.source as string;
        const sourceId = req.query.sourceId as string;

        handleMaybePromise(
            res,
            database.getUserByExternalDetails(source, sourceId),
            "/private/users/lookup"
        );
    });

    /**
     * This route is deprecated as we have public facing API with fine-gained access control
     */
    router.get("/private/users/:userId", function (req, res) {
        const userId = req.params.userId;

        handleMaybePromise(
            res,
            database.getUser(userId),
            "/private/users/:userId"
        );
    });

    /**
     * This route is deprecated as we have public facing API with fine-gained access control
     */
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

    // in order to be backwards compatible, we make role apis available at /user as well
    router.use(
        "/public/user",
        createUserApiRouter({
            database,
            authDecisionClient: options.authDecisionClient,
            jwtSecret: options.jwtSecret
        })
    );

    // in order to be backwards compatible, we make role apis available at /role as well
    router.use(
        "/public/role",
        createRoleApiRouter({
            database,
            jwtSecret: options.jwtSecret,
            authDecisionClient: options.authDecisionClient
        })
    );

    // in order to be backwards compatible, we make role apis avaiable at /roles as well
    router.use(
        "/public/roles",
        createRoleApiRouter({
            database,
            jwtSecret: options.jwtSecret,
            authDecisionClient: options.authDecisionClient
        })
    );

    router.use(
        "/public/resources",
        createResourceApiRouter({
            database,
            authDecisionClient: options.authDecisionClient
        })
    );

    router.use(
        "/public/operations",
        createOperationApiRouter({
            database,
            authDecisionClient: options.authDecisionClient
        })
    );

    router.use(
        "/public/permissions",
        createPermissionApiRouter({
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
