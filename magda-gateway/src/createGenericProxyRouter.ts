import express from "express";
import { Router } from "express";
import urijs from "urijs";
import escapeStringRegexp from "escape-string-regexp";
import createBaseProxy from "./createBaseProxy";
import Authenticator from "./Authenticator";
import { TenantMode } from "./setupTenantMode";
import buildJwtFromReq from "magda-typescript-common/src/session/buildJwtFromReq";
import createApiAccessControlMiddleware from "./createApiAccessControlMiddleware";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";

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
    accessControl?: boolean;
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
    proxyTimeout?: number;
    authClient: AuthDecisionQueryClient;
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
    const authClient = options.authClient;

    const router: Router = express.Router();

    proxy.on("proxyReq", (proxyReq, req: any, _res, _options) => {
        if (jwtSecret && req.user) {
            proxyReq.setHeader(
                "X-Magda-Session",
                buildJwtFromReq(req, jwtSecret)
            );
        }
    });

    function proxyRoute(
        baseRoute: string,
        target: string,
        verbs: ProxyMethodType[] = ["all"],
        auth = false,
        redirectTrailingSlash = false,
        accessControl = false
    ) {
        console.log(
            "PROXY",
            baseRoute,
            target,
            verbs,
            "auth:",
            auth,
            "accessControl: ",
            accessControl,
            "redirectTrailingSlash: ",
            redirectTrailingSlash
        );
        const routeRouter: any = express.Router();

        if (authenticator && (auth || accessControl)) {
            authenticator.applyToRoute(routeRouter);
        }

        verbs.forEach((verb: ProxyMethodType) => {
            if (typeof verb === "string") {
                routeRouter[verb.toLowerCase()](
                    "*",
                    createApiAccessControlMiddleware(
                        authClient,
                        baseRoute,
                        jwtSecret,
                        accessControl
                    ),
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
                    createApiAccessControlMiddleware(
                        authClient,
                        baseRoute,
                        jwtSecret,
                        accessControl
                    ),
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

    Object.keys(options.routes)
        .sort((a, b) => {
            // make sure route path has more path segment items will be installed first (i.e. higher priority when takes up requests)
            const segmentLenA = urijs(a).segment().length;
            const segmentLenB = urijs(b).segment().length;
            if (segmentLenA < segmentLenB) {
                return 1;
            } else if (segmentLenA > segmentLenB) {
                return -1;
            } else if (a < b) {
                return -1;
            } else if (a > b) {
                return 1;
            } else {
                return 0;
            }
        })
        .map((key: string) => {
            const value: ProxyTarget = options.routes[key];
            const target =
                typeof value === "string"
                    ? getDefaultProxyTargetDefinition(value)
                    : value;

            const path = !key ? "/" : key[0] === "/" ? key : `/${key}`;

            proxyRoute(
                path,
                target.to,
                target.methods,
                !!target?.auth,
                target.redirectTrailingSlash,
                !!target?.accessControl
            );
        });

    return router;
}
