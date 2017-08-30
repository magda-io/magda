import * as express from "express";
import { Router } from "express";
const httpProxy = require("http-proxy");
const jwt = require("jsonwebtoken");

import Authenticator from "./Authenticator";

export interface ApiRouterOptions {
    authenticator: Authenticator,
    jwtSecret: string,
    searchApi: string,
    registryApi: string,
    authenticationApi: string,
    discussionApi: string
}

export default function createApiRouter(options: ApiRouterOptions): Router {
    var proxy = httpProxy.createProxyServer({ prependUrl: false });

    const authenticator = options.authenticator;
    const jwtSecret = options.jwtSecret;

    const router: Router = express.Router();

    proxy.on("proxyReq", function (
        proxyReq: any,
        req: any,
        res: Response,
        options: any
    ) {
        if (jwtSecret && req.user) {
            const token = jwt.sign({ userId: req.user.id, isAdmin: req.user.isAdmin }, jwtSecret);
            proxyReq.setHeader("X-Magda-Session", token);
        }
    });

    proxy.on("error", function (err: any, req: any, res: any) {
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
            routeRouter[
                verb.toLowerCase()
            ]("*", (req: express.Request, res: express.Response) => {
                proxy.web(req, res, { target });
            })
        );

        router.use(baseRoute, routeRouter);

        return routeRouter;
    }

    proxyRoute("/search", options.searchApi);
    proxyRoute("/registry", options.registryApi, ["get"], true);
    proxyRoute("/auth", options.authenticationApi, ["get"], true);
    proxyRoute("/discussions", options.discussionApi, undefined, true);

    return router;
}
