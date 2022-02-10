import express from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { requireObjectPermission } from "../recordAuthMiddlewares";
import { withAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";
import {
    searchTableRecord,
    countTableRecord
} from "magda-typescript-common/src/SQLUtils";

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
        async function (req, res) {
            try {
                const roleId = req.params.roleId;
                const conditions: SQLSyntax[] = [
                    sqls`role_permissions.role_id = ${roleId}`
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
                        joinTable: "permissions",
                        joinCondition: sqls`permissions.id = role_permissions.permission_id`,
                        selectedFields: [sqls`permissions.*`],
                        offset: req?.query?.offset as string,
                        limit: req?.query?.limit as string
                    }
                );
                res.json(records);
            } catch (e) {
                respondWithError(
                    "GET /public/role/:roleId/permissions",
                    res,
                    e
                );
            }
        }
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
        async function (req, res) {
            try {
                const roleId = req.params.roleId;
                const conditions: SQLSyntax[] = [
                    sqls`role_permissions.role_id = ${roleId}`
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
                const result = await searchTableRecord(
                    database.getPool(),
                    "role_permissions",
                    conditions,
                    {
                        joinTable: "permissions",
                        joinCondition: sqls`permissions.id = role_permissions.permission_id`,
                        selectedFields: [sqls`count(*) as total`],
                        offset: req?.query?.offset as string,
                        limit: req?.query?.limit as string
                    }
                );
                const count = result[0]["total"] ? result[0]["total"] : 0;
                res.json({ count });
            } catch (e) {
                respondWithError(
                    "GET /public/role/:roleId/permissions/count",
                    res,
                    e
                );
            }
        }
    );

    // get role records meet selection criteria
    router.get(
        "/",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/role/read"
        }),
        async function (req, res) {
            try {
                const conditions: SQLSyntax[] = [];
                if (req.query?.keyword) {
                    const keyword = "%" + req.query?.keyword + "%";
                    conditions.push(
                        SQLSyntax.joinWithOr(
                            roleKeywordSearchFields.map(
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
                if (req.query?.owner_id) {
                    conditions.push(sqls`"owner_id" = ${req.query.owner_id}`);
                }
                if (req.query?.create_by) {
                    conditions.push(sqls`"create_by" = ${req.query.create_by}`);
                }
                if (req.query?.edit_by) {
                    conditions.push(sqls`"edit_by" = ${req.query.edit_by}`);
                }
                const records = await searchTableRecord(
                    database.getPool(),
                    "roles",
                    conditions,
                    {
                        authDecision: res.locals.authDecision,
                        offset: req?.query?.offset as string,
                        limit: req?.query?.limit as string
                    }
                );
                res.json(records);
            } catch (e) {
                respondWithError("GET roles", res, e);
            }
        }
    );

    // get records count
    router.get(
        "/count",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/user/read"
        }),
        async function (req, res) {
            try {
                const conditions: SQLSyntax[] = [];
                if (req.query?.keyword) {
                    const keyword = "%" + req.query?.keyword + "%";
                    conditions.push(
                        SQLSyntax.joinWithOr(
                            roleKeywordSearchFields.map(
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
                if (req.query?.owner_id) {
                    conditions.push(sqls`"owner_id" = ${req.query.owner_id}`);
                }
                if (req.query?.create_by) {
                    conditions.push(sqls`"create_by" = ${req.query.create_by}`);
                }
                if (req.query?.edit_by) {
                    conditions.push(sqls`"edit_by" = ${req.query.edit_by}`);
                }
                const number = await countTableRecord(
                    database.getPool(),
                    "users",
                    conditions,
                    res.locals.authDecision
                );
                res.json({ count: number });
            } catch (e) {
                respondWithError("GET users count", res, e);
            }
        }
    );

    return router;
}
