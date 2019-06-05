import * as express from "express";
import Database from "./Database";
import { MAGDA_TENANT_ID_HEADER, MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

export interface ApiRouterOptions {
    database: Database;
    jwtSecret: string;
}

function checkAuthorization(req: express.Request): boolean {
    const sessionHeader = "X-Magda-Session";
    const jwt = req.headers[`${sessionHeader.toLowerCase()}`] ||
           req.headers[`${sessionHeader}`] ||
           req.headers[`${sessionHeader.toUpperCase()}`]

    // TODO: do this properly.
    return jwt !== undefined
}

function hasAdminPortalId(req: express.Request): boolean {
    return req.headers[`${MAGDA_TENANT_ID_HEADER.toLowerCase()}`] === MAGDA_ADMIN_PORTAL_ID.toString() ||
           req.headers[`${MAGDA_TENANT_ID_HEADER}`]               === MAGDA_ADMIN_PORTAL_ID.toString() ||
           req.headers[`${MAGDA_TENANT_ID_HEADER.toUpperCase()}`] === MAGDA_ADMIN_PORTAL_ID.toString()
}

/**
 * @apiDefine Tenant API
 */

export default function createApiRouter(options: ApiRouterOptions) {
    const database = options.database;

    const router: express.Router = express.Router();

    router.get("/tenants", function(req, res) {
        try {
            if (hasAdminPortalId(req)) {
                database.getTenants()
                .then( tenants => {
                    res.json(tenants);
                    res.status(200);
                })
            }
            else{
                res.status(400)
                res.setHeader("Content-Type", "plain/text")
                res.send("Incorrect tenant ID or unauthorised operation")
            }
        } catch (e) {
            console.error(e);
            res.status(500);
        }
    });



    router.post("/tenants", async function(req, res) {
        try {
            if (hasAdminPortalId(req)) {
                const tenantId = await database.createTenant(req.body);
                res.json(tenantId);
                res.status(201);
            }
            else{
                res.status(400)
                res.setHeader("Content-Type", "plain/text")
                res.send("Incorrect tenant ID.")
            }
        } catch (e) {
            console.error(e);
            res.status(500);
        }
        res.end();
    });

    return router;
}
