import express, { Request, Response } from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { requireObjectPermission } from "../recordAuthMiddlewares";
import {
    withAuthDecision,
    requirePermission,
    getUserId
} from "magda-typescript-common/src/authorization-api/authMiddleware";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";
import {
    searchTableRecord,
    createTableRecord,
    getTableRecord,
    updateTableRecord
} from "magda-typescript-common/src/SQLUtils";
import uniq from "lodash/uniq";
import ServerError from "magda-typescript-common/src/ServerError";

export interface ApiRouterOptions {
    database: Database;
    jwtSecret: string;
    authDecisionClient: AuthDecisionQueryClient;
}

const roleKeywordSearchFields = ["name", "description"];
const permissionKeywordSearchFields = ["name", "description"];

export default function createRoleApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    function createFetchPermissionsHandler(
        returnCount: boolean,
        apiName: string
    ) {
        return async function fetchPermissions(req: Request, res: Response) {
            try {
                const roleId = req.params.roleId;
                const conditions: SQLSyntax[] = [
                    sqls`(EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = permissions.id and rp.role_id = ${roleId}))`
                ];
                if (req.query?.keyword) {
                    const keyword = "%" + req.query?.keyword + "%";
                    conditions.push(
                        SQLSyntax.joinWithOr(
                            permissionKeywordSearchFields.map(
                                (field) =>
                                    sqls`${escapeIdentifier(
                                        "permissions." + field
                                    )} ILIKE ${keyword}`
                            )
                        ).roundBracket()
                    );
                }
                if (req.query?.id) {
                    conditions.push(sqls`permissions.id = ${req.query.id}`);
                }
                if (req.query?.owner_id) {
                    conditions.push(
                        sqls`permissions.owner_id = ${req.query.owner_id}`
                    );
                }
                if (req.query?.create_by) {
                    conditions.push(
                        sqls`permissions.create_by = ${req.query.create_by}`
                    );
                }
                if (req.query?.edit_by) {
                    conditions.push(
                        sqls`permissions.edit_by = ${req.query.edit_by}`
                    );
                }

                const records = await searchTableRecord(
                    database.getPool(),
                    "permissions",
                    conditions,
                    {
                        selectedFields: returnCount
                            ? [sqls`COUNT(permissions.*) as count`]
                            : [
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
     * @apiGroup Auth Permissions
     * @api {get} /v0/auth/roles/:roleId/permissions Get all matched permissions of a role
     * @apiDescription return a list matched permissions of a role.
     * Required `authObject/role/read` permission to access this API.
     *
     * @apiParam (URL Path) {string} roleId id of the role
     * @apiParam (Query String) {string} [keyword] When specified, will return only permissions whose `name` or `description` contains the supplied keyword.
     * @apiParam (Query String) {string} [id] When specified, will return the permission whose `id` matches the supplied value.
     * @apiParam (Query String) {string} [owner_id] When specified, will return the permission whose `owner_id` matches the supplied value.
     * @apiParam (Query String) {string} [create_by] When specified, will return the permission whose `create_by` matches the supplied value.
     * @apiParam (Query String) {string} [edit_by] When specified, will return the permission whose `edit_by` matches the supplied value.
     * @apiParam (Query String) {number} [offset] When specified, will return the records from specified offset in the result set.
     * @apiParam (Query String) {number} [limit] This parameter no.of records to be returned.
     *
     * @apiSuccessExample {json} 200
     *    [{
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
        "/:roleId/permissions",
        // users have permission to a role will have access to read all permissions it contains
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/role/read",
            (req, res) => req.params.roleId,
            "role"
        ),
        createFetchPermissionsHandler(false, "Get role's permission records")
    );

    /**
     * @apiGroup Auth Permissions
     * @api {get} /v0/auth/roles/:roleId/permissions/count Get the count of all matched permissions of a role
     * @apiDescription return the count number of all matched permissions of a role.
     * Required `authObject/role/read` permission to access this API.
     *
     * @apiParam (URL Path) {string} roleId id of the role
     * @apiParam (Query String) {string} [keyword] When specified, will return only permissions whose `name` or `description` contains the supplied keyword.
     * @apiParam (Query String) {string} [id] When specified, will return the permission whose `id` matches the supplied value.
     * @apiParam (Query String) {string} [owner_id] When specified, will return the permission whose `owner_id` matches the supplied value.
     * @apiParam (Query String) {string} [create_by] When specified, will return the permission whose `create_by` matches the supplied value.
     * @apiParam (Query String) {string} [edit_by] When specified, will return the permission whose `edit_by` matches the supplied value.
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
        "/:roleId/permissions/count",
        // users have permission to a role will have access to read all permissions it contains
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/role/read",
            (req, res) => req.params.roleId,
            "role"
        ),
        createFetchPermissionsHandler(
            true,
            "Get role's permission records count"
        )
    );

    /**
     * @apiGroup Auth Permissions
     * @api {post} /v0/auth/roles/:roleId/permissions Create a new permission and add to the role
     * @apiDescription
     * Create a new permission and add to the role specified by roleId.
     * Returns the newly created permission record.
     * Required `authObject/role/update` permission to access this API.
     *
     * @apiParam (URL Path) {string} roleId id of the role
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
        "/:roleId/permissions",
        getUserId(options.jwtSecret),
        // we consider this operation as an operation of updating the role
        // thus, require permission to perform `authObject/role/update`
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/role/update",
            (req, res) => req.params.roleId,
            "role"
        ),
        async function (req, res) {
            try {
                const pool = database.getPool();
                const roleId = req.params.roleId;
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

                    await client.query(
                        ...sqls`INSERT INTO role_permissions (role_id, permission_id) VALUES (${roleId}, ${permissionRecord.id})`.toQuery()
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
                respondWithError(
                    "Create a permission and add to the role " +
                        req?.params?.roleId,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Permissions
     * @api {put} /v0/auth/roles/:roleId/permissions/:permissionId Update a role's permission record
     * @apiDescription Update a role's permission record
     * Supply a JSON object that contains fields to be updated in body.
     * You need have update permission to the role record (`authObject/role/update`) in order to access this API.
     *
     * @apiParam (URL Path) {string} roleId id of the role
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
        "/:roleId/permissions/:permissionId",
        getUserId(options.jwtSecret),
        // we consider this operation as an operation of updating the role
        // thus, require permission to perform `authObject/role/update`
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/role/update",
            (req, res) => req.params.roleId,
            "role"
        ),
        async function (req, res) {
            try {
                const pool = database.getPool();
                const roleId = req.params.roleId;
                const permissionId = req.params.permissionId;
                const { operationIds, ...permissionData } = req.body;

                if (!roleId) {
                    throw new Error(
                        "Failed to update permission: invalid empty roleId."
                    );
                }

                if (!permissionId) {
                    throw new Error(
                        "Failed to update permission: invalid empty permissionId."
                    );
                }

                const rolePermissionRecords = await searchTableRecord(
                    pool,
                    "role_permissions",
                    [
                        sqls`role_id = ${roleId}`,
                        sqls`permission_id = ${permissionId}`
                    ],
                    {
                        limit: 1
                    }
                );

                if (!rolePermissionRecords?.length) {
                    throw new Error(
                        "Failed to update permission: specified role doesn't contain the specified permission"
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
                respondWithError(
                    "Update permission for role " + req?.params?.roleId,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Permissions
     * @api {delete} /v0/auth/roles/:roleId/permissions/:permissionId Delete a permission from a role
     * @apiDescription Delete a permission from a role.
     * if the permission has not assigned to other roles, the permission will be deleted as well.
     * You need `authObject/role/update` permission in order to access this API.
     *
     * @apiParam (URL Path) {string} roleId id of the role
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
        "/:roleId/permissions/:permissionId",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/role/update",
            (req, res) => req.params.roleId,
            "role"
        ),
        async function (req, res) {
            try {
                await database.deleteRolePermission(
                    req?.params?.roleId,
                    req?.params?.permissionId
                );
                res.json({ result: true });
            } catch (e) {
                respondWithError(
                    "Delete a permission from the role" + req?.params?.roleId,
                    res,
                    e
                );
            }
        }
    );

    function createFetchRolesHandler(returnCount: boolean, apiName: string) {
        return async function (req: Request, res: Response) {
            try {
                const conditions: SQLSyntax[] = [];
                if (req.query?.keyword) {
                    const keyword = "%" + req.query?.keyword + "%";
                    conditions.push(
                        SQLSyntax.joinWithOr(
                            roleKeywordSearchFields.map(
                                (field) =>
                                    sqls`${escapeIdentifier(
                                        `roles.${field}`
                                    )} ILIKE ${keyword}`
                            )
                        ).roundBracket()
                    );
                }
                if (req.query?.id) {
                    conditions.push(sqls`roles.role.id = ${req.query.id}`);
                }
                if (req.query?.owner_id) {
                    conditions.push(
                        sqls`roles.owner_id = ${req.query.owner_id}`
                    );
                }
                if (req.query?.create_by) {
                    conditions.push(
                        sqls`roles.create_by = ${req.query.create_by}`
                    );
                }
                if (req.query?.edit_by) {
                    conditions.push(sqls`roles.edit_by = ${req.query.edit_by}`);
                }
                if (req.query?.user_id) {
                    conditions.push(
                        sqls`user_roles.user_id = ${req.query.user_id}`
                    );
                }
                const records = await searchTableRecord(
                    database.getPool(),
                    "roles",
                    conditions,
                    {
                        leftJoins: [
                            {
                                table: "user_roles",
                                joinCondition: sqls`user_roles.role_id = roles.id`
                            }
                        ],
                        selectedFields: returnCount
                            ? [sqls`COUNT(DISTINCT roles.id) as count`]
                            : [sqls`roles.*`],
                        authDecision: res.locals.authDecision,
                        groupBy: returnCount ? undefined : sqls`roles.id`,
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
     * @apiGroup Auth Roles
     * @api {get} /v0/auth/roles Get role records meet selection criteria
     * @apiDescription return role records meet selection criteria
     * Required `authObject/role/read` permission to access this API.
     *
     * @apiParam (Query String) {string} [keyword] When specified, will return only role records whose `name` or `description` contains the supplied keyword.
     * @apiParam (Query String) {string} [id] When specified, will return the records whose `id` matches the supplied value.
     * @apiParam (Query String) {string} [owner_id] When specified, will return the records whose `owner_id` matches the supplied value.
     * @apiParam (Query String) {string} [create_by] When specified, will return the records whose `create_by` matches the supplied value.
     * @apiParam (Query String) {string} [edit_by] When specified, will return the records whose `edit_by` matches the supplied value.
     * @apiParam (Query String) {string} [user_id] When specified, will return the records whose `user_id` matches the supplied value.
     * @apiParam (Query String) {number} [offset] When specified, will return the records from specified offset in the result set.
     * @apiParam (Query String) {number} [limit] This parameter no.of records to be returned.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        id: "xxx-xxx-xxxx-xxxx-xx",
     *        name: "test role",
     *        description: "this is a dummy role",
     *        owner_id: "xxx-xxx-xxxx-xx",
     *        create_by: "xxx-xxx-xxxx-xx",
     *        create_time: "2019-04-04 04:20:54.376504+00",
     *        edit_by: "xxx-xxx-xxxx-xx",
     *        edit_time: "2019-04-04 04:20:54.376504+00"
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
            operationUri: "authObject/role/read"
        }),
        createFetchRolesHandler(false, "GET roles")
    );

    /**
     * @apiGroup Auth Roles
     * @api {get} /v0/auth/roles/count Get the count of the role records meet selection criteria
     * @apiDescription return the count of the role records meet selection criteria
     * Required `authObject/role/read` permission to access this API.
     *
     * @apiParam (Query String) {string} [keyword] When specified, will return only role records whose `name` or `description` contains the supplied keyword.
     * @apiParam (Query String) {string} [id] When specified, will return the records whose `id` matches the supplied value.
     * @apiParam (Query String) {string} [owner_id] When specified, will return the records whose `owner_id` matches the supplied value.
     * @apiParam (Query String) {string} [create_by] When specified, will return the records whose `create_by` matches the supplied value.
     * @apiParam (Query String) {string} [edit_by] When specified, will return the records whose `edit_by` matches the supplied value.
     * @apiParam (Query String) {string} [user_id] When specified, will return the records whose `user_id` matches the supplied value.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "count": 5
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
            operationUri: "authObject/role/read"
        }),
        createFetchRolesHandler(true, "GET role records count")
    );

    /**
     * @apiGroup Auth Roles
     * @api {post} /v0/auth/roles Create a role record
     * @apiDescription
     * Create a role record
     * Required `authObject/role/create` permission to access this API.
     *
     * @apiParamExample (Body) {json}:
     *     {
     *       "name": "a test role",
     *       "description": "a test role"
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "name": "a test role",
     *       "description": "a test role",
     *       "owner_id": "xxx-xxx-xxxx-xx",
     *       "create_by": "xxx-xxx-xxxx-xx",
     *       "create_time": "2019-04-04 04:20:54.376504+00",
     *       "edit_by": "xxx-xxx-xxxx-xx",
     *       "edit_time": "2019-04-04 04:20:54.376504+00"
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
            "authObject/role/create",
            (req: Request, res: Response) => ({
                authObject: {
                    role: req.body
                }
            })
        ),
        async function (req: Request, res: Response) {
            try {
                const role = req?.body;
                role.name = role?.name?.trim();
                if (!role.name) {
                    throw new ServerError("Role name cannot be empty!", 400);
                }
                if (res?.locals?.userId) {
                    role.create_by = res.locals.userId;
                    role.owner_id = res.locals.userId;
                    role.edit_by = res.locals.userId;
                }
                const newRole = await createTableRecord(
                    database.getPool(),
                    "roles",
                    role,
                    ["name", "description", "create_by", "owner_id", "edit_by"]
                );
                res.json(newRole);
            } catch (e) {
                respondWithError("POST /roles", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Roles
     * @api {put} /v0/auth/roles/:roleId Update a role record
     * @apiDescription Update a role's permission record
     * Supply a JSON object that contains fields to be updated in body.
     * You need have `authObject/role/update` permission in order to access this API.
     *
     * @apiParam (URL Path) {string} roleId id of the role
     * @apiParamExample (Body) {json}:
     *     {
     *       "name": "a test role",
     *       "description": "a test role"
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "name": "a test role",
     *       "description": "a test role",
     *       "owner_id": "xxx-xxx-xxxx-xx",
     *       "create_by": "xxx-xxx-xxxx-xx",
     *       "create_time": "2019-04-04 04:20:54.376504+00",
     *       "edit_by": "xxx-xxx-xxxx-xx",
     *       "edit_time": "2019-04-04 04:20:54.376504+00"
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
        "/:roleId",
        getUserId(options.jwtSecret),
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/role/update",
            (req, res) => req.params.roleId,
            "role"
        ),
        async function (req: Request, res: Response) {
            try {
                const roleId = req?.params?.roleId?.trim();
                const role = {
                    ...req.body
                };

                role.name = role?.name?.trim();

                if (!roleId) {
                    throw new ServerError("Role ID cannot be empty!", 400);
                }
                if (!role.name) {
                    throw new ServerError("Role name cannot be empty!", 400);
                }

                const roleRecord = await getTableRecord(
                    database.getPool(),
                    "roles",
                    roleId
                );
                if (!roleRecord) {
                    throw new ServerError(
                        "Cannot locate role record by ID: " + roleId,
                        400
                    );
                }

                role["edit_time"] = sqls` CURRENT_TIMESTAMP `;
                if (res?.locals?.userId) {
                    role.edit_by = res.locals.userId;
                } else {
                    role.edit_by = sqls` NULL `;
                }

                const newRole = await updateTableRecord(
                    database.getPool(),
                    "roles",
                    roleId,
                    role,
                    ["name", "description", "edit_by", "edit_time"]
                );

                res.json(newRole);
            } catch (e) {
                respondWithError("POST /roles", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Roles
     * @api {get} /v0/auth/roles/:roleId Get a role record by ID
     * @apiDescription
     * Get a role record by ID
     * Required `authObject/role/read` permission to access this API.
     *
     * @apiParam (URL Path) {string} roleId id of the role
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "name": "a test role",
     *       "description": "a test role",
     *       "owner_id": "xxx-xxx-xxxx-xx",
     *       "create_by": "xxx-xxx-xxxx-xx",
     *       "create_time": "2019-04-04 04:20:54.376504+00",
     *       "edit_by": "xxx-xxx-xxxx-xx",
     *       "edit_time": "2019-04-04 04:20:54.376504+00"
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
        "/:roleId",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/role/read"
        }),
        async function (req: Request, res: Response) {
            try {
                const roleId = req?.params?.roleId?.trim();
                if (!roleId) {
                    throw new ServerError(
                        "Invalid empty role id is supplied.",
                        400
                    );
                }
                const record = await getTableRecord(
                    database.getPool(),
                    "roles",
                    roleId,
                    res.locals.authDecision
                );
                if (!record) {
                    throw new ServerError(
                        `Cannot locate role by id: ${roleId}`,
                        404
                    );
                }
                res.json(record);
            } catch (e) {
                respondWithError("GET /roles/:roleId", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Roles
     * @api {delete} /v0/auth/roles/:roleId Delete a role record
     * @apiDescription Delete a role record and any permission (not owned by other roles) belongs to it.
     * You need `authObject/role/delete` permission in order to access this API.
     *
     * @apiParam (URL Path) {string} roleId id of the role
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the deletion action is actually performed or the permission record doesn't exist.
     * @apiSuccessExample {json} 200
     *    {
     *        "result": true
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
        "/:roleId",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/role/delete",
            (req, res) => req?.params?.roleId,
            "role"
        ),
        async function (req, res) {
            try {
                await database.deleteRole(req?.params?.roleId);
                res.json({ result: true });
            } catch (e) {
                respondWithError("Delete a role" + req?.params?.roleId, res, e);
            }
        }
    );

    return router;
}
