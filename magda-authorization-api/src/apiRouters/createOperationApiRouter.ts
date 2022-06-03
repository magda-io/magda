import express from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { withAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import {
    requireObjectPermission,
    requireObjectUpdatePermission
} from "../recordAuthMiddlewares";
import {
    getTableRecord,
    updateTableRecord,
    deleteTableRecord
} from "magda-typescript-common/src/SQLUtils";
import ServerError from "magda-typescript-common/src/ServerError";
import { sqls } from "sql-syntax";

export interface ApiRouterOptions {
    database: Database;
    authDecisionClient: AuthDecisionQueryClient;
}

export default function createOperationApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    // get operation by URI
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

    // get operation by id
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

    // modify operation by ID
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

    // delete by ID
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
                res.json(true);
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
