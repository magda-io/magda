import * as express from "express";
const httpProxy = require('http-proxy');
const jwt = require('jsonwebtoken');
const config = require("config");
const cors = require('cors')

import setupAuth from './setup-auth';

var proxy = httpProxy.createProxyServer({ prependUrl: false });

const router = express.Router();

proxy.on('proxyReq', function (proxyReq: any, req: any, res: Response, options: any) {
    if (req.user) {
        const token = jwt.sign({ userId: req.user }, process.env.JWT_SECRET)
        proxyReq.setHeader('X-Magda-Session', token);
    }
});

const configuredCors = cors({
    origin: true,
    credentials: true
});

router.use(configuredCors);

router.options("*", configuredCors);

function proxyRoute(baseRoute: string, target: string, verbs: string[] = ['all'], auth = false) {
    const routeRouter: any = express.Router();

    if (auth) {
        setupAuth(routeRouter);
    }

    verbs.forEach((verb: string) =>
        routeRouter[verb.toLowerCase()]("*", (req: express.Request, res: express.Response) => {
            proxy.web(req, res, { target });
        })
    );

    router.use(baseRoute, routeRouter);

    return routeRouter;
}

proxyRoute('/search', config.get("targets.search"));
proxyRoute('/registry', config.get("targets.registry"), undefined, true);
proxyRoute('/auth', config.get("targets.auth"), ['get'], true);
proxyRoute('/discussions', config.get("targets.discussions"), undefined, true);

export default router;