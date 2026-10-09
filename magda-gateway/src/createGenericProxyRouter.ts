import express from "express";
import { Router } from "express";
import urijs from "urijs";
import escapeStringRegexp from "escape-string-regexp";
import createBaseProxy from "./createBaseProxy.js";
import Authenticator from "./Authenticator.js";
import { TenantMode } from "./setupTenantMode.js";
import buildJwtFromReq from "magda-typescript-common/src/session/buildJwtFromReq.js";
import createApiAccessControlMiddleware from "./createApiAccessControlMiddleware.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import {
    getWebSocketUpgradeContext,
    claimWebSocketUpgrade
} from "./WebSocketUpgradeHandler.js";
import {
    parseRequestOrigin,
    resolveWebSocketAllowedOrigins
} from "./webSocketOrigin.js";

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
    // whether WebSocket upgrade requests (GET only) are forwarded to the target. Default: `false`.
    websocket?: boolean;
    // Origins allowed to open a WebSocket on this route (WebSocket upgrades only).
    // Omitted: the origin of the gateway's `externalUrl`. `[]`: no Origin validation.
    websocketAllowedOrigins?: string[];
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
    // seconds the upstream of a `websocket: true` route has to answer a WebSocket handshake
    websocketHandshakeTimeout?: number;
    // the gateway's external URL; its origin is the default WebSocket allowed origin
    externalUrl?: string;
    authClient: AuthDecisionQueryClient;
}

/**
 * Reject WebSocket upgrades whose `Origin` isn't in the route's allowlist (`undefined` = no
 * validation). Browsers don't apply CORS to WebSocket handshakes, so a page on any site could
 * otherwise open an authenticated WebSocket with the user's cookies. Ordinary HTTP requests
 * are not affected.
 */
function createWebSocketOriginMiddleware(
    baseRoute: string,
    allowedOrigins: string[] | undefined
): express.RequestHandler {
    return (req, res, next) => {
        if (!allowedOrigins || !getWebSocketUpgradeContext(req)) {
            return next();
        }
        const origin = parseRequestOrigin(req.headers);
        if (origin && allowedOrigins.includes(origin)) {
            return next();
        }
        console.warn(
            `Rejected WebSocket upgrade on route ${baseRoute}: Origin ${JSON.stringify(
                String(req.headers.origin ?? "").slice(0, 200)
            )} is not allowed.`
        );
        res.status(403).send("WebSocket Origin not allowed.");
    };
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
        statusCheck: false,
        websocket: false
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

    // the upstream of a WebSocket route receives the session of the handshake request
    proxy.on("proxyReqWs", (proxyReq, req: any) => {
        if (jwtSecret && req.user) {
            proxyReq.setHeader(
                "X-Magda-Session",
                buildJwtFromReq(req, jwtSecret)
            );
        }
    });

    function forward(
        req: express.Request,
        res: express.Response,
        target: string,
        websocket: boolean
    ) {
        if (!getWebSocketUpgradeContext(req)) {
            proxy.web(req, res, { target });
        } else if (websocket && req.method === "GET") {
            const { socket, head } = claimWebSocketUpgrade(req, res);
            proxy.ws(req, socket, head, { target });
        } else {
            res.status(400).send(
                "WebSocket upgrade is not supported by this route."
            );
        }
    }

    function proxyRoute(
        baseRoute: string,
        target: string,
        verbs: ProxyMethodType[] = ["all"],
        auth = false,
        redirectTrailingSlash = false,
        accessControl = false,
        websocket = false,
        websocketAllowedOrigins: string[] | undefined = undefined
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
            redirectTrailingSlash,
            "websocket: ",
            websocket,
            ...(websocket
                ? [
                      "websocketAllowedOrigins: ",
                      websocketAllowedOrigins ?? "(no Origin validation)"
                  ]
                : [])
        );
        const routeRouter: any = express.Router();

        if (authenticator && (auth || accessControl)) {
            authenticator.applyToRoute(routeRouter);
        }

        // after the authentication middleware above, before access control & forwarding
        const originMiddleware = createWebSocketOriginMiddleware(
            baseRoute,
            websocket ? websocketAllowedOrigins : undefined
        );

        verbs.forEach((verb: ProxyMethodType) => {
            if (typeof verb === "string") {
                routeRouter[verb.toLowerCase()](
                    "*",
                    originMiddleware,
                    createApiAccessControlMiddleware(
                        authClient,
                        baseRoute,
                        jwtSecret,
                        accessControl
                    ),
                    (req: express.Request, res: express.Response) =>
                        forward(req, res, target, websocket)
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
                    originMiddleware,
                    createApiAccessControlMiddleware(
                        authClient,
                        baseRoute,
                        jwtSecret,
                        accessControl
                    ),
                    (req: express.Request, res: express.Response) =>
                        forward(req, res, runtimeTarget, websocket)
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

            // Resolved once per route; malformed configuration fails here. The `externalUrl`
            // default only applies to WebSocket routes, but an explicit list is always validated.
            const websocketAllowedOrigins =
                target?.websocket ||
                target?.websocketAllowedOrigins !== undefined
                    ? resolveWebSocketAllowedOrigins(
                          target?.websocketAllowedOrigins,
                          target?.websocket ? options.externalUrl : undefined,
                          key
                      )
                    : undefined;

            proxyRoute(
                path,
                target.to,
                target.methods,
                !!target?.auth,
                target.redirectTrailingSlash,
                !!target?.accessControl,
                !!target?.websocket,
                websocketAllowedOrigins
            );
        });

    return router;
}
