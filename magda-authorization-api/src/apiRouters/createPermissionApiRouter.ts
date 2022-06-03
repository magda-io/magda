import express from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { requireObjectPermission } from "../recordAuthMiddlewares";
import {
    withAuthDecision,
    requirePermission,
    getUserId
} from "magda-typescript-common/src/authorization-api/authMiddleware";
import {
    searchTableRecord,
    createTableRecord,
    getTableRecord,
    updateTableRecord
} from "magda-typescript-common/src/SQLUtils";
import ServerError from "magda-typescript-common/src/ServerError";
import SQLSyntax, { sqls } from "sql-syntax";
import uniq from "lodash/uniq";

export interface ApiRouterOptions {
    database: Database;
    jwtSecret: string;
    authDecisionClient: AuthDecisionQueryClient;
}

export default function createPermissionApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    /**
     * @apiGroup Auth Permission
     * @api {get} /v0/auth/permissions/:id Get permission by ID
     * @apiDescription return the permission record identified by the ID
     * Required admin access.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        id: "xxx-xxx-xxxx-xxxx-xx",
     *        name: "View Datasets",
     *        resource_id: "xxx-xxx-xxxx-xx",
     *        resource_uri: "object/dataset/draft",
     *        user_ownership_constraint: true,
     *        org_unit_ownership_constraint: false,
     *        pre_authorised_constraint: false,
     *        operations: [{
     *          id: "xxxxx-xxx-xxx-xxxx",
     *          name: "Read Draft Dataset",
     *          uri: "object/dataset/draft/read",
     *          description: "xxxxxx"
     *        }],
     *        description?: "this is a dummy permission",
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
            operationUri: "authObject/permission/read"
        }),
        async function (req, res) {
            try {
                const permissionId = req?.params?.id?.trim();
                if (!permissionId) {
                    throw new ServerError(
                        "Invalid empty permission id is supplied.",
                        400
                    );
                }
                const records = await searchTableRecord(
                    database.getPool(),
                    "permissions",
                    [sqls`permissions.id = ${permissionId}`],
                    {
                        selectedFields: [
                            sqls`permissions.*`,
                            sqls`(
                                        SELECT COALESCE(jsonb_agg(op.*), '[]'::jsonb)
                                        FROM operations op 
                                        WHERE exists (
                                            SELECT 1 FROM permission_operations po WHERE po.permission_id = permissions.id AND po.operation_id = op.id
                                        )  
                                    ) as operations`,
                            sqls`( SELECT uri FROM resources r WHERE r.id = permissions.resource_id ) as resource_uri`
                        ],
                        limit: 1
                    }
                );
                if (!records?.length) {
                    throw new ServerError(
                        `Cannot locate permission by id: ${permissionId}`
                    );
                }
                res.json(records[0]);
            } catch (e) {
                respondWithError("GET permission by ID", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Permission
     * @api {post} /v0/auth/permissions Create a new permission record
     * @apiDescription Create a new permission
     * Returns the newly created permission record.
     * Required `authObject/permission/create` permission to access this API.
     *
     * @apiParamExample (Body) {json}:
     *     {
     *       "name": "a test permission",
     *       "user_ownership_constraint": false,
     *       "org_unit_ownership_constraint": true,
     *       "pre_authorised_constraint" : false,
     *       "description": "a test permission",
     *       "resource_id": "477d0720-aeda-47bd-8fc9-65badb851f46",
     *       "operationIds": ["739b5a83-291d-4420-a0eb-8fbeb2b5c186", "e64241f7-1660-4a6c-9bd9-07f716cf9156"]
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "name": "a test permission",
     *       "user_ownership_constraint": false,
     *       "org_unit_ownership_constraint": true,
     *       "pre_authorised_constraint" : false,
     *       "description": "a test permission",
     *       "resource_id": "477d0720-aeda-47bd-8fc9-65badb851f46",
     *       "owner_id": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "create_by": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "edit_time": "2022-03-28T10:18:10.479Z",
     *       "edit_by": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "edit_time": "2022-03-28T10:18:10.479Z"
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
        getUserId(options.jwtSecret),
        requirePermission(
            authDecisionClient,
            "authObject/permission/create",
            (req: Request, res: Response) => ({
                authObject: {
                    permission: req.body
                }
            })
        ),
        async function (req, res) {
            try {
                const pool = database.getPool();
                let { operationIds, ...permissionData } = req.body;

                if (!operationIds?.length) {
                    throw new ServerError(
                        "Failed to create permission: operationIds is required and should be a list of operation ids.",
                        400
                    );
                }

                operationIds = uniq(operationIds);

                if (!permissionData.resource_id) {
                    throw new ServerError(
                        "Failed to create permission: resource_id is required.",
                        400
                    );
                }

                const resource = await getTableRecord(
                    pool,
                    "resources",
                    permissionData.resource_id
                );
                if (!resource) {
                    throw new ServerError(
                        "Failed to create permission: cannot locate resource by supplied resource_id.",
                        400
                    );
                }

                const result = await pool.query(
                    ...sqls`SELECT COUNT(*) as count
                FROM operations 
                WHERE id IN (${SQLSyntax.csv(
                    ...operationIds
                )}) AND resource_id = ${resource.id}`.toQuery()
                );

                if (result?.rows?.[0]?.["count"] !== operationIds.length) {
                    throw new ServerError(
                        `Failed to create permission: all provided operation id must be valid and belong to the resource ${resource.id}`,
                        400
                    );
                }

                const client = await pool.connect();
                let permissionRecord: any;
                try {
                    await client.query("BEGIN");
                    const permissionSubmitData = { ...permissionData };
                    if (res?.locals?.userId) {
                        permissionSubmitData.create_by = res.locals.userId;
                        permissionSubmitData.owner_id = res.locals.userId;
                        permissionSubmitData.edit_by = res.locals.userId;
                    }
                    permissionRecord = await createTableRecord(
                        client,
                        "permissions",
                        permissionSubmitData,
                        [
                            "name",
                            "resource_id",
                            "user_ownership_constraint",
                            "org_unit_ownership_constraint",
                            "pre_authorised_constraint",
                            "description",
                            "create_by",
                            "owner_id",
                            "edit_by"
                        ]
                    );

                    const values = (operationIds as string[]).map(
                        (id) => sqls`(${permissionRecord.id},${id})`
                    );

                    await client.query(
                        ...sqls`INSERT INTO permission_operations 
                    (permission_id, operation_id) VALUES 
                    ${SQLSyntax.csv(...values)}`.toQuery()
                    );

                    await client.query("COMMIT");
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    client.release();
                }
                res.json(permissionRecord);
            } catch (e) {
                respondWithError("Create a permission ", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Permission
     * @api {put} /v0/auth/permissions/:permissionId Update a permission record
     * @apiDescription Update a permission record
     * Supply a JSON object that contains fields to be updated in body.
     * You need have update permission to the role record (`authObject/permission/update`) in order to access this API.
     *
     * @apiParam (URL Path) {string} permissionId id of the permission record
     * @apiParamExample (Body) {json}:
     *     {
     *       "name": "xxxxx",
     *       "description": "xxsdsd",
     *       "resource_id": "1c0889aa-6d4f-4492-9a6f-1ecc4765e8d6",
     *       "user_ownership_constraint": true,
     *       "org_unit_ownership_constraint": false,
     *       "pre_authorised_constraint": false,
     *       "operationIds": ["8d4b99f3-c0c0-46e6-9832-330d14abad00", "7c2013bd-eee6-40f1-83ef-920600d21db3"]
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *      id: "c85a9735-7d85-4d50-a151-c79dec644ba0",
     *      "name": "xxxxx",
     *      "description": "sdfsdfds sdfsdf sdfs",
     *      "resource_id": "1c0889aa-6d4f-4492-9a6f-1ecc4765e8d6",
     *      "user_ownership_constraint": true,
     *      "org_unit_ownership_constraint": false,
     *      "pre_authorised_constraint": false,
     *      "owner_id": "78b37c9b-a59a-4da1-9b84-ac48dff43a1a",
     *      "create_by": "78b37c9b-a59a-4da1-9b84-ac48dff43a1a",
     *      "create_time": "2022-06-03 02:28:34.794547+00",
     *      "edit_by": "78b37c9b-a59a-4da1-9b84-ac48dff43a1a",
     *      "edit_time": "2022-06-03 02:28:34.794547+00"
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
        "/:permissionId",
        getUserId(options.jwtSecret),
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/permission/update",
            (req, res) => req.params.permissionId,
            "permission"
        ),
        async function (req, res) {
            try {
                const pool = database.getPool();
                const permissionId = req.params.permissionId;
                const { operationIds, ...permissionData } = req.body;

                if (!permissionId) {
                    throw new Error(
                        "Failed to update permission: invalid empty permissionId."
                    );
                }

                const permission = await getTableRecord(
                    pool,
                    "permissions",
                    permissionId
                );
                if (!permission) {
                    throw new Error(
                        "Failed to update permission: cannot locate the permission record specified by permissionId: " +
                            permissionId
                    );
                }

                const opIds = operationIds ? uniq(operationIds) : [];

                const resourceId = permissionData?.resource_id
                    ? permissionData.resource_id
                    : permission?.resource_id;

                const resource = await getTableRecord(
                    pool,
                    "resources",
                    resourceId
                );
                if (!resource) {
                    throw new Error(
                        "Failed to update permission: cannot locate resource by supplied resource_id."
                    );
                }

                if (opIds.length) {
                    const result = await pool.query(
                        ...sqls`SELECT COUNT(*) as count
                    FROM operations 
                    WHERE id IN (${SQLSyntax.csv(
                        ...operationIds
                    )}) AND resource_id = ${resource.id}`.toQuery()
                    );

                    if (result?.rows?.[0]?.["count"] !== operationIds.length) {
                        throw new Error(
                            `Failed to update permission: all provided operation id must be valid and belong to the resource ${resource.id}`
                        );
                    }
                }

                const client = await pool.connect();
                let permissionRecord: any;
                try {
                    await client.query("BEGIN");
                    const permissionUpdateData = {
                        ...permissionData,
                        edit_time: sqls` CURRENT_TIMESTAMP `
                    };
                    if (res?.locals?.userId) {
                        permissionUpdateData.edit_by = res.locals.userId;
                    } else {
                        permissionUpdateData.edit_by = sqls` NULL `;
                    }
                    permissionRecord = await updateTableRecord(
                        client,
                        "permissions",
                        permissionId,
                        permissionUpdateData,
                        [
                            "name",
                            "resource_id",
                            "user_ownership_constraint",
                            "org_unit_ownership_constraint",
                            "pre_authorised_constraint",
                            "description",
                            "edit_by",
                            "edit_time"
                        ]
                    );

                    if (typeof operationIds?.length !== "undefined") {
                        // operationIds property is provided
                        // i.e. user's intention is to update operations as well
                        // delete all current operation / permission relationship
                        await client.query(
                            ...sqls`DELETE FROM permission_operations WHERE permission_id=${permissionId}`.toQuery()
                        );
                    }

                    if (opIds.length) {
                        const values = (opIds as string[]).map(
                            (id) => sqls`(${permissionId},${id})`
                        );

                        await client.query(
                            ...sqls`INSERT INTO permission_operations 
                            (permission_id, operation_id) VALUES 
                            ${SQLSyntax.csv(...values)}`.toQuery()
                        );
                    }

                    await client.query("COMMIT");
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    client.release();
                }
                res.json(permissionRecord);
            } catch (e) {
                respondWithError("Update a permission record", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Permission
     * @api {delete} /v0/auth/permissions/:permissionId Delete a permission record
     * @apiDescription Delete a permission record.
     * If this permission has been assigned to any roles, an error will be thrown.
     * You need `authObject/permission/delete` permission in order to access this API.
     *
     * @apiParam (URL Path) {string} permissionId id of the permission record
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the deletion action is actually performed or the permission record doesn't exist.
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
        "/:permissionId",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/permission/delete",
            (req, res) => req.params.permissionId,
            "permission"
        ),
        async function (req, res) {
            try {
                const result = await database.deletePermission(
                    req?.params?.permissionId
                );
                res.json({ result });
            } catch (e) {
                respondWithError("Delete a permission record", res, e);
            }
        }
    );

    return router;
}
