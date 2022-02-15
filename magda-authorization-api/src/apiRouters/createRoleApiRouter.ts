import express, { Request, Response } from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { requireObjectPermission } from "../recordAuthMiddlewares";
import { withAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";
import {
    searchTableRecord,
    createTableRecord,
    getTableRecord
} from "magda-typescript-common/src/SQLUtils";
import { uniq } from "lodash";

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
                    sqls`role_permissions.role_id = ${roleId}`,
                    sqls`permissions.id IS NOT NULL`
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
                    conditions.push(sqls`"permissions.id" = ${req.query.id}`);
                }
                if (req.query?.owner_id) {
                    conditions.push(
                        sqls`"permissions.owner_id" = ${req.query.owner_id}`
                    );
                }
                if (req.query?.create_by) {
                    conditions.push(
                        sqls`"permissions.create_by" = ${req.query.create_by}`
                    );
                }
                if (req.query?.edit_by) {
                    conditions.push(
                        sqls`"permissions.edit_by" = ${req.query.edit_by}`
                    );
                }
                const records = await searchTableRecord(
                    database.getPool(),
                    "role_permissions",
                    conditions,
                    {
                        leftJoins: [
                            {
                                table: "permissions",
                                joinCondition: sqls`permissions.id = role_permissions.permission_id`
                            }
                        ],
                        selectedFields: [
                            returnCount
                                ? sqls`COUNT(*) as count`
                                : sqls`permissions.*`
                        ],
                        offset: req?.query?.offset as string,
                        limit: req?.query?.limit as string
                    }
                );
                if (returnCount) {
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

                    permissionRecord = await createTableRecord(
                        client,
                        "permission",
                        permissionData,
                        [
                            "name",
                            "resource_id",
                            "user_ownership_constraint",
                            "org_unit_ownership_constraint",
                            "pre_authorised_constraint",
                            "description"
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
                const conditions: SQLSyntax[] = [
                    sqls`user_roles.id IS NOT NULL`
                ];
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
                    conditions.push(sqls`"role.id" = ${req.query.id}`);
                }
                if (req.query?.owner_id) {
                    conditions.push(
                        sqls`"role.owner_id" = ${req.query.owner_id}`
                    );
                }
                if (req.query?.create_by) {
                    conditions.push(
                        sqls`"role.create_by" = ${req.query.create_by}`
                    );
                }
                if (req.query?.edit_by) {
                    conditions.push(
                        sqls`"role.edit_by" = ${req.query.edit_by}`
                    );
                }
                if (req.query?.used_id) {
                    conditions.push(
                        sqls`"user_roles.user_id" = ${req.query.used_id}`
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
                            ? [sqls`COUNT(*) as count`]
                            : [sqls`roles.*`],
                        authDecision: res.locals.authDecision,
                        offset: req?.query?.offset as string,
                        limit: req?.query?.limit as string
                    }
                );
                if (returnCount) {
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
            operationUri: "authObject/user/read"
        }),
        createFetchRolesHandler(false, "GET role records count")
    );

    return router;
}
