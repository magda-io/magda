import express from "express";
import isUUID from "is-uuid";
import bcrypt from "bcrypt";

import Database from "./Database";
import { PublicUser } from "magda-typescript-common/src/authorization-api/model";
import { getUserIdHandling } from "magda-typescript-common/src/session/GetUserId";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError";
import AuthError from "magda-typescript-common/src/authorization-api/AuthError";
import { installStatusRouter } from "magda-typescript-common/src/express/status";
import respondWithError from "./respondWithError";
import handleMaybePromise from "./handleMaybePromise";
import createOrgUnitApiRouter from "./apiRouters/createOrgUnitApiRouter";

export interface ApiRouterOptions {
    database: Database;
    registryApiUrl: string;
    opaUrl: string;
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

    const NO_CACHE = function (req: any, res: any, next: any) {
        res.set({
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0"
        });
        next();
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
    router.post("/public/user/:userId/roles", MUST_BE_ADMIN, async function (
        req,
        res
    ) {
        try {
            const userId = req.params.userId;
            const roleIds = await database.addUserRoles(userId, req.body);
            res.json(roleIds);
        } catch (e) {
            respondWithError("POST /public/user/:userId/roles", res, e);
        }
    });

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
    router.delete("/public/user/:userId/roles", MUST_BE_ADMIN, async function (
        req,
        res
    ) {
        try {
            const userId = req.params.userId;
            await database.deleteUserRoles(userId, req.body);
            res.json({ isError: false });
        } catch (e) {
            respondWithError("DELETE /public/user/:userId/roles", res, e);
        }
    });

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
    router.get("/public/user/:userId/roles", MUST_BE_ADMIN, async function (
        req,
        res
    ) {
        try {
            const userId = req.params.userId;
            const roles = await database.getUserRoles(userId);
            res.json(roles);
        } catch (e) {
            respondWithError("GET /public/user/:userId/roles", res, e);
        }
    });

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
        "/public/user/:userId/permissions",
        MUST_BE_ADMIN,
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
     * @api {get} /v0/auth/role/:roleId/permissions Get all permissions of a role
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
        "/public/role/:roleId/permissions",
        MUST_BE_ADMIN,
        async function (req, res) {
            try {
                const roleId = req.params.roleId;
                const permissions = await database.getRolePermissions(roleId);
                res.json(permissions);
            } catch (e) {
                respondWithError(
                    "GET /public/role/:roleId/permissions",
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
    router.get("/public/users/whoami", NO_CACHE, async function (req, res) {
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
    router.get("/public/users/all", MUST_BE_ADMIN, async (req, res) => {
        try {
            const users = await database.getUsers();
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
    });

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
    router.get("/public/users/:userId", NO_CACHE, (req, res) => {
        const userId = req.params.userId;
        const getPublicUser = database.getUser(userId).then((userMaybe) =>
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
    });

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
    router.put("/public/users/:userId", MUST_BE_ADMIN, async (req, res) => {
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
    });

    // attach orgunits apis
    router.use("/public/orgunits", createOrgUnitApiRouter({ database }));

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
