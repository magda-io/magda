import express from "express";
import Database from "../Database.js";
import respondWithError from "../respondWithError.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { withAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware.js";
import {
    requireObjectPermission,
    requireObjectUpdatePermission
} from "../recordAuthMiddlewares.js";
import {
    getTableRecord,
    updateTableRecord,
    deleteTableRecord
} from "magda-typescript-common/src/SQLUtils.js";
import ServerError from "magda-typescript-common/src/ServerError.js";
import { sqls } from "sql-syntax";

export interface ApiRouterOptions {
    database: Database;
    authDecisionClient: AuthDecisionQueryClient;
}

export default function createOperationApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    /**
     * @apiGroup Auth Operations
     * @api {get} /v0/auth/operations/byUri/* Get a operation record by URI
     * @apiDescription Get a operation record by URI
     * Required `authObject/operation/read` permission to access this API.
     *
     * @apiParam (URL Path) {string} resUri the operation uri can be specified at the end of the URI path. e.g. `/v0/auth/operations/byUri/object/aspect/delete`
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
    router.get(
        "/byUri/*",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/operation/read"
        }),
        async function (req, res) {
            try {
                let opUri = req?.params?.[0];
                if (typeof opUri !== "string") {
                    throw new ServerError(
                        "Invalid operation uri is supplied.",
                        400
                    );
                }
                opUri = opUri.trim();
                if (!opUri) {
                    throw new ServerError(
                        "Invalid empty operation uri is supplied.",
                        400
                    );
                }

                const result = await database
                    .getPool()
                    .query(
                        ...sqls`SELECT * FROM operations WHERE uri = ${opUri}`.toQuery()
                    );

                if (!result?.rows?.length) {
                    throw new ServerError(
                        `Cannot locate the operation by uri: ${opUri}`,
                        404
                    );
                }
                res.json(result.rows[0]);
            } catch (e) {
                respondWithError("GET operation by URI", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Operations
     * @api {get} /v0/auth/operations/:id Get an operation record by ID
     * @apiDescription Get an operation record by ID
     * Required `authObject/operation/read` permission to access this API.
     *
     * @apiParam (URL Path) {string} id the operation id.
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
    router.get(
        "/:id",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/operation/read"
        }),
        async function (req, res) {
            try {
                const operationId = req?.params?.id?.trim();
                if (!operationId) {
                    throw new ServerError(
                        "Invalid empty operation id is supplied.",
                        400
                    );
                }
                const record = await getTableRecord(
                    database.getPool(),
                    "operations",
                    req.params.id,
                    res.locals.authDecision
                );
                if (!record) {
                    throw new ServerError(
                        `Cannot locate operation by id: ${operationId}`
                    );
                }
                res.json(record);
            } catch (e) {
                respondWithError("GET operation by ID", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Operations
     * @api {put} /v0/auth/operations/:id Update a operation record
     * @apiDescription Update a operation record
     * Supply a JSON object that contains fields to be updated in body.
     * You need have `authObject/operation/update` permission to access this API.
     *
     * @apiParam (URL Path) {string} id id of the operation record
     * @apiParamExample (Body) {json}:
     *    {
     *       "uri": "object/aspect/delete",
     *       "name": "Delete Aspect Definition",
     *       "description": "test description"
     *    }
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
            "authObject/operation/update",
            (req, res) => req.params.id,
            "operation"
        ),
        async function (req, res) {
            try {
                const record = await updateTableRecord(
                    database.getPool(),
                    "operations",
                    req.params.id,
                    req.body,
                    ["uri", "name", "description"]
                );
                res.json(record);
            } catch (e) {
                respondWithError("modify `operation`", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Operations
     * @api {delete} /v0/auth/operations/:id Delete an operation record
     * @apiDescription Delete an operation record.
     * When the operation is deleted, access will be removed from all existing permissions that are relevant to the operation.
     *
     * You need `authObject/operation/delete` permission in order to access this API.
     *
     * @apiParam (URL Path) {string} id id of the operation
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
            "authObject/operation/delete",
            (req, res) => req.params.id,
            "operation"
        ),
        async function (req, res) {
            try {
                await deleteTableRecord(
                    database.getPool(),
                    "operations",
                    req.params.id
                );
                res.json({ result: true });
            } catch (e) {
                respondWithError(
                    `delete \`operation\` ${req.params.id}`,
                    res,
                    e
                );
            }
        }
    );

    return router;
}
