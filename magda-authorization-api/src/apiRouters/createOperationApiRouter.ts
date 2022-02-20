import express from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { withAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import { getTableRecord } from "magda-typescript-common/src/SQLUtils";

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
            operationUri: "authObject/opreation/read"
        }),
        async function (req, res) {
            try {
                const record = await getTableRecord(
                    database.getPool(),
                    "operations",
                    req.params.id,
                    res.locals.authDecision
                );
                if (!record) {
                    res.status(404).send(
                        `Cannot locate operation by id: ${req.params.id}`
                    );
                } else {
                    res.json(record);
                }
            } catch (e) {
                respondWithError("GET operation by ID", res, e);
            }
        }
    );

    return router;
}
