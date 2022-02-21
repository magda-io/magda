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

export default function createPermissionApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    // get permission by id
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
                const record = await getTableRecord(
                    database.getPool(),
                    "permissions",
                    req.params.id,
                    res.locals.authDecision
                );
                if (!record) {
                    throw new ServerError(
                        `Cannot locate permission by id: ${permissionId}`
                    );
                }
                res.json(record);
            } catch (e) {
                respondWithError("GET permission by ID", res, e);
            }
        }
    );

    return router;
}
