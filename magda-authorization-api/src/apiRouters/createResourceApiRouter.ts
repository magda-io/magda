import express from "express";
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
    searchTableRecord,
    countTableRecord
} from "magda-typescript-common/src/SQLUtils";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";

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

    // get record by id
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

    // get records meet selection criteria
    router.get(
        "/",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/resource/read"
        }),
        async function (req, res) {
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
                if (req.query?.uri) {
                    conditions.push(sqls`"uri" = ${req.query.uri}`);
                }
                const records = await searchTableRecord(
                    database.getPool(),
                    "resources",
                    conditions,
                    res.locals.authDecision
                );
                res.json(records);
            } catch (e) {
                respondWithError("GET resources", res, e);
            }
        }
    );

    // get records count
    router.get(
        "/count",
        withAuthDecision(authDecisionClient, {
            operationUri: "authObject/resource/read"
        }),
        async function (req, res) {
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
                if (req.query?.uri) {
                    conditions.push(sqls`"uri" = ${req.query.uri}`);
                }
                const records = await countTableRecord(
                    database.getPool(),
                    "resources",
                    conditions,
                    res.locals.authDecision
                );
                res.json(records);
            } catch (e) {
                respondWithError("GET resources", res, e);
            }
        }
    );

    // create record
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
                    req.body
                );
                res.json(record);
            } catch (e) {
                respondWithError("create `resource`", res, e);
            }
        }
    );

    // modify record by ID
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
                    req.body
                );
                res.json(record);
            } catch (e) {
                respondWithError("modify `resource`", res, e);
            }
        }
    );

    // delete by ID
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
                res.json(true);
            } catch (e) {
                respondWithError(
                    `delete \`resource\` ${req.params.id}`,
                    res,
                    e
                );
            }
        }
    );

    // create an operation for the resource
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
                    { ...req.body, resource_id: req.params.resId }
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

    // get operations of a resource
    router.get(
        "/:resId/operations",
        // when user has the permission to access the resource
        // we should let him to access all operations of the resources
        // thus, we only request read permission to the resource only
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/resource/read",
            (req, res) => req.params.id,
            "resource"
        ),
        async function (req, res) {
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
                if (req.query?.uri) {
                    conditions.push(sqls`"uri" = ${req.query.uri}`);
                }
                // when user has the permission to access the resource
                // we should let him to access all operations of the resources
                const records = await searchTableRecord(
                    database.getPool(),
                    "operations",
                    conditions
                );
                res.json(records);
            } catch (e) {
                respondWithError(
                    "GET operations of resource: " + req.params.resId,
                    res,
                    e
                );
            }
        }
    );

    // get operation count of a resource
    router.get(
        "/:resId/operations/count",
        // when user has the permission to access the resource
        // we should let him to access all operations of the resources
        // thus, we only request read permission to the resource only
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/resource/read",
            (req, res) => req.params.id,
            "resource"
        ),
        async function (req, res) {
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
                if (req.query?.uri) {
                    conditions.push(sqls`"uri" = ${req.query.uri}`);
                }
                const number = await countTableRecord(
                    database.getPool(),
                    "operations",
                    conditions
                );
                res.json(number);
            } catch (e) {
                respondWithError(
                    "GET operations count of resource: " + req.params.resId,
                    res,
                    e
                );
            }
        }
    );

    return router;
}
