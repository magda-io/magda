import express from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { withAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import { getTableRecord } from "magda-typescript-common/src/SQLUtils";
import ServerError from "magda-typescript-common/src/ServerError";

export interface ApiRouterOptions {
    database: Database;
    authDecisionClient: AuthDecisionQueryClient;
}

export default function createOperationApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

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

    return router;
}
