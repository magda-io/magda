import express from "express";
import Database from "./Database.js";
import {
    MAGDA_TENANT_ID_HEADER,
    MAGDA_ADMIN_PORTAL_ID
} from "magda-typescript-common/src/registry/TenantConsts.js";
import { requireUnconditionalAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware.js";
import {
    installStatusRouter,
    createServiceProbe
} from "magda-typescript-common/src/express/status.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import ServerError from "magda-typescript-common/src/ServerError.js";
import handleServerError from "magda-typescript-common/src/handleServerError.js";
import { DatabaseError } from "pg-protocol";

export interface ApiRouterOptions {
    database: Database;
    jwtSecret: string;
    authApiUrl: string;
    authDecisionClient: AuthDecisionQueryClient;
}

function hasAdminPortalId(req: express.Request): boolean {
    return (
        req.headers[`${MAGDA_TENANT_ID_HEADER.toLowerCase()}`] ===
            MAGDA_ADMIN_PORTAL_ID.toString() ||
        req.headers[`${MAGDA_TENANT_ID_HEADER}`] ===
            MAGDA_ADMIN_PORTAL_ID.toString() ||
        req.headers[`${MAGDA_TENANT_ID_HEADER.toUpperCase()}`] ===
            MAGDA_ADMIN_PORTAL_ID.toString()
    );
}

/**
 * @apiDefine Tenant API
 */

export default function createApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;

    const router: express.Router = express.Router();

    const status = {
        probes: {
            auth: createServiceProbe(options.authApiUrl)
        }
    };

    installStatusRouter(router, status);

    /**
     * @apiGroup Tenants
     * @api {get} /v0/tenant/tenants Get the list of all tenants
     * @apiDescription Get the list of all tenants
     * You need have `object/tenant/read` permission to access this API.
     * > Please note: multi-tenancy are still an experimental feature. API might changes largely over the time.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *       "domainname": "example.com",
     *       "id": "6",
     *       "enabled": true
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
        "/tenants",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/tenant/read"
        }),
        function (req, res) {
            try {
                if (hasAdminPortalId(req)) {
                    database.getTenants().then((tenants) => {
                        res.json(tenants);
                        res.status(200);
                    });
                } else {
                    res.status(400);
                    res.setHeader("Content-Type", "plain/text");
                    res.send("Incorrect tenant ID");
                }
            } catch (e) {
                handleServerError(req, res, e);
            }
        }
    );

    /**
     * @apiGroup Tenants
     * @api {post} /v0/tenant/tenants Create a new tenant
     * @apiDescription Create a new tenant
     * You need have `object/tenant/create` permission to access this API.
     * > Please note: multi-tenancy are still an experimental feature. API might changes largely over the time.
     *
     * @apiParam (Body) {string} domainname the domain name serves the tenant.
     * @apiParam (Body) {boolean} [enabled] Default to `true`.
     *
     * @apiParamExample (Body) {json}:
     *     {
     *       "domainname": "example.com"
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "domainname": "example.com",
     *       "id": "6",
     *       "enabled": true
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
        "/tenants",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/tenant/create"
        }),
        async function (req, res) {
            try {
                if (!req?.body?.domainname) {
                    throw new ServerError(
                        "`domainname` field is required",
                        400
                    );
                }
                if (hasAdminPortalId(req)) {
                    const tenantId = await database.createTenant({
                        domainname: req.body.domainname,
                        enabled:
                            typeof req?.body?.enabled === "boolean"
                                ? req.body.enabled
                                : true
                    });
                    res.json(tenantId);
                    res.status(201);
                } else {
                    res.status(400);
                    res.setHeader("Content-Type", "plain/text");
                    res.send("Incorrect tenant ID.");
                }
            } catch (e) {
                if (e instanceof DatabaseError && e.code === "23505") {
                    handleServerError(
                        req,
                        res,
                        new ServerError(
                            "Cannot create a new tenant for an existing domain",
                            400
                        )
                    );
                } else {
                    handleServerError(req, res, e);
                }
            }
        }
    );

    return router;
}
