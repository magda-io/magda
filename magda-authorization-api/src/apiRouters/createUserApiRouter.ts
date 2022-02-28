import express, { Request, Response } from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import handleMaybePromise from "../handleMaybePromise";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { NO_CACHE } from "../utilityMiddlewares";
import { PublicUser } from "magda-typescript-common/src/authorization-api/model";
import { requireObjectPermission } from "../recordAuthMiddlewares";
import { withAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";
import { searchTableRecord } from "magda-typescript-common/src/SQLUtils";

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
     * @apiGroup Auth
     * @api {post} /v0/auth/user/:userId/roles Add Roles to a user
     * @apiDescription Returns a list of current role ids of the user.
     * Required admin access.
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
                respondWithError("POST /public/user/:userId/roles", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth
     * @api {delete} /v0/auth/user/:userId/roles Remove a list roles from a user
     * @apiDescription Returns the JSON response indicates the operation has been done successfully or not
     * Required admin access.
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
                respondWithError("DELETE /public/user/:userId/roles", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth
     * @api {get} /v0/auth/user/:userId/roles Get all roles of a user
     * @apiDescription Returns an array of roles. When no roles can be found, an empty array will be returned
     * Required admin access.
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
                respondWithError("GET /public/user/:userId/roles", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth
     * @api {get} /v0/auth/user/:userId/permissions Get all permissions of a user
     * @apiDescription Returns an array of permissions. When no permissions can be found, an empty array will be returned.
     * Required admin access.
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
                    "GET /public/user/:userId/permissions",
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth
     * @api {get} /v0/auth/users/whoami Get Current User Info (whoami)
     * @apiDescription Returns current user
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
     * @apiGroup Auth
     * @api {get} /v0/auth/users/all Get all users
     * @apiDescription Returns all users
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
     * @apiGroup Auth
     * @api {put} /v0/auth/users/:userId Update User By Id
     * @apiDescription Updates a user's info by Id. 
     * Supply a JSON object that contains fields to be udpated in body.
     *
     * @apiParam {string} userId id of user
     * @apiParamExample (Body) {json}:
     *     {
     *       displayName: "xxxx"
     *       isAdmin: true
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
            result: "SUCCESS"
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
                await database.updateUser(userId, update);
                res.status(200).json({
                    result: "SUCCESS"
                });
            } catch (e) {
                respondWithError("/public/users/:userId", res, e);
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
                            : (req?.query?.limit as string)
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

    // get user records meet selection criteria
    router.get(
        "/",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/read"
        }),
        createFetchUsersHandler(false, "Get Users")
    );

    // get records count
    router.get(
        "/count",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/read"
        }),
        createFetchUsersHandler(true, "Get Users Count")
    );

    /**
     * @apiGroup Auth
     * @api {get} /v0/auth/users/:userId Get User By Id
     * @apiDescription Returns user by id
     *
     * @apiParam {string} userId id of user
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "photoURL":"...",
     *        "isAdmin": true
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
            const getPublicUser = database
                .getUser(userId, res.locals.authDecision)
                .then((userMaybe) =>
                    userMaybe.map((user) => {
                        const publicUser: PublicUser = {
                            id: user.id,
                            photoURL: user.photoURL,
                            displayName: user.displayName,
                            isAdmin: user.isAdmin
                        };

                        return publicUser;
                    })
                );

            handleMaybePromise(res, getPublicUser, "/public/users/:userId");
        }
    );

    return router;
}
