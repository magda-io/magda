import express from "express";
import Database from "./Database";
import {
    MAGDA_TENANT_ID_HEADER,
    MAGDA_ADMIN_PORTAL_ID
} from "magda-typescript-common/src/registry/TenantConsts";
import { requireUnconditionalAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import {
    installStatusRouter,
    createServiceProbe
} from "magda-typescript-common/src/express/status";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";

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
                console.error(e);
                res.status(500);
            }
        }
    );

    router.post(
        "/tenants",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/tenant/create"
        }),
        async function (req, res) {
            try {
                if (hasAdminPortalId(req)) {
                    const tenantId = await database.createTenant(req.body);
                    res.json(tenantId);
                    res.status(201);
                } else {
                    res.status(400);
                    res.setHeader("Content-Type", "plain/text");
                    res.send("Incorrect tenant ID.");
                }
            } catch (e) {
                console.error(e);
                res.status(500);
            }
            res.end();
        }
    );

    return router;
}
