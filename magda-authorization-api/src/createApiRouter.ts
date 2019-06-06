import * as express from "express";
import { Maybe } from "tsmonad";

import Database from "./Database";
import {
    PublicUser,
    DatasetAccessControlMetaData
} from "@magda/typescript-common/dist/authorization-api/model";
import {
    getUserIdHandling,
    getUserId
} from "@magda/typescript-common/dist/session/GetUserId";
import GenericError from "@magda/typescript-common/dist/authorization-api/GenericError";
import AuthError from "@magda/typescript-common/dist/authorization-api/AuthError";
import { installStatusRouter } from "@magda/typescript-common/dist/express/status";
import NestedSetModelQueryer, {
    NodeNotFoundError
} from "./NestedSetModelQueryer";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import * as bodyParser from "body-parser";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";
import getWhoAllowDatasetOperation from "./getWhoAllowDatasetOperation";

export interface ApiRouterOptions {
    database: Database;
    registryApiUrl: string;
    opaUrl: string;
    orgQueryer: NestedSetModelQueryer;
    jwtSecret: string;
}

/**
 * @apiDefine Auth Authorization API
 */

export default function createApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const orgQueryer = options.orgQueryer;

    const router: express.Router = express.Router();

    const status = {
        probes: {
            database: database.check.bind(database)
        }
    };
    installStatusRouter(router, status);
    installStatusRouter(router, status, "/private");
    installStatusRouter(router, status, "/public");

    function respondWithError(route: string, res: express.Response, e: Error) {
        console.error(`Error happened when processed "${route}": ${e}`);

        if (e instanceof NodeNotFoundError) {
            res.status(404).json({
                isError: true,
                errorCode: 404,
                errorMessage: e.message || "Could not find resource"
            });
        } else {
            res.status(500).json({
                isError: true,
                errorCode: 500,
                errorMessage: "Internal server error"
            });
        }
    }

    function handleMaybePromise<T>(
        res: express.Response,
        promise: Promise<Maybe<T>>,
        route: string,
        notFoundMessage: string = "Could not find resource"
    ) {
        return promise
            .then(resource =>
                resource.caseOf({
                    just: resource => res.json(resource),
                    nothing: () =>
                        res.status(404).json({
                            isError: true,
                            errorCode: 404,
                            errorMessage: notFoundMessage
                        })
                })
            )
            .catch(e => {
                respondWithError(route, res, e);
            })
            .then(() => res.end());
    }

    const MUST_BE_ADMIN = function(req: any, res: any, next: any) {
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
                    req.user = user;
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

    const MUST_BE_LOGGED_IN = function(req: any, res: any, next: any) {
        // --- require to be logged in user only
        // --- we probably should have a OPA policy to control all APIs in future
        // --- so that we never need the similar logic here
        getUserId(req, options.jwtSecret).caseOf({
            just: userId => {
                req.userId = userId;
                next();
            },
            nothing: () => {
                res.status(401).send("Not authorized");
            }
        });
    };

    const NO_CACHE = function(req: any, res: any, next: any) {
        res.set({
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0"
        });
        next();
    };

    router.all("/private/*", MUST_BE_ADMIN);

    router.get("/private/users/lookup", function(req, res) {
        const source = req.query.source;
        const sourceId = req.query.sourceId;

        handleMaybePromise(
            res,
            database.getUserByExternalDetails(source, sourceId),
            "/private/users/lookup"
        );
    });

    router.get("/private/users/:userId", function(req, res) {
        const userId = req.params.userId;

        handleMaybePromise(
            res,
            database.getUser(userId),
            "/private/users/:userId"
        );
    });

    router.post("/private/users", async function(req, res) {
        try {
            const user = await database.createUser(req.body);
            res.json(user);
            res.status(201);
        } catch (e) {
            respondWithError("/private/users", res, e);
        }
        res.end();
    });

    /**
     * @apiGroup Auth
     * @api {get} /v0/auth/users/whoAllowDatasetOpeartion Get authorised users for dataset operation
     * @apiDescription Returns a list users who can perform specified dataset operation
     *
     * @apiParam {String} datasetId Optional dataset id you specify which dataset you want OPA makes decision on.
     *  You must either supply an Id of the dataset or supply dataset metadata in request body
     *
     * @apiParam {String} operationUri  Mandatory The uri of the operation required
     *
     * @apiParamExample {json} Optional dataset metadata request data. Example:
     * {
     *      "publishingState": "draft",
     *      "accessControl": {
     *          "ownerId": "xxxxx-xxxx-xxxx-xxxx",
     *          "orgUnitOwnerId": "xxxxx-xxxx-xxxx-xxxx",
     *          "preAuthorisedPermissionIds": ["xxxxx-xxxx-xxxx-xxxx"]
     *      }
     * }
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "email":"fred.nerk@data61.csiro.au",
     *        "photoURL":"...",
     *        "source":"google",
     *        "isAdmin": true
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
        "/public/users/whoAllowDatasetOpeartion",
        MUST_BE_LOGGED_IN,
        bodyParser.json({ type: "application/json" }),
        NO_CACHE,
        async function(req, res) {
            try {
                let dataset: DatasetAccessControlMetaData;
                const datasetId = req.query.datasetId;
                if (datasetId) {
                    // --- load dataset info from registry
                    const registryClient = new Registry({
                        baseUrl: options.registryApiUrl,
                        jwtSecret: options.jwtSecret,
                        userId: (req as any).userId
                    });
                    const record: Record = unionToThrowable(
                        await registryClient.getRecord(datasetId, undefined, [
                            "publishing",
                            "dataset-access-control"
                        ])
                    );
                    dataset = {
                        // --- default to `published` --- to be consistent with UI & other codebase
                        publishingState:
                            record &&
                            record.aspects &&
                            record.aspects.publishing &&
                            record.aspects.publishing.state
                                ? record.aspects.publishing.state
                                : "published",
                        accessControl:
                            record &&
                            record.aspects &&
                            record.aspects["dataset-access-control"]
                                ? record.aspects["dataset-access-control"]
                                : {}
                    };
                } else {
                    dataset = req.body;
                    if (
                        typeof dataset !== "object" ||
                        !dataset.publishingState
                    ) {
                        throw new GenericError(
                            "Expecting dataset id or dataset metadata"
                        );
                    }
                }
                const opeartionUri = req.query.operationUri;
                if (!opeartionUri) {
                    throw new GenericError("Missing parameter `opeartionUri`");
                }
                const users = await getWhoAllowDatasetOperation(
                    options.opaUrl,
                    dataset,
                    opeartionUri
                );
                res.send(users);
            } catch (e) {
                if (e instanceof GenericError) {
                    const data = e.toData();
                    res.status(data.errorCode).json(data);
                } else {
                    respondWithError("/public/users/whoami", res, e);
                }
            }
        }
    );

    /**
     * @apiGroup Auth
     * @api {get} /v0/auth/users/whoami Get Current User
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
    router.get("/public/users/whoami", async function(req, res) {
        try {
            res.set({
                "Cache-Control": "no-cache, no-store, must-revalidate",
                Pragma: "no-cache",
                Expires: "0"
            });
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
     *        "isAdmin": true
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
            const items = await database.getUsers();
            res.status(200)
                .json({
                    items
                })
                .end();
        } catch (e) {
            respondWithError("/public/users/all", res, e);
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
    router.get("/public/users/:userId", (req, res) => {
        res.set({
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0"
        });
        const userId = req.params.userId;
        const getPublicUser = database.getUser(userId).then(userMaybe =>
            userMaybe.map(user => {
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
     * @api {put} /v0/auth/users/:userId Get User By Id
     * @apiDescription Updates a user.
     *
     * @apiParam {string} userId id of user
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
        if (userId === req.user.id) {
            throw new AuthError(
                "Cannot change your own details through this endpoint",
                403
            );
        }

        // extract fields
        const { isAdmin } = req.body;
        const update = { isAdmin };

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

    /**
     * @apiGroup Auth
     * @api {get} /public/orgunits Get orgunits by name
     * @apiDescription Gets org units matching a name
     *
     * @apiParam (query) {string} nodeName the name of the org unit to look up
     *
     * @apiSuccessExample {json} 200
     *    [{
     *      id: "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *      name: "other-team"
     *      description: "The other teams"
     *    }]
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get("/public/orgunits", MUST_BE_ADMIN, async (req, res) => {
        try {
            const nodeName = req.query.nodeName;

            if (!nodeName || nodeName.length === 0) {
                throw new Error("No nodeName parameter specified");
            }

            const nodes = await orgQueryer.getNodesByName(nodeName);
            res.status(200).json(nodes);
        } catch (e) {
            respondWithError("/public/orgunits", res, e);
        }
    });

    /**
     * @apiGroup Auth
     * @api {get} /public/orgunits/:nodeId Get details for a node
     * @apiDescription Gets the details of the node with this id.
     *
     * @apiParam {string} nodeId id of the node to query
     *
     * @apiSuccessExample {json} 200
     *    {
     *      id: "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *      name: "other-team"
     *      description: "The other teams"
     *    }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get("/public/orgunits/:nodeId", MUST_BE_ADMIN, async (req, res) => {
        const nodeId = req.params.nodeId;
        handleMaybePromise(
            res,
            orgQueryer.getNodeById(nodeId),
            "GET /public/orgunits/:nodeId",
            `Could not find org unit with id ${nodeId}`
        );
    });

    /**
     * @apiGroup Auth
     * @api {put} /public/orgunits/:nodeId Set details for a node
     * @apiDescription Creates/updates a node at the specified id
     *
     * @apiParam (Path) {string} nodeId id of the node to query
     * @apiParamExample (Body) {json}:
     *     {
     *       id: "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *       name: "other-team"
     *       description: "The other teams"
     *     }
     *
     * @apiSuccessExample {string} 200
     *     {
     *       "nodeId": "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *     }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.put("/public/orgunits/:nodeId", MUST_BE_ADMIN, async (req, res) => {
        try {
            const nodeId = req.params.nodeId;

            const existingNodeMaybe = await orgQueryer.getNodeById(nodeId);

            existingNodeMaybe.caseOf({
                just: async () => {
                    await orgQueryer.updateNode(nodeId, req.body);
                    res.status(200).json({ nodeId: nodeId });
                },
                nothing: async () => {
                    const newNodeId = await orgQueryer.insertNode(
                        nodeId,
                        req.body
                    );
                    res.status(200).json({ nodeId: newNodeId });
                }
            });
        } catch (e) {
            respondWithError("PUT /public/orgunits/:nodeId", res, e);
        }
    });

    /**
     * @apiGroup Auth
     * @api {get} /v0/orgunits/root Get root organisation
     * @apiDescription Gets the root organisation unit (top of the tree).
     *
     * @apiSuccessExample {json} 200
     *    {
     *      id: "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *      name: "other-team"
     *      description: "The other teams"
     *    }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get("/public/orgunits/root", MUST_BE_ADMIN, async (req, res) => {
        handleMaybePromise(
            res,
            orgQueryer.getRootNode(),
            "GET /public/orgunits/root",
            "Cannot locate the root tree node."
        );
    });

    /**
     * @apiGroup Auth
     * @api {post} /v0/orgunits/root Create root organisation
     * @apiDescription Creates the root organisation unit (top of the tree).
     *
     * @apiParamExample (Body) {json}:
     *     {
     *       id: "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *       name: "other-team"
     *       description: "The other teams"
     *     }
     *
     * @apiSuccessExample {string} 200
     *     {
     *       "nodeId": "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *     }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post("/public/orgunits/root", MUST_BE_ADMIN, async (req, res) => {
        try {
            const nodeId = await orgQueryer.createRootNode(req.body);
            res.status(200).json({ nodeId: nodeId });
        } catch (e) {
            respondWithError("POST /public/orgunits/root", res, e);
        }
    });

    /**
     * @apiGroup Auth
     * @api {get} /public/orgunits/:nodeId/children/immediate Get immediate children for a node
     * @apiDescription Gets all the children immediately below the requested node. If the node doesn't exist, returns an empty list.
     *
     * @apiParam {string} nodeId id of the node to query
     *
     * @apiSuccessExample {json} 200
     *     [{
     *      id: "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *      name: "other-team"
     *      description: "The other teams"
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
        "/public/orgunits/:nodeId/children/immediate",
        MUST_BE_ADMIN,
        async (req, res) => {
            try {
                const nodeId = req.params.nodeId;
                const nodes = await orgQueryer.getImmediateChildren(nodeId);
                res.status(200).json(nodes);
            } catch (e) {
                respondWithError(
                    "/public/orgunits/:nodeId/children/immediate",
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth
     * @api {get} /public/orgunits/:nodeId/children/all Get all children for a node
     * @apiDescription Gets all the children below the requested node recursively. If node doesn't exist, returns an empty list.
     *
     * @apiParam {string} nodeId id of the node to query
     *
     * @apiSuccessExample {json} 200
     *     [{
     *      id: "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *      name: "other-team"
     *      description: "The other teams"
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
        "/public/orgunits/:nodeId/children/all",
        MUST_BE_ADMIN,
        async (req, res) => {
            try {
                const nodeId = req.params.nodeId;
                const nodes = await orgQueryer.getAllChildren(nodeId);
                res.status(200).json(nodes);
            } catch (e) {
                respondWithError(
                    "/public/orgunits/:nodeId/children/all",
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth
     * @api {delete} /public/orgunits/:nodeId/subtree Delete subtree
     * @apiDescription Deletes a node and all its children. Will delete the root node if that is the one specified in nodeId.
     *
     * @apiParam {string} nodeId id of the node to delete
     *
     * @apiSuccessExample {json} 200
     *     {
     *       "result": "SUCCESS"
     *     }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.delete(
        "/public/orgunits/:nodeId/subtree",
        MUST_BE_ADMIN,
        async (req, res) => {
            try {
                const nodeId = req.params.nodeId;
                await orgQueryer.deleteSubTree(nodeId, true);
                res.status(200).json({
                    result: "SUCCESS"
                });
            } catch (e) {
                respondWithError("/public/orgunits/:nodeId/subtree", res, e);
            }
        }
    );

    router.delete(
        "/public/orgunits/:nodeId",
        MUST_BE_ADMIN,
        async (req, res) => {
            try {
                const nodeId = req.params.nodeId;
                await orgQueryer.deleteNode(nodeId);
                res.status(200).json(true);
            } catch (e) {
                respondWithError("DELETE /public/orgunits/:nodeId", res, e);
            }
        }
    );

    router.put(
        "/public/orgunits/:nodeId/move/:newParentId",
        MUST_BE_ADMIN,
        async (req, res) => {
            try {
                const nodeId = req.params.nodeId;
                const newParentId = req.params.newParentId;
                await orgQueryer.moveSubTreeTo(nodeId, newParentId);
                res.status(200).json(true);
            } catch (e) {
                res.status(500).send(`Error: ${e}`);
            }
        }
    );

    // This is for getting a JWT in development so you can do fake authenticated requests to a local server.
    if (process.env.NODE_ENV !== "production") {
        router.get("public/jwt", function(req, res) {
            res.status(200);
            res.write("X-Magda-Session: " + req.header("X-Magda-Session"));
            res.send();
        });
    }

    return router;
}
