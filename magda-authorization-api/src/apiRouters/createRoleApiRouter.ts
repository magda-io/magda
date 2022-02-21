import express, { Request, Response } from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { requireObjectPermission } from "../recordAuthMiddlewares";
import {
    withAuthDecision,
    getUserId
} from "magda-typescript-common/src/authorization-api/authMiddleware";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";
import {
    searchTableRecord,
    createTableRecord,
    getTableRecord,
    updateTableRecord
} from "magda-typescript-common/src/SQLUtils";
import { uniq } from "lodash";
import ServerError from "magda-typescript-common/src/ServerError";
import e from "express";

export interface ApiRouterOptions {
    database: Database;
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
     * @apiGroup Auth
     * @api {get} /v0/auth/roles/:roleId/permissions Get all permissions of a role
     * @apiDescription return a list permissions of a role.
     * Required admin access.
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

    // get role permissions count
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

    // create an new permission and add to the role
    router.post(
        "/:roleId/permissions",
        getUserId,
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
                    throw new Error(
                        "Failed to create permission: operationIds is required and should be a list of operation ids."
                    );
                }

                operationIds = uniq(operationIds);

                if (!permissionData.resource_id) {
                    throw new Error(
                        "Failed to create permission: resource_id is required."
                    );
                }

                const resource = await getTableRecord(
                    pool,
                    "resources",
                    permissionData.resource_id
                );
                if (!resource) {
                    throw new Error(
                        "Failed to create permission: cannot locate resource by supplied resource_id."
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
                    throw new Error(
                        `Failed to create permission: all provided operation id must be valid and belong to the resource ${resource.id}`
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
                        "permission",
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
                        ...sqls`INSERT INTO role_permission_operation (role_id, permission_id) VALUES (${roleId}, ${permissionRecord.id})`.toQuery()
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

    // update a permission
    router.put(
        "/:roleId/permissions/:permissionId",
        getUserId,
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
                        "Failed to update permission: specified role doesn't contain the sepcified permission"
                    );
                }

                const permission = await getTableRecord(
                    pool,
                    "permissions",
                    permissionId
                );
                if (!permission) {
                    throw new Error(
                        "Failed to update permission: cannot locate the permission record sepcified by permissionId: " +
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
                        "permission",
                        permissionId,
                        permissionUpdateData,
                        [
                            "name",
                            "resource_id",
                            "user_ownership_constraint",
                            "org_unit_ownership_constraint",
                            "pre_authorised_constraint",
                            "description",
                            "create_by",
                            "owner_id",
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

    //delete a permission from the role
    // if the permission has not assigned to other roles, the permission will be deleted as well
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
                const roleId = req?.params?.roleId;
                const permissionId = req?.params?.permissionId;
                if (!roleId?.trim()) {
                    throw new Error("Invalid empty role id supplied.");
                }
                if (!permissionId?.trim()) {
                    throw new Error("Invalid empty permission id supplied.");
                }

                const pool = database.getPool();
                const role = await getTableRecord(pool, "roles", roleId);
                if (!role) {
                    throw new Error(
                        "Cannot locate role record by ID: " + roleId
                    );
                }
                const permission = await getTableRecord(
                    pool,
                    "permission",
                    roleId
                );
                if (!permission) {
                    throw new Error(
                        "Cannot locate permission record by ID: " + permissionId
                    );
                }
                const result = await pool.query(
                    ...sqls`SELECT id FROM role_permissions WHERE role_id != ${roleId} AND permission_id = ${permissionId}`.toQuery()
                );
                await pool.query(
                    ...sqls`DELETE FROM role_permissions WHERE role_id = ${roleId} AND permission_id = ${permissionId} LIMIT 1`.toQuery()
                );
                if (!result?.rows?.length) {
                    // the permission has not assigned to other roles
                    // we will delete the permission record as well
                    const client = await pool.connect();
                    try {
                        await client.query("BEGIN");

                        await client.query(
                            ...sqls`DELETE FROM permission_operations WHERE permission_id = ${permissionId}`.toQuery()
                        );
                        await client.query(
                            ...sqls`DELETE FROM permissions WHERE id = ${permissionId} LIMIT 1`.toQuery()
                        );

                        await client.query("COMMIT");
                    } catch (e) {
                        await client.query("ROLLBACK");
                        throw e;
                    } finally {
                        client.release();
                    }
                }
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

    // get role records meet selection criteria
    router.get(
        "/",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/role/read"
        }),
        createFetchRolesHandler(false, "GET roles")
    );

    // get records count
    router.get(
        "/count",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/role/read"
        }),
        createFetchRolesHandler(true, "GET role records count")
    );

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

    return router;
}
