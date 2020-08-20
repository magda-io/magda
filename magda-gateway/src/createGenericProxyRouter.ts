import express from "express";
import { Router } from "express";
import _ from "lodash";
import escapeStringRegexp from "escape-string-regexp";

import buildJwt from "magda-typescript-common/src/session/buildJwt";

import createBaseProxy from "./createBaseProxy";
import Authenticator from "./Authenticator";
import { TenantMode } from "./setupTenantMode";
import { MagdaUser } from "magda-typescript-common/src/authorization-api/model";

declare global {
    namespace Express {
        interface User extends MagdaUser {}
    }
}

export type ProxyTarget = DetailedProxyTarget | string;
interface DetailedProxyTarget {
    to: string;
    methods?: string[];
    auth?: boolean;
    redirectTrailingSlash?: boolean;
    statusCheck?: boolean;
}

export interface GenericProxyRouterOptions {
    authenticator: Authenticator;
    jwtSecret: string;
    routes: {
        [localRoute: string]: ProxyTarget;
    };
    tenantMode: TenantMode;
    defaultCacheControl?: string;
}

/**
 * Allow simply form of route target definition. E.g.
 * webRoutes:
 *   xxx1: http://xxx
 *   xxx2: http://xxxxxxx
 *
 * Router will assume it's a router that is:
 * - GET only
 * - no auth (i.e. don't need session)
 * - don't need statusCheck
 *
 * @export
 * @param {string} targetUrl
 * @returns {DetailedProxyTarget}
 */
export function getDefaultProxyTargetDefinition(
    targetUrl: string
): DetailedProxyTarget {
    return {
        to: targetUrl,
        methods: ["get"],
        auth: false,
        redirectTrailingSlash: false,
        statusCheck: false
    };
}

export default function createGenericProxyRouter(
    options: GenericProxyRouterOptions
): Router {
    const proxy = createBaseProxy(options);

    const authenticator = options.authenticator;
    const jwtSecret = options.jwtSecret;

    const router: Router = express.Router();

    proxy.on("proxyReq", (proxyReq, req: any, _res, _options) => {
        if (jwtSecret && req.user) {
            proxyReq.setHeader(
                "X-Magda-Session",
                buildJwt(jwtSecret, req.user.id, { session: req.user.session })
            );
        }
    });

    function proxyRoute(
        baseRoute: string,
        target: string,
        verbs: string[] = ["all"],
        auth = false,
        redirectTrailingSlash = false
    ) {
        console.log("PROXY", baseRoute, target, verbs);
        const routeRouter: any = express.Router();

        if (authenticator && auth) {
            authenticator.applyToRoute(routeRouter);
        }

        verbs.forEach((verb: string) =>
            routeRouter[verb.toLowerCase()](
                "*",
                (req: express.Request, res: express.Response) => {
                    proxy.web(req, res, { target });
                }
            )
        );

        if (redirectTrailingSlash) {
            // --- has to use RegEx as `req.originalUrl` will match both with & without trailing /
            const re = new RegExp(`^${escapeStringRegexp(baseRoute)}$`);
            router.get(re, function (req, res) {
                res.redirect(`${req.originalUrl}/`);
            });
        }

        router.use(baseRoute, routeRouter);

        return routeRouter;
    }

    _.forEach(options.routes, (value: ProxyTarget, key: string) => {
        const target =
            typeof value === "string"
                ? getDefaultProxyTargetDefinition(value)
                : value;

        // --- skip tenant api router if multiTenantsMode is off
        if (key === "tenant" && !options.tenantMode.multiTenantsMode) {
            return;
        }
        proxyRoute(
            `/${key}`,
            target.to,
            target.methods,
            !!target.auth,
            target.redirectTrailingSlash
        );
    });

    return router;
}
