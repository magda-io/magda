import * as express from "express";
import { Router } from "express";
const httpProxy = require("http-proxy");
const config = require("config");

const webRouter: Router = express.Router();
const proxy = httpProxy.createProxyServer({ prependUrl: false });
const target = config.get("targets.web");

proxy.on("error", function(err: any, req: any, res: any) {
  res.writeHead(500, {
    "Content-Type": "text/plain"
  });

  console.error(err);

  res.end("Something went wrong.");
});

webRouter.get("*", (req: express.Request, res: express.Response) => {
    proxy.web(req, res, { target });
});

export default webRouter;
