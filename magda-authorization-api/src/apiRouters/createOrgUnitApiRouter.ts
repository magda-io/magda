import express, { Request, Response } from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import handleMaybePromise from "../handleMaybePromise";
import handleServerError from "magda-typescript-common/src/handleServerError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import {
    requirePermission,
    withAuthDecision
} from "magda-typescript-common/src/authorization-api/authMiddleware";
import { requireObjectPermission } from "../recordAuthMiddlewares";
import ServerError from "magda-typescript-common/src/ServerError";

export interface ApiRouterOptions {
    database: Database;
    authDecisionClient: AuthDecisionQueryClient;
}

export default function createOrgUnitApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const orgQueryer = database.getOrgQueryer();
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    /**
     * @apiGroup Auth OrgUnits
     * @api {get} /v0/auth/orgunits/:higherNodeId/topDownPathTo/:lowerNodeId Get get top down path between 2 nodes
     * @apiDescription Get all nodes on the top to down path between the `higherNode` to the `lowerNode`.
     * Sort from higher level nodes to lower level node.
     * Result will include `higherNode` and the `lowerNode`.
     * If `higherNode` and the `lowerNode` is the same node, an array contains the single node will be responded.
     * If a path doesn't exist, `[]` (empty array) will be responded.
     * If you pass a lower node to the `higherNodeId` and a higher node to `lowerNodeId`, `[]` (empty array) will be responded.
     * If you don't have access to the higherNode, `[]` (empty array) will be responded.
     *
     *
     * @apiParam {string} nodeId id of the node to query
     *
     * @apiSuccessExample {json} 200
     *    [{
     *      id: "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7"
     *      name: "other-team"
     *      description: "The other teams"
     *    }]
     *
     * @apiErrorExample {json} 401/500
     *    Not authorized
     */
    router.get(
        "/:higherNodeId/topDownPathTo/:lowerNodeId",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/orgUnit/read"
        }),
        async (req, res) => {
            try {
                const higherNodeId = req?.params?.higherNodeId;
                const lowerNodeId2 = req?.params?.lowerNodeId2;
                if (!higherNodeId) {
                    throw new ServerError("higherNodeId cannot be empty.", 400);
                }
                if (!lowerNodeId2) {
                    throw new ServerError("higherNodeId cannot be empty.", 400);
                }
                const nodes = await orgQueryer.getTopDownPathBetween(
                    higherNodeId,
                    lowerNodeId2,
                    res.locals.authDecision
                );
                res.status(200).json(nodes);
            } catch (e) {
                handleServerError(req, res, e);
            }
        }
    );

    /**
     * @apiGroup Auth OrgUnits
     * @api {get} /v0/auth/orgunits/bylevel/:orgLevel List OrgUnits at certain org tree level
     * @apiDescription
     * List all OrgUnits at certain org tree level
     * Optionally provide a test Org Unit Id that will be used to
     * test the relationship with each of returned orgUnit item.
     * Possible Value: 'ancestor', 'descendant', 'equal', 'unrelated'
     *
     * @apiParam (Path) {string} orgLevel The level number (starts from 1) where org Units of the tree are taken horizontally.
     * @apiParam (Query) {string} relationshipOrgUnitId Optional; The org unit id that is used to test the relationship with each of returned orgUnit item.
     *
     * @apiSuccessExample {string} 200
     *     [{
     *       "id": "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7",
     *       "name": "node 1",
     *       "description": "xxxxxxxx",
     *       "relationship": "unrelated"
     *     },{
     *       "id": "e5f0ed5f-bb00-4e49-89a6-3f044aecc3f7",
     *       "name": "node 2",
     *       "description": "xxxxxxxx",
     *       "relationship": "ancestor"
     *     }]
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/bylevel/:orgLevel",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/orgUnit/read"
        }),
        async (req, res) => {
            try {
                const orgLevel = req.params.orgLevel;
                const relationshipOrgUnitId = req.query
                    .relationshipOrgUnitId as string;

                const levelNumber = parseInt(orgLevel);

                if (levelNumber < 1 || isNaN(levelNumber))
                    throw new Error(`Invalid level number: ${orgLevel}.`);

                const nodes = await orgQueryer.getAllNodesAtLevel(
                    levelNumber,
                    res.locals.authDecision
                );

                if (relationshipOrgUnitId && nodes.length) {
                    for (let i = 0; i < nodes.length; i++) {
                        const r = await orgQueryer.compareNodes(
                            nodes[i]["id"],
                            relationshipOrgUnitId
                        );
                        nodes[i]["relationship"] = r;
                    }
                }

                res.status(200).json(nodes);
            } catch (e) {
                respondWithError(
                    "GET /public/orgunits/bylevel/:orgLevel",
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth OrgUnits
     * @api {get} /v0/auth/orgunits Get orgunits by name
     * @apiDescription
     * Gets org units matching a name
     * Optionally provide a test Org Unit Id that will be used to
     * test the relationship with each of returned orgUnit item.
     * Possible Value: 'ancestor', 'descendant', 'equal', 'unrelated'
     *
     * @apiParam (query) {string} nodeName the name of the org unit to look up
     * @apiParam (query) {boolean} leafNodesOnly Whether only leaf nodes should be returned
     * @apiParam (Query) {string} relationshipOrgUnitId Optional; The org unit id that is used to test the relationship with each of returned orgUnit item.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *      "id": "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7",
     *      "name": "other-team",
     *      "description": "The other teams",
     *      "relationship": "unrelated"
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
            operationUri: "authObject/orgUnit/read"
        }),
        async (req, res) => {
            try {
                const nodeName: string = req.query.nodeName as string;
                const leafNodesOnly: string = req.query.leafNodesOnly as string;
                const relationshipOrgUnitId = req.query
                    .relationshipOrgUnitId as string;

                const nodes = await orgQueryer.getNodes(
                    {
                        name: nodeName,
                        leafNodesOnly: leafNodesOnly === "true"
                    },
                    null,
                    null,
                    res.locals.authDecision
                );

                if (relationshipOrgUnitId && nodes.length) {
                    for (let i = 0; i < nodes.length; i++) {
                        const r = await orgQueryer.compareNodes(
                            nodes[i]["id"],
                            relationshipOrgUnitId
                        );
                        nodes[i]["relationship"] = r;
                    }
                }

                res.status(200).json(nodes);
            } catch (e) {
                respondWithError("/public/orgunits", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth OrgUnits
     * @api {get} /v0/auth/orgunits/root Get root organisational unit
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
    router.get(
        "/root",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/orgUnit/read"
        }),
        async (req, res) => {
            handleMaybePromise(
                res,
                orgQueryer.getRootNode(null, null, res.locals.authDecision),
                "GET /public/orgunits/root",
                "Cannot locate the root tree node."
            );
        }
    );

    /**
     * @apiGroup Auth OrgUnits
     * @api {post} /v0/auth/orgunits/root Create root organisation
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
    router.post(
        "/root",
        requirePermission(authDecisionClient, "authObject/orgUnit/create"),
        async (req, res) => {
            try {
                const nodeId = await orgQueryer.createRootNode(req.body);
                res.status(200).json({ nodeId: nodeId });
            } catch (e) {
                respondWithError("POST /public/orgunits/root", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth OrgUnits
     * @api {get} /v0/auth/orgunits/:nodeId Get details for a node
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
    router.get(
        "/:nodeId",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/orgUnit/read"
        }),
        async (req, res) => {
            const nodeId = req.params.nodeId;
            handleMaybePromise(
                res,
                orgQueryer.getNodeById(
                    nodeId,
                    null,
                    null,
                    res.locals.authDecision
                ),
                "GET /public/orgunits/:nodeId",
                `Could not find org unit with id ${nodeId}`
            );
        }
    );

    /**
     * @apiGroup Auth OrgUnits
     * @api {put} /v0/auth/orgunits/:nodeId Update details for a node
     * @apiDescription Update the node with the specified id with supplied node data.
     *
     * @apiParam (Path) {string} nodeId id of the node to query
     * @apiParamExample (Body) {json}:
     *     {
     *       name: "other-team"
     *       description: "The other teams"
     *     }
     *
     * @apiSuccessExample {string} 200
     *     {
     *       "id": "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7",
     *       "name": "other-team",
     *       description: "The other teams"
     *     }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.put(
        "/:nodeId",
        requirePermission(authDecisionClient, "authObject/orgUnit/update"),
        async (req, res) => {
            try {
                const nodeId = req?.params?.nodeId;
                const newNodeData = {} as any;
                if (req?.body?.name) {
                    newNodeData.name = req.body.name;
                }
                if (req?.body?.description) {
                    newNodeData.description = req.body.description;
                }

                const existingNode = (
                    await orgQueryer.getNodeById(nodeId)
                ).valueOr(null);

                if (!existingNode) {
                    throw new ServerError(
                        "Cannot locate org unit record: " + nodeId
                    );
                }

                await orgQueryer.updateNode(nodeId, newNodeData);

                res.json({ ...existingNode, ...newNodeData });
            } catch (e) {
                respondWithError("PUT /public/orgunits/:nodeId", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth OrgUnits
     * @api {post} /v0/auth/orgunits/:parentNodeId/insert Create a new node under the parent node
     * @apiDescription Create a new node under the specified parent node
     *
     * @apiParam (Path) {string} parentNodeId id of the parent node
     * @apiParamExample (Body) {json}:
     *     {
     *       name: "other-team"
     *       description: "The other teams"
     *     }
     *
     * @apiSuccessExample {string} 200
     *     {
     *       "id": "e5f0ed5f-aa97-4e49-89a6-3f044aecc3f7",
     *       "name": "other-team",
     *       description: "The other teams"
     *     }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/:parentNodeId/insert",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/orgUnit/create",
            (req: Request, res: Response) => req.params.parentNodeId,
            "orgUnit"
        ),
        async (req, res) => {
            try {
                const parentNodeId = req.params.parentNodeId;

                const newNodeData = {} as any;
                if (req?.body?.name) {
                    newNodeData.name = req.body.name;
                } else {
                    throw new ServerError(
                        "Failed to insert a new node: name cannot be empty!",
                        400
                    );
                }

                if (req?.body?.description) {
                    newNodeData.description = req.body.description;
                }

                const parentNode = (
                    await orgQueryer.getNodeById(parentNodeId)
                ).valueOr(null);

                if (!parentNode) {
                    throw new ServerError(
                        "Cannot locate parent org unit record: " + parentNodeId
                    );
                }

                const newNodeId = await orgQueryer.insertNode(
                    parentNodeId,
                    newNodeData
                );

                const newNode = (
                    await orgQueryer.getNodeById(newNodeId)
                ).valueOrThrow(
                    new ServerError(
                        "Cannot locate the newly created node: " + newNodeId,
                        500
                    )
                );

                res.status(200).json(newNode);
            } catch (e) {
                respondWithError("POST orgunits/:parentNodeId/insert", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth OrgUnits
     * @api {get} /v0/auth/orgunits/:nodeId/children/immediate Get immediate children for a node
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
        "/:nodeId/children/immediate",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/orgUnit/read"
        }),
        async (req, res) => {
            try {
                const nodeId = req.params.nodeId;
                const nodes = await orgQueryer.getImmediateChildren(
                    nodeId,
                    null,
                    null,
                    res.locals.authDecision
                );
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
     * @apiGroup Auth OrgUnits
     * @api {get} /v0/auth/orgunits/:nodeId/children/all Get all children for a node
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
        "/:nodeId/children/all",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/orgUnit/read"
        }),
        async (req, res) => {
            try {
                const nodeId = req.params.nodeId;
                const nodes = await orgQueryer.getAllChildren(
                    nodeId,
                    false,
                    null,
                    null,
                    res.locals.authDecision
                );
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
     * @apiGroup Auth OrgUnits
     * @api {delete} /v0/auth/orgunits/:nodeId/subtree Delete subtree
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
        "/:nodeId/subtree",
        requirePermission(authDecisionClient, "authObject/orgUnit/delete"),
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

    /**
     * @apiGroup Auth OrgUnits
     * @api {delete} /v0/auth/orgunits/:nodeId Delete an org unit node
     * @apiDescription Delete an org unit node. You can't delete a root node with this API.
     *
     * @apiParam (Path) {string} nodeId The id of the node to be deleted.
     *
     * @apiSuccessExample {string} 200
     *     true
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 403, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.delete(
        "/:nodeId",
        requirePermission(authDecisionClient, "authObject/orgUnit/delete"),
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

    /**
     * @apiGroup Auth OrgUnits
     * @api {put} /v0/auth/orgunits/:nodeId/move/:newParentId Move a sub tree to a new parennt
     * @apiDescription Move a sub tree to a new parennt.
     *
     * @apiParam (Path) {string} nodeId The id of the root node of the sub tree to be moved.
     * @apiParam (Path) {string} newParentId The new parent node id that the sub tree wil be attached to.
     *
     * @apiSuccessExample {string} 200
     *     true
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 403, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.put(
        "/:nodeId/move/:newParentId",
        requirePermission(authDecisionClient, "authObject/orgUnit/update"),
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

    return router;
}
