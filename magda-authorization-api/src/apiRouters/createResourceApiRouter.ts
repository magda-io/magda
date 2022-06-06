import express, { Request, Response } from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import {
    requirePermission,
    withAuthDecision
} from "magda-typescript-common/src/authorization-api/authMiddleware";
import {
    requireObjectPermission,
    requireObjectUpdatePermission
} from "../recordAuthMiddlewares";
import {
    getTableRecord,
    createTableRecord,
    updateTableRecord,
    deleteTableRecord,
    searchTableRecord
} from "magda-typescript-common/src/SQLUtils";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";
import ServerError from "@magda/typescript-common/dist/ServerError";

export interface ApiRouterOptions {
    database: Database;
    authDecisionClient: AuthDecisionQueryClient;
}

const resourceKeywordSearchFields = ["name", "description", "uri"];
const operationKeywordSearchFields = resourceKeywordSearchFields;

export default function createResourceApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    function createFetchResourcesHandler(
        returnCount: boolean,
        apiName: string
    ) {
        return async function fetchResources(req: Request, res: Response) {
            try {
                const conditions: SQLSyntax[] = [];
                if (req.query?.keyword) {
                    const keyword = "%" + req.query?.keyword + "%";
                    conditions.push(
                        SQLSyntax.joinWithOr(
                            resourceKeywordSearchFields.map(
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
                if (req.query?.uri) {
                    conditions.push(sqls`"uri" = ${req.query.uri}`);
                }
                const records = await searchTableRecord(
                    database.getPool(),
                    "resources",
                    conditions,
                    {
                        authDecision: res.locals.authDecision,
                        selectedFields: [
                            returnCount ? sqls`COUNT(*) as count` : sqls`*`
                        ],
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

    /**
     * @apiGroup Auth Resources
     * @api {get} /v0/auth/resources Get all matched resource records
     * @apiDescription return a list matched resource records.
     * Required `authObject/resource/read` permission to access this API.
     *
     * @apiParam (Query String) {string} [keyword] When specified, will return only permissions whose `name`, `description` or `uri` contains the supplied keyword.
     * @apiParam (Query String) {string} [id] When specified, will return the records whose `id` matches the supplied value.
     * @apiParam (Query String) {string} [uri] When specified, will return the records whose `uri` field matches the supplied value.
     * @apiParam (Query String) {number} [offset] When specified, will return the records from specified offset in the result set.
     * @apiParam (Query String) {number} [limit] This parameter no.of records to be returned.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        "id": "xxx-xxx-xxxx-xxxx-xx",
     *        "uri": "object/record",
     *        "name": "Records",
     *        "description": "A generic concept represents all types of records. Any other derived record types (e.g. datasets) can be considered as generic records with certian aspect data attached. Grant permissions to this resources will allow a user to access any specialized type records (e.g. dataset)",
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
            operationUri: "authObject/resource/read"
        }),
        createFetchResourcesHandler(false, "Get resources")
    );

    /**
     * @apiGroup Auth Resources
     * @api {get} /v0/auth/resource/count Get the count of all matched resource records
     * @apiDescription return the count number of all matched resource records.
     * Required `authObject/resource/read` permission to access this API.
     *
     * @apiParam (Query String) {string} [keyword] When specified, will return only permissions whose `name`, `description` or `uri` contains the supplied keyword.
     * @apiParam (Query String) {string} [id] When specified, will return the records whose `id` matches the supplied value.
     * @apiParam (Query String) {string} [uri] When specified, will return the records whose `uri` field matches the supplied value.
     *
     * @apiSuccessExample {json} 200
     *    {
     *      "count" : 5
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
            operationUri: "authObject/resource/read"
        }),
        createFetchResourcesHandler(true, "Get resources count")
    );

    /**
     * @apiGroup Auth Resources
     * @api {post} /v0/auth/resources Create a new resource record.
     * @apiDescription
     * Create a new resource record.
     * Returns the newly created resource record.
     * Required `authObject/resource/create` permission to access this API.
     *
     * @apiParam (URL Path) {string} roleId id of the role
     * @apiParamExample (Body) {json}:
     *     {
     *        "uri": "object/record",
     *        "name": "Records",
     *        "description": "test description"
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "uri": "object/record",
     *       "name": "Records",
     *       "description": "test description"
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/",
        requirePermission(
            authDecisionClient,
            "authObject/resource/create",
            (req, res) => ({
                authObject: {
                    resource: req.body
                }
            })
        ),
        async function (req, res) {
            try {
                const record = await createTableRecord(
                    database.getPool(),
                    "resources",
                    req.body,
                    ["uri", "name", "description"]
                );
                res.json(record);
            } catch (e) {
                respondWithError("create `resource`", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Resources
     * @api {put} /v0/auth/resources/:id Update a resource record
     * @apiDescription Update a resource record
     * Supply a JSON object that contains fields to be updated in body.
     * You need have `authObject/resource/update` permission to access this API.
     *
     * @apiParam (URL Path) {string} id id of the resource
     * @apiParamExample (Body) {json}:
     *     {
     *        "uri": "object/record",
     *        "name": "Records",
     *        "description": "test description"
     *    }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "uri": "object/record",
     *       "name": "Records",
     *       "description": "test description"
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
        "/:id",
        requireObjectUpdatePermission(
            authDecisionClient,
            database,
            "authObject/resource/update",
            (req, res) => req.params.id,
            "resource"
        ),
        async function (req, res) {
            try {
                const record = await updateTableRecord(
                    database.getPool(),
                    "resources",
                    req.params.id,
                    req.body,
                    ["uri", "name", "description"]
                );
                res.json(record);
            } catch (e) {
                respondWithError("modify `resource`", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Resources
     * @api {delete} /v0/auth/resources/:id Delete a resource record
     * @apiDescription Delete a resource record.
     * When the resource is deleted, any operations that are associated with this resource will be removed as well.
     * However, if there is a permission associated with the resource that is to be deleted, a database error will be thrown.
     *
     * You need `authObject/resource/delete` permission in order to access this API.
     *
     * @apiParam (URL Path) {string} id id of the resource
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the deletion action is actually performed or the record doesn't exist.
     * @apiSuccessExample {json} 200
     *    {
     *        result: true
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
        "/:id",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/resource/delete",
            (req, res) => req.params.id,
            "resource"
        ),
        async function (req, res) {
            try {
                await deleteTableRecord(
                    database.getPool(),
                    "resources",
                    req.params.id
                );
                res.json({ result: true });
            } catch (e) {
                respondWithError(
                    `delete \`resource\` ${req.params.id}`,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Operations
     * @api {post} /v0/auth/resources/:resId/operations Create an operation for a resource
     * @apiDescription Create an new operation for a resource
     * Returns the newly created operation record.
     * Required `authObject/operation/create` permission to access this API.
     *
     * @apiParam (URL Path) {string} resId id of the resource
     * @apiParamExample (Body) {json}:
     *     {
     *        "uri": "object/aspect/delete",
     *        "name": "Delete Aspect Definition",
     *        "description": "test description"
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "uri": "object/aspect/delete",
     *       "name": "Delete Aspect Definition",
     *       "description": "test description",
     *       "resource_id": "2c0981d2-71bf-4806-a590-d1c779dcad8b"
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/:resId/operations",
        requirePermission(
            authDecisionClient,
            "authObject/operation/create",
            (req, res) => ({
                authObject: {
                    resource: req.body
                }
            })
        ),
        async function (req, res) {
            try {
                const record = await createTableRecord(
                    database.getPool(),
                    "operation",
                    {
                        ...req.body,
                        resource_id: req.params.resId
                    },
                    ["uri", "name", "description", "resource_id"]
                );
                res.json(record);
            } catch (e) {
                respondWithError(
                    `create 'operation' for 'resource' ${req.params.resId}`,
                    res,
                    e
                );
            }
        }
    );

    function createFetchResourceOperationsHandler(
        returnCount: boolean,
        apiName: string
    ) {
        return async function (req: Request, res: Response) {
            try {
                const conditions: SQLSyntax[] = [
                    sqls`resource_id = ${req.params.resId}`
                ];
                if (req.query?.keyword) {
                    const keyword = "%" + req.query?.keyword + "%";
                    conditions.push(
                        SQLSyntax.joinWithOr(
                            operationKeywordSearchFields.map(
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
                if (req.query?.uri) {
                    conditions.push(sqls`"uri" = ${req.query.uri}`);
                }
                // when user has the permission to access the resource
                // we should let him to access all operations of the resources
                const records = await searchTableRecord(
                    database.getPool(),
                    "operations",
                    conditions,
                    {
                        selectedFields: [
                            returnCount ? sqls`COUNT(*) as count` : sqls`*`
                        ],
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
                respondWithError(apiName + req.params.resId, res, e);
            }
        };
    }

    /**
     * @apiGroup Auth Operations
     * @api {get} /v0/auth/resources/:resId/operations Get operations of a resource that meet selection criteria
     * @apiDescription return operation records of a role that meet selection criteria
     * Required `authObject/resource/read` permission to access this API.
     *
     * @apiParam (Query String) {string} [keyword] When specified, will return only role records whose `name`, `description` or `uri` contains the supplied keyword.
     * @apiParam (Query String) {string} [id] When specified, will return the records whose `id` matches the supplied value.
     * @apiParam (Query String) {string} [uri] When specified, will return the records whose `uri` matches the supplied value.
     * @apiParam (Query String) {number} [offset] When specified, will return the records from specified offset in the result set.
     * @apiParam (Query String) {number} [limit] This parameter no.of records to be returned.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "uri": "object/aspect/delete",
     *       "name": "Delete Aspect Definition",
     *       "description": "test description",
     *       "resource_id": "2c0981d2-71bf-4806-a590-d1c779dcad8b"
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
        "/:resId/operations",
        // when user has the permission to access the resource
        // we should let him to access all operations of the resources
        // thus, we only request read permission to the resource only
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/resource/read",
            (req, res) => req.params.resId,
            "resource"
        ),
        createFetchResourceOperationsHandler(
            false,
            "Get operations of the resource"
        )
    );

    /**
     * @apiGroup Auth Operations
     * @api {get} /v0/auth/resources/:resId/operations/count Get the count of all operations of a resource that meet selection criteria
     * @apiDescription return the count of all operation records of a role that meet selection criteria
     * Required `authObject/resource/read` permission to access this API.
     *
     * @apiParam (Query String) {string} [keyword] When specified, will return only role records whose `name`, `description` or `uri` contains the supplied keyword.
     * @apiParam (Query String) {string} [id] When specified, will return the records whose `id` matches the supplied value.
     * @apiParam (Query String) {string} [uri] When specified, will return the records whose `uri` matches the supplied value.
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "count": 5
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
        "/:resId/operations/count",
        // when user has the permission to access the resource
        // we should let him to access all operations of the resources
        // thus, we only request read permission to the resource only
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/resource/read",
            (req, res) => req.params.resId,
            "resource"
        ),
        createFetchResourceOperationsHandler(
            true,
            "Get operations count of the resource"
        )
    );

    /**
     * @apiGroup Auth Resources
     * @api {get} /v0/auth/resources/byUri/* Get a resource record by URI
     * @apiDescription Get a resource record by URI
     * Required `authObject/resource/read` permission to access this API.
     *
     * @apiParam (URL Path) {string} resUri the resource uri can be specified at the end of the URI path. e.g. `/v0/auth/resources/byUri/object/record`
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "id": "xxx-xxx-xxxx-xxxx-xx",
     *        "uri": "object/record",
     *        "name": "Records",
     *        "description": "A generic concept represents all types of records. "
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
        "/byUri/*",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/resource/read"
        }),
        async function (req, res) {
            try {
                let resUri = req?.params?.[0];
                if (typeof resUri !== "string") {
                    throw new ServerError(
                        "Invalid resource uri is supplied.",
                        400
                    );
                }
                resUri = resUri.trim();
                if (!resUri) {
                    throw new ServerError(
                        "Invalid empty resource uri is supplied.",
                        400
                    );
                }

                const result = await database
                    .getPool()
                    .query(
                        ...sqls`SELECT * FROM resources WHERE uri = ${resUri}`.toQuery()
                    );

                if (!result?.rows?.length) {
                    throw new ServerError(
                        `Cannot locate the resource by uri: ${resUri}`,
                        404
                    );
                }
                res.json(result.rows[0]);
            } catch (e) {
                respondWithError("GET resource by URI", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Resources
     * @api {get} /v0/auth/resources/:id Get a resource record by ID
     * @apiDescription Get a resource record by ID
     * Required `authObject/resource/read` permission to access this API.
     *
     * @apiParam (URL Path) {string} id the resource id.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "id": "xxx-xxx-xxxx-xxxx-xx",
     *        "uri": "object/record",
     *        "name": "Records",
     *        "description": "A generic concept represents all types of records. "
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
        "/:id",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/resource/read"
        }),
        async function (req, res) {
            try {
                const record = await getTableRecord(
                    database.getPool(),
                    "resources",
                    req.params.id,
                    res.locals.authDecision
                );
                if (!record) {
                    res.status(404).send(
                        `Cannot locate record by id: ${req.params.id}`
                    );
                } else {
                    res.json(record);
                }
            } catch (e) {
                respondWithError("GET resource by ID", res, e);
            }
        }
    );

    return router;
}
