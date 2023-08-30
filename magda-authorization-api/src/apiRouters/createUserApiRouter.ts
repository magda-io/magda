import express, { Request, Response, NextFunction } from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import handleMaybePromise from "../handleMaybePromise";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { NO_CACHE } from "../utilityMiddlewares";
import { requireObjectPermission } from "../recordAuthMiddlewares";
import {
    withAuthDecision,
    requireUnconditionalAuthDecision
} from "magda-typescript-common/src/authorization-api/authMiddleware";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";
import { searchTableRecord } from "magda-typescript-common/src/SQLUtils";
import ServerError from "magda-typescript-common/src/ServerError";
import { omit } from "lodash";

export interface ApiRouterOptions {
    database: Database;
    jwtSecret: string;
    authDecisionClient: AuthDecisionQueryClient;
}

const userKeywordSearchFields = ["displayName", "email", "source"];

export default function createUserApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    /**
     * @apiGroup Auth Roles
     * @api {post} /v0/auth/users/:userId/roles Add Roles to a user
     * @apiDescription Returns a list of current role ids of the user.
     * You need have update permission to the user record in order to access this API.
     *
     * @apiSuccessExample {json} 200
     *    ["xxxx-xxxx-xxx-xxx-xx", "xx-xx-xxx-xxxx-xxxxx"]
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/:userId/roles",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/user/update",
            (req, res) => req.params.userId,
            "user"
        ),
        async function (req, res) {
            try {
                const userId = req.params.userId;
                const roleIds = await database.addUserRoles(userId, req.body);
                res.json(roleIds);
            } catch (e) {
                respondWithError("POST /public/users/:userId/roles", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Roles
     * @api {delete} /v0/auth/users/:userId/roles Remove a list roles from a user
     * @apiDescription Returns the JSON response indicates the operation has been done successfully or not
     * You need have update permission to the user record in order to access this API.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        isError: false
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.delete(
        "/:userId/roles",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/user/update",
            (req, res) => req.params.userId,
            "user"
        ),
        async function (req, res) {
            try {
                const userId = req.params.userId;
                await database.deleteUserRoles(userId, req.body);
                res.json({ isError: false });
            } catch (e) {
                respondWithError("DELETE /public/users/:userId/roles", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Roles
     * @api {get} /v0/auth/users/:userId/roles Get all roles of a user
     * @apiDescription Returns an array of roles. When no roles can be found, an empty array will be returned
     * You need have read permission to the user record in order to access this API.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        id: "xxx-xxx-xxxx-xxxx-xx",
     *        name: "Admin Roles",
     *        permissionIds: ["xxx-xxx-xxx-xxx-xx", "xxx-xx-xxx-xx-xxx-xx"],
     *        description?: "This is an admin role"
     *    }]
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/:userId/roles",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/user/read",
            (req, res) => req.params.userId,
            "user"
        ),
        async function (req, res) {
            try {
                const userId = req.params.userId;
                const roles = await database.getUserRoles(userId);
                res.json(roles);
            } catch (e) {
                respondWithError("GET /public/users/:userId/roles", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Permissions
     * @api {get} /v0/auth/users/:userId/permissions Get all permissions of a user
     * @apiDescription Returns an array of permissions. When no permissions can be found, an empty array will be returned.
     * You need have read permission to the user record in order to access this API.
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
     *        allowExemption: false,
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
    router.get(
        "/:userId/permissions",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/user/read",
            (req, res) => req.params.userId,
            "user"
        ),
        async function (req, res) {
            try {
                const userId = req.params.userId;
                const permissions = await database.getUserPermissions(userId);
                res.json(permissions);
            } catch (e) {
                respondWithError(
                    "GET /public/users/:userId/permissions",
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth API Keys
     * @api {get} /v0/auth/users/:userId/apiKeys Get all API keys of a user
     * @apiDescription Returns an array of api keys. When no api keys can be found, an empty array will be returned.
     * You need have `authObject/apiKey/read` permission in order to access this API.
     * As the default `Authenticated Users` roles contains the permission to all `authObject/apiKey/*` type operations with ownership constraint.
     * All `Authenticated Users` (i.e. non-anonymous) users should always have access to their own API keys.
     *
     * @apiParam (Path) {string} userId the id of the user.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        id: "b559889a-2843-4a60-9c6d-103d51eb4410",
     *        user_id: "be374b6e-d428-4211-b642-b2b65abcf051",
     *        created_timestamp: "2022-05-16T13:02:59.430Z",
     *        expiry_time: null,
     *        last_successful_attempt_time: null,
     *        last_failed_attempt_time: null,
     *        enabled: true
     *    }]
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/:userId/apiKeys",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/apiKey/read"
        }),
        async function (req, res) {
            try {
                const userId = req.params.userId;
                const apiKeys = await database.getUserApiKeys(
                    userId,
                    res.locals.authDecision
                );
                res.json(apiKeys.map((item) => omit(item, "hash")));
            } catch (e) {
                respondWithError("GET /public/users/:userId/apiKeys", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth API Keys
     * @api {get} /v0/auth/users/:userId/apiKeys/:apiKeyId Get an API key of a user by ID
     * @apiDescription Get an API key record of a user by ID by API key ID.
     * You need have `authObject/apiKey/read` permission in order to access this API.
     * As the default `Authenticated Users` roles contains the permission to all `authObject/apiKey/*` type operations with ownership constraint.
     * All `Authenticated Users` (i.e. non-anonymous) users should always have access to their own API keys.
     *
     * @apiParam (Path) {string} userId the id of the user.
     * @apiParam (Path) {string} apiKeyId the id of the api key.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        id: "b559889a-2843-4a60-9c6d-103d51eb4410",
     *        user_id: "be374b6e-d428-4211-b642-b2b65abcf051",
     *        created_timestamp: "2022-05-16T13:02:59.430Z",
     *        expiry_time: null,
     *        last_successful_attempt_time: null,
     *        last_failed_attempt_time: null,
     *        enabled: true
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/:userId/apiKeys/:apiKeyId",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/apiKey/read"
        }),
        async function (req, res) {
            try {
                const userId = req.params.userId;
                const apiKeyId = req.params.apiKeyId;
                const apiKey = await database.getApiKeyById(
                    apiKeyId,
                    res.locals.authDecision
                );
                if (!apiKey || apiKey.user_id !== userId) {
                    throw new ServerError(
                        `Cannot locate api key by id: ${apiKeyId} for user: ${userId}.`,
                        404
                    );
                }
                res.json(omit(apiKey, "hash"));
            } catch (e) {
                respondWithError(
                    "GET /public/users/:userId/apiKey/:apiKeyId",
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth API Keys
     * @api {post} /v0/auth/users/:userId/apiKeys Create a new API key for the user
     * @apiDescription Create a new API key for the specified user.
     * Optional supply a JSON object that contains `expiry_time` in body.
     * You need have `authObject/apiKey/create` permission in order to access this API.
     * As the default `Authenticated Users` roles contains the permission to all `authObject/apiKey/*` type operations with ownership constraint.
     * All `Authenticated Users` (i.e. non-anonymous) users should always have access to their own API keys.
     *
     * @apiParam (Path) {string} userId the id of the user.
     * @apiParam (Json Body) {string} [expiryTime] The expiry time (in ISO format (ISO 8601)) of the API key that is about to be created.
     *
     * @apiParamExample (Body) {json}:
     *     {
     *       expiryTime: "2022-05-16T13:02:59.430Z"
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *        id: "b559889a-2843-4a60-9c6d-103d51eb4410",
     *        key: "1RoGs0+MMYxjJlGH6UkyRnXC8Wrc9Y1ecREAnm5D2GM="
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
        "/:userId/apiKeys",
        requireUnconditionalAuthDecision(
            authDecisionClient,
            async (req: Request, res: Response, next: NextFunction) => ({
                operationUri: "authObject/apiKey/create",
                input: {
                    authObject: {
                        apiKey: {
                            user_id: req.params.userId,
                            expiry_time: req?.body?.["expiry_time"]
                        }
                    }
                }
            })
        ),
        async function (req, res) {
            try {
                const userId = req.params.userId;
                let expiryTime = req?.body?.expiryTime
                    ? new Date(req.body.expiryTime)
                    : null;
                if (isNaN(expiryTime?.getTime())) {
                    expiryTime = null;
                }
                const apiKey = await database.createUserApiKey(
                    userId,
                    expiryTime
                );
                res.json(apiKey);
            } catch (e) {
                respondWithError("POST /public/users/:userId/apiKeys", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth API Keys
     * @api {put} /v0/auth/users/:userId/apiKeys/:apiKeyId Update an API Key of the user
     * @apiDescription Update an API Key of the user.
     * You need have `authObject/apiKey/update` permission in order to access this API.
     * As the default `Authenticated Users` roles contains the permission to all `authObject/apiKey/*` type operations with ownership constraint.
     * All `Authenticated Users` (i.e. non-anonymous) users should always have access to their own API keys.
     *
     * @apiParam (Path) {string} userId the id of the user.
     * @apiParam (Path) {string} apiKeyId the id of the api key.
     * @apiParam (Json Body) {string} [expiryTime] The expiry time (in ISO format (ISO 8601)) of the API key.
     * @apiParam (Json Body) {boolean} [enabled] Whether the api key is enabled.
     *
     * @apiParamExample (Body) {json}:
     *     {
     *       "enabled": false
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *        id: "b559889a-2843-4a60-9c6d-103d51eb4410",
     *        user_id: "be374b6e-d428-4211-b642-b2b65abcf051",
     *        created_timestamp: "2022-05-16T13:02:59.430Z",
     *        hash: "$2b$10$6DD8hle27X/dVdDD3Sl3Y.V6NtJ9jBiy2cyS8SnBO5EEWMD5Wpdwe",
     *        expiry_time: null,
     *        last_successful_attempt_time: null,
     *        last_failed_attempt_time: null,
     *        enabled: false
     *    }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.put(
        "/:userId/apiKeys/:apiKeyId",
        requireUnconditionalAuthDecision(
            authDecisionClient,
            async (req: Request, res: Response, next: NextFunction) => {
                return {
                    operationUri: "authObject/apiKey/create",
                    input: {
                        authObject: {
                            apiKey: {
                                user_id: req.params.userId,
                                expiry_time: req?.body?.["expiry_time"]
                            }
                        }
                    }
                };
            }
        ),
        async function (req, res) {
            try {
                const userId = req.params.userId;
                const apiKeyId = req.params.apiKeyId;

                let expiryTime = req?.body?.expiryTime
                    ? new Date(req.body.expiryTime)
                    : undefined;

                if (isNaN(expiryTime?.getTime())) {
                    expiryTime = undefined;
                }

                const enabled =
                    typeof req?.body?.enabled === "boolean"
                        ? req.body.enabled
                        : undefined;

                await database.updateUserApiKey(
                    userId,
                    apiKeyId,
                    enabled,
                    expiryTime
                );
                const apiKey = await database.getApiKeyById(apiKeyId);
                res.json(apiKey);
            } catch (e) {
                respondWithError(
                    "PUT /public/users/:userId/apiKeys/:apiKeyId",
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth API Keys
     * @api {delete} /v0/auth/users/:userId/apiKeys/:apiKeyId Delete an API Key of the user
     * @apiDescription Delete an API Key of the user
     * You need have `authObject/apiKey/delete` permission in order to access this API.
     * As the default `Authenticated Users` roles contains the permission to all `authObject/apiKey/*` type operations with ownership constraint.
     * All `Authenticated Users` (i.e. non-anonymous) users should always have access to their own API keys.
     *
     * @apiParam (Path) {string} userId the id of the user.
     * @apiParam (Path) {string} apiKeyId the id of the api key.
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "deleted": true
     *    }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.delete(
        "/:userId/apiKeys/:apiKeyId",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/apiKey/delete",
            (req, res) => req.params.apiKeyId,
            "apiKey"
        ),
        async function (req, res) {
            try {
                const userId = req.params.userId;
                const apiKeyId = req.params.apiKeyId;

                const result = await database.deleteUserApiKey(
                    userId,
                    apiKeyId
                );
                res.json(result);
            } catch (e) {
                respondWithError(
                    "DELETE /public/users/:userId/apiKeys/:apiKeyId",
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Users
     * @api {get} /v0/auth/users/whoami Get Current User Info (whoami)
     * @apiDescription Returns the user info of the current user. If the user has not logged in yet,
     * the user will be considered as an anonymous user.
     *
     * @apiParam (Query String) {string} [allowCache] By default, this API will respond with certain headers to disable any client side cache behaviour.
     * You can opt to supply a string value `true` for this parameter to stop sending those headers.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "email":"fred.nerk@data61.csiro.au",
     *        "photoURL":"...",
     *        "source":"google",
     *        "isAdmin": true
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get("/whoami", NO_CACHE, async function (req, res) {
        try {
            const currentUserInfo = await database.getCurrentUserInfo(
                req,
                options.jwtSecret
            );

            res.json(currentUserInfo);
        } catch (e) {
            if (e instanceof GenericError) {
                const data = e.toData();
                res.status(data.errorCode).json(data);
            } else {
                respondWithError("/public/users/whoami", res, e);
            }
        }
    });

    /**
     * @apiGroup Auth Users
     * @api {get} /v0/auth/users/all Get all users
     * @apiDescription Returns all users.
     * @apiDeprecated Legacy API to be deprecated.
     * You should use (#Auth_Users:GetV0AuthUsers) or (#Auth_Users:GetV0AuthUsersCount) instead as they support pagination.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "email":"fred.nerk@data61.csiro.au",
     *        "photoURL":"...",
     *        "source":"google",
     *        "isAdmin": true,
     *        "roles": [{
     *          id": "...",
     *          name: "Authenticated Users",
     *          permissionIds: ["e5ce2fc4-9f38-4f52-8190-b770ed2074e", "a4a34ab4-67be-4806-a8de-f7e3c5d452f0"]
     *        }]
     *    }]
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/all",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/read"
        }),
        async (req, res) => {
            try {
                const users = await database.getUsers(res.locals.authDecision);
                if (!users?.length) {
                    res.json([]);
                    return;
                }
                res.json(
                    await Promise.all(
                        users.map(async (user) => ({
                            ...user,
                            roles: await database.getUserRoles(user.id)
                        }))
                    )
                );
            } catch (e) {
                respondWithError("GET /public/users/all", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Users
     * @api {post} /v0/auth/users Create a new user
     * @apiDescription Create a new user
     * Supply a JSON object that contains fields of the new user in body.
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
        "/",
        requireUnconditionalAuthDecision(
            authDecisionClient,
            async (req: Request, res: Response, next: NextFunction) => ({
                operationUri: "authObject/user/create",
                input: {
                    authObject: {
                        user: req.body
                    }
                }
            })
        ),
        async (req, res) => {
            try {
                const user = await database.createUser(req.body);
                res.json(user);
            } catch (e) {
                respondWithError("create a new user", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Users
     * @api {put} /v0/auth/users/:userId Update User By Id
     * @apiDescription Updates a user's info by Id.
     * Supply a JSON object that contains fields to be updated in body.
     *
     * @apiParam {string} userId id of user
     * @apiParamExample (Body) {json}:
     *     {
     *       displayName: "xxxx"
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
    router.put(
        "/:userId",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/user/update",
            (req, res) => req.params.userId,
            "user"
        ),
        async (req, res) => {
            const userId = req.params.userId;
            const update = req.body;

            // update
            try {
                const user = await database.updateUser(userId, update);
                res.status(200).json(user);
            } catch (e) {
                respondWithError("update user by id", res, e);
            }
        }
    );

    function createFetchUsersHandler(returnCount: boolean, apiName: string) {
        return async function (req: Request, res: Response) {
            try {
                const conditions: SQLSyntax[] = [];
                if (req.query?.keyword) {
                    const keyword = "%" + req.query?.keyword + "%";
                    conditions.push(
                        SQLSyntax.joinWithOr(
                            userKeywordSearchFields.map(
                                (field) =>
                                    sqls`${escapeIdentifier(
                                        field
                                    )} ILIKE ${keyword}`
                            )
                        ).roundBracket()
                    );
                }
                if (req.query?.id) {
                    conditions.push(sqls`"id" = ${req.query.id}`);
                }
                if (req.query?.source) {
                    conditions.push(sqls`"source" = ${req.query.source}`);
                }
                if (req.query?.orgUnitId) {
                    conditions.push(sqls`"orgUnitId" = ${req.query.orgUnitId}`);
                }
                if (req.query?.sourceId) {
                    conditions.push(sqls`"sourceId" = ${req.query.sourceId}`);
                }
                const records = await searchTableRecord(
                    database.getPool(),
                    "users",
                    conditions,
                    {
                        selectedFields: [
                            returnCount ? sqls`COUNT(*) as count` : sqls`*`
                        ],
                        authDecision: res.locals.authDecision,
                        offset: returnCount
                            ? undefined
                            : (req?.query?.offset as string),
                        limit: returnCount
                            ? undefined
                            : (req?.query?.limit as string),
                        orderBy: returnCount
                            ? undefined
                            : sqls`"displayName" ASC`
                    }
                );
                if (returnCount) {
                    // response will be {count: number}
                    res.json(records[0]);
                } else {
                    res.json(records);
                }
            } catch (e) {
                respondWithError(apiName, res, e);
            }
        };
    }

    /**
     * @apiGroup Auth Users
     * @api {get} /v0/auth/users Get users
     * @apiDescription Returns a list users that meet query parameters and the current user is allowed to access.
     *
     * @apiParam (Query String) {number} [offset] The index of the first record in the result set to retrieve.
     * @apiParam (Query String) {number} [limit] The maximum number of records of the result set to receive. If not present, a default value of 500 will be used.
     * @apiParam (Query String) {string} [keyword] When set, will only return user records whose "displayName", "email" or "source" field contains the specified keyword.
     * @apiParam (Query String) {string} [id] When set, will only return records whose id is the specified ID.
     * @apiParam (Query String) {string} [source] When set, will only return records whose source is the specified source name.
     * @apiParam (Query String) {string} [sourceId] When set, will only return records whose sourceId is the specified source ID.
     * @apiParam (Query String) {string} [orgUnitId] When set, will only return records whose orgUnitId is the specified org unit id.
     *
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "email":"fred.nerk@data61.csiro.au",
     *        "photoURL":"...",
     *        "source":"google",
     *        "isAdmin": true,
     *        "orgUnitId": "..."
     *    }]
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/read"
        }),
        createFetchUsersHandler(false, "Get Users")
    );

    /**
     * @apiGroup Auth Users
     * @api {get} /v0/auth/users/count Get user records count
     * @apiDescription Returns the count of users that meet query parameters and the current user is allowed to access.
     * This API offers the similar functionality as `/v0/auth/users` API, except only return the records count number.
     *
     * @apiParam (Query String) {string} [keyword] When set, will only return user records whose "displayName", "email" or "source" field contains the specified keyword.
     * @apiParam (Query String) {string} [id] When set, will only return records whose id is the specified ID.
     * @apiParam (Query String) {string} [source] When set, will only return records whose source is the specified source name.
     * @apiParam (Query String) {string} [sourceId] When set, will only return records whose sourceId is the specified source ID.
     * @apiParam (Query String) {string} [orgUnitId] When set, will only return records whose orgUnitId is the specified org unit id.
     *
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "count": 3
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/count",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/read"
        }),
        createFetchUsersHandler(true, "Get Users Count")
    );

    /**
     * @apiGroup Auth Users
     * @api {get} /v0/auth/users/:userId Get User By Id
     * @apiDescription Returns user by id.
     * Unlike `whoami` API endpoint, this API requires `authObject/user/read` permission.
     *
     * @apiParam (URL Path) {string} userId id of user
     * @apiParam (Query String) {string} [allowCache] By default, this API will respond with certain headers to disable any client side cache behaviour.
     * You can opt to supply a string value `true` for this parameter to stop sending those headers.
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
        "/:userId",
        NO_CACHE,
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/read"
        }),
        (req, res) => {
            const userId = req.params.userId;
            const getPublicUser = database.getUser(
                userId,
                res.locals.authDecision
            );

            handleMaybePromise(res, getPublicUser, "/public/users/:userId");
        }
    );

    return router;
}
