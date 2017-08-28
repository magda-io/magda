import * as express from "express";
// import { Maybe } from "tsmonad";
const Api = require("kubernetes-client");
const fs = require("fs");
require("util.promisify/shim")();
import { promisify } from "util";
import connectorConfig from "./connectorConfig";
// var request = require('request');

// require('request-debug')(request);
// import { getUserIdHandling } from "@magda/typescript-common/dist/session/GetUserId";

const router: express.Router = express.Router();
const details = {
  url: "https://192.168.99.100:8443",
  ca: fs.readFileSync(`/Users/${process.env.USER}/.minikube/ca.crt`),
  cert: fs.readFileSync(`/Users/${process.env.USER}/.minikube/apiserver.crt`),
  key: fs.readFileSync(`/Users/${process.env.USER}/.minikube/apiserver.key`)
};
const batchApi = new Api.Batch(details);
const coreApi = new Api.Core(details);

const getJobs = promisify(batchApi.ns.jobs.get.bind(batchApi.ns.jobs));
const postJob = promisify(batchApi.ns.jobs.post.bind(batchApi.ns.jobs));
const getConfigMap = promisify(
  coreApi.ns.configmaps.get.bind(coreApi.ns.configmaps)
);

router.get("/crawlers", (req, res) => {
  getJobs()
    .then((result: any) => {
      const crawlers = result.items.map((item: any) => ({
        name: item.metadata.name,
        status: item.status.active === 1 ? "active" : "inactive",
        startTime: item.status.startTime
      }));

      res.status(200).send(crawlers);
    })
    .catch((err: Error) => {
      console.error(err);
      res.status(500).send("Error");
    });
});

router.put("/crawlers/:id", (req, res) => {
  const id = req.params.id;
  const prefixedId = `connector-${id}`;

  getJobs({ path: `/${id}/status` })
    .then((result: any) => {
      if (result.items.length > 0) {
        return batchApi.delete({
          path: `/apis/batch/v1/namespaces/default/jobs/${prefixedId}`,
          body: {
            kind: "DeleteOptions",
            apiVersion: "batch/v1",
            propagationPolicy: "Background"
          }
        });
      } else {
        return Promise.resolve();
      }
    })
    .then(() => {
      return getConfigMap({ name: prefixedId });
    })
    .then((configMap: any) => {
      const config = connectorConfig({
        id,
        dockerImage: configMap.data["connector.json"].type
      });

      return postJob({ body: config }).then((result: any) => {
        res.status(201).send(result);
      });
    })
    .catch((err: Error) => {
      console.error(err);
      res.status(500).send("Error");
    });
});

// // This is for getting a JWT in development so you can do fake authenticated requests to a local server.
// if (process.env.NODE_ENV !== "production") {
//   router.get("public/jwt", function(req, res) {
//     res.status(200);
//     res.write("X-Magda-Session: " + req.header("X-Magda-Session"));
//     res.send();
//   });
// }

export default router;
