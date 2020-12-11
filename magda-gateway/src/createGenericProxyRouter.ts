import express from "express";
import { Router } from "express";
import _ from "lodash";
import escapeStringRegexp from "escape-string-regexp";

import buildJwt from "magda-typescript-common/src/session/buildJwt";

import createBaseProxy from "./createBaseProxy";
import Authenticator from "./Authenticator";
import { TenantMode } from "./setupTenantMode";

export type ProxyTarget = DetailedProxyTarget | string;
export type MethodWithProxyTaget = {
    method: string;
    target?: string;
};
export type ProxyMethodType = string | MethodWithProxyTaget;
export interface DetailedProxyTarget {
    to: string;
    methods?: ProxyMethodType[];
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
        verbs: ProxyMethodType[] = ["all"],
        auth = false,
        redirectTrailingSlash = false
    ) {
        console.log("PROXY", baseRoute, target, verbs);
        const routeRouter: any = express.Router();

        if (authenticator && auth) {
            authenticator.applyToRoute(routeRouter);
        }

        verbs.forEach((verb: ProxyMethodType) => {
            if (typeof verb === "string") {
                routeRouter[verb.toLowerCase()](
                    "*",
                    (req: express.Request, res: express.Response) => {
                        proxy.web(req, res, { target });
                    }
                );
            } else {
                const method: string = verb.method.toLowerCase();
                if (!method) {
                    throw new Error(
                        "Invalid non-string proxy target method type"
                    );
                }
                const runtimeTarget =
                    typeof verb?.target === "string" ? verb.target : target;
                routeRouter[method](
                    "*",
                    (req: express.Request, res: express.Response) => {
                        proxy.web(req, res, { target: runtimeTarget });
                    }
                );
            }
        });

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

        const path = !key ? "/" : key[0] === "/" ? key : `/${key}`;

        proxyRoute(
            path,
            target.to,
            target.methods,
            !!target.auth,
            target.redirectTrailingSlash
        );
    });

    return router;
}
