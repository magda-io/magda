import express from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { withAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import { searchTableRecord } from "magda-typescript-common/src/SQLUtils";
import ServerError from "magda-typescript-common/src/ServerError";
import { sqls } from "sql-syntax";

export interface ApiRouterOptions {
    database: Database;
    authDecisionClient: AuthDecisionQueryClient;
}

export default function createPermissionApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    /**
     * @apiGroup Auth
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

    return router;
}
