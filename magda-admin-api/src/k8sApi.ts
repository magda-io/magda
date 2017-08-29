const Api = require("kubernetes-client");
const fs = require("fs");
require("util.promisify/shim")();
import { promisify } from "util";
import * as _ from "lodash";
import * as config from "config";
import * as path from "path";
import getMinikubeIP from "@magda/typescript-common/dist/util/getMinikubeIP";
// var request = require('request');
// require('request-debug')(request);

const details = (() => {
  if (config.get("kubernetesApi.isMinikube")) {
    const minikubeIP = getMinikubeIP();

    const minikubePath = path.join(
      process.env[process.platform === "win32" ? "USERPROFILE" : "HOME"],
      ".minikube"
    );

    return {
      url: `https://${minikubeIP}:8443`,
      ca: fs.readFileSync(path.join(minikubePath, "ca.crt")),
      cert: fs.readFileSync(path.join(minikubePath, "apiserver.crt")),
      key: fs.readFileSync(path.join(minikubePath, "apiserver.key"))
    };
  } else {
    return Api.config.getInCluster();
  }
})();
const batchApi = new Api.Batch(details);
const coreApi = new Api.Core(details);

export const getJobs = promisify(batchApi.ns.jobs.get.bind(batchApi.ns.jobs));
export const createJob = promisify(
  batchApi.ns.jobs.post.bind(batchApi.ns.jobs)
);
export const deleteJob = (prefixedId: string) =>
  promisify(batchApi.delete.bind(batchApi))({
    path: `/apis/batch/v1/namespaces/default/jobs/${prefixedId}`,
    body: {
      kind: "DeleteOptions",
      apiVersion: "batch/v1",
      propagationPolicy: "Background"
    }
  });
export const deleteJobIfRunning = (id: string) =>
  getJobs({ path: `/${id}/status` }).then((result: any) => {
    if (result.items.length > 0) {
      return deleteJob(id);
    } else {
      return Promise.resolve();
    }
  });
export const getConnectorConfigMap = () =>
  promisify(coreApi.ns.configmaps.get.bind(coreApi.ns.configmaps))({
    name: "connector-config"
  }).then((result: any) =>
    _(result.data)
      .mapKeys((value: any, key: string) => {
        return key.slice(0, key.length - 5);
      })
      .mapValues((value: string) => JSON.parse(value))
      .value()
  );
export const updateConnectorConfigMap = (id: string, newConfig: any) =>
  promisify(coreApi.ns.configmaps.patch.bind(coreApi.ns.configmaps))({
    name: "connector-config",
    body: {
      data: {
        [`${id}.json`]: JSON.stringify(newConfig)
      }
    }
  });
