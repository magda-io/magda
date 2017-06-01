import * as express from "express";
const httpProxy = require('http-proxy');
const jwt = require('jsonwebtoken');
const config = require("config");
const cors = require('cors')

var proxy = httpProxy.createProxyServer({ prependUrl: false });

const router = express.Router();

proxy.on('proxyReq', function (proxyReq: any, req: any, res: Response, options: any) {
    if (req.user) {
        const token = jwt.sign({ userId: req.user }, process.env.JWT_SECRET)
        proxyReq.setHeader('X-Magda-Session', token);
    }
});

const configuredCors = cors({
    origin: true
});

router.use(configuredCors);

router.options("*", configuredCors);

function proxyRoute(baseRoute: string, target: string, verbs: string[] = ['all']) {
    const routeRouter: any = express.Router();

    verbs.forEach((verb: string) =>
        routeRouter[verb]("*", (req: express.Request, res: express.Response) => {
            proxy.web(req, res, { target });
        })
    );

    router.use(baseRoute, routeRouter);

    return routeRouter;
}

proxyRoute('/search', config.get("targets.search"));
proxyRoute('/registry', config.get("targets.registry"));
proxyRoute('/auth', config.get("targets.auth"));
proxyRoute('/discussions', config.get("targets.discussions"));

export default router;