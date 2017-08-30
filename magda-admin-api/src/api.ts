import * as express from "express";
// import { Maybe } from "tsmonad";
import connectorConfig from "./connectorConfig";
import * as _ from "lodash";
import * as k8sApi from "./k8sApi";
import { mustBeAdmin } from "@magda/auth-api/dist/authMiddleware";

const router: express.Router = express.Router();
const prefixId = (id: string) => `connector-${id}`;

router.use(mustBeAdmin);

router.get("/crawlers", (req, res) => {
  Promise.all([k8sApi.getConnectorConfigMap(), k8sApi.getJobs()])
    .then(([connectorConfigMap, jobs]: [any, any]) => {
      const crawlerStatus = _(jobs.items)
        .map((item: any) => ({
          name: item.metadata.name,
          status: item.status.active === 1 ? "active" : "inactive",
          startTime: item.status.startTime
        }))
        .keyBy((item: any) => item.name.slice("connector-".length))
        .value();

      const result = _.map(
        connectorConfigMap,
        (connector: any, key: string) => {
          return {
            ...connector,
            id: key,
            job: crawlerStatus[key]
          };
        }
      );

      res.status(200).send(result);
    })
    .catch((err: Error) => {
      console.error(err);
      res.status(500).send("Error");
    });
});

router.put("/crawlers/:id", (req, res) => {
  const id = req.params.id;

  k8sApi
    .updateConnectorConfigMap(id, req.body)
    .then((result: any) => res.status(200).send(result))
    .catch((error: Error) => {
      console.error(error);
      res.status(500).send("Error");
    });
});

router.delete("/crawlers/:id", (req, res) => {
  const id = req.params.id;

  k8sApi
    .deleteJobIfRunning(prefixId(id))
    .then(() => k8sApi.updateConnectorConfigMap(id, null))
    .then((result: any) => res.status(200).send(result))
    .catch((error: Error) => {
      console.error(error);
      res.status(500).send("Error");
    });
});

router.post("/crawlers/:id/start", (req, res) => {
  const id = req.params.id;

  k8sApi
    .deleteJobIfRunning(prefixId(id))
    .then(() => k8sApi.getConnectorConfigMap())
    .then((configMap: any) => {
      const config = connectorConfig({
        id,
        dockerImage: configMap[id].type
      });

      return k8sApi.createJob({ body: config }).then((result: any) => {
        res.status(200).send(result);
      });
    })
    .catch((err: Error) => {
      console.error(err);
      res.status(500).send("Error");
    });
});

router.post("/crawlers/:id/stop", (req, res) => {
  const id = req.params.id;

  return k8sApi
    .deleteJob(prefixId(id))
    .then(() => {
      res.status(204).send();
    })
    .catch((err: Error) => {
      console.error(err);
      res.status(500).send("Error");
    });
});

// This is for getting a JWT in development so you can do fake authenticated requests to a local server.
if (process.env.NODE_ENV === "") {
  router.get("public/jwt", function(req, res) {
    res.status(200);
    res.write("X-Magda-Session: " + req.header("X-Magda-Session"));
    res.send();
  });
}

export default router;
