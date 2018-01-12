import * as express from "express";
import { Router } from "express";
import * as _ from "lodash";
const httpProxy = require("http-proxy");

import buildJwt from "@magda/typescript-common/dist/session/buildJwt";

import Authenticator from "./Authenticator";

export interface ProxyTarget {
    to: string;
    methods?: string[];
    auth?: boolean;
}

export interface ApiRouterOptions {
    authenticator: Authenticator;
    jwtSecret: string;
    routes: {
        [localRoute: string]: ProxyTarget;
    };
}

export default function createApiRouter(options: ApiRouterOptions): Router {
    var proxy = httpProxy.createProxyServer({ prependUrl: false });

    const authenticator = options.authenticator;
    const jwtSecret = options.jwtSecret;

    const router: Router = express.Router();

    proxy.on("proxyReq", function(
        proxyReq: any,
        req: any,
        res: Response,
        options: any
    ) {
        if (jwtSecret && req.user) {
            proxyReq.setHeader(
                "X-Magda-Session",
                buildJwt(jwtSecret, req.user.id)
            );
        }
    });

    proxy.on("error", function(err: any, req: any, res: any) {
        res.writeHead(500, {
            "Content-Type": "text/plain"
        });

        console.error(err);

        res.end("Something went wrong.");
    });

    function proxyRoute(
        baseRoute: string,
        target: string,
        verbs: string[] = ["all"],
        auth = false
    ) {
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

        router.use(baseRoute, routeRouter);

        return routeRouter;
    }

    _.forEach(options.routes, (value: ProxyTarget, key: string) => {
        proxyRoute(`/${key}`, value.to, value.methods, !!value.auth);
    });

    return router;
}
