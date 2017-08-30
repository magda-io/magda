import * as express from "express";
import { Router } from "express";
const httpProxy = require("http-proxy");
const jwt = require("jsonwebtoken");
const config = require("config");
import * as _ from "lodash";

import setupAuth from "./setup-auth";

var proxy = httpProxy.createProxyServer({ prependUrl: false });

const router: Router = express.Router();

proxy.on("proxyReq", function(
  proxyReq: any,
  req: any,
  res: Response,
  options: any
) {
  if (req.user) {
    const token = jwt.sign(
      { userId: req.user.id },
      process.env.JWT_SECRET || process.env.npm_package_config_JWT_SECRET
    );
    proxyReq.setHeader("X-Magda-Session", token);
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

  if (auth) {
    setupAuth(routeRouter);
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

type ProxyTarget = {
  to: string;
  methods?: string[];
  auth?: boolean;
};

const targets = config.get("targets");
_(targets).forEach((value: ProxyTarget, key: string) => {
  proxyRoute(`/${key}`, value.to, value.methods, !!value.auth);
});

// proxyRoute("/search", config.get("targets.search"));
// proxyRoute("/registry", config.get("targets.registry"), ["get"], true);
// proxyRoute("/auth", config.get("targets.auth"), ["get"], true);
// proxyRoute("/discussions", config.get("targets.discussions"), undefined, true);

export default router;
