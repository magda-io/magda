import * as express from "express";
const httpProxy = require("http-proxy");

export default function(target: {}): express.Router {
  const webRouter = express.Router();
  const proxy = httpProxy.createProxyServer({ prependUrl: false });

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

  return webRouter;
}
