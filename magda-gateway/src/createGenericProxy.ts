import * as express from "express";
const httpProxy = require("http-proxy");

export default function createGenericProxy(target: {}): express.Router {
    const webRouter = express.Router();
    const proxy = httpProxy.createProxyServer({ prependUrl: false });

    proxy.on("error", function(err: any, req: any, res: any) {
        console.error(err);

        res.status(500).send("Something went wrong.");
    });

    webRouter.get("*", (req: express.Request, res: express.Response) => {
        proxy.web(req, res, { target });
    });

    return webRouter;
}
