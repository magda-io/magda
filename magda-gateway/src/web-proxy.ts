import * as express from "express";
const httpProxy = require("http-proxy");
const config = require("config");

const webRouter = express.Router();
const proxy = httpProxy.createProxyServer({ prependUrl: false });
const target = config.get("targets.web");

webRouter.get("*", (req: express.Request, res: express.Response) => {
    proxy.web(req, res, { target });
});

export default webRouter;
