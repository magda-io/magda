const Api = require("kubernetes-client");
const fs = require("fs");
require("util.promisify/shim")();
import { promisify } from "util";
import * as _ from "lodash";
import * as path from "path";
import getMinikubeIP from "@magda/typescript-common/dist/util/getMinikubeIP";
// var request = require('request');
// require('request-debug')(request);

export type K8SApiType = "minikube" | "cluster";

export default class K8SApi {
    private batchApi: any;
    private coreApi: any;

    constructor(apiType: K8SApiType, private namespace: string = "default") {
        const details = K8SApi.getDetails(apiType);
        this.batchApi = new Api.Batch(details);
        this.coreApi = new Api.Core(details);
    }

    getJobs(options?: any): Promise<any> {
        return promisify(
            this.batchApi
                .ns(this.namespace)
                .jobs.get.bind(this.batchApi.ns.jobs)
        )(options);
    }

    createJob(body: any): Promise<any> {
        return promisify(
            this.batchApi.ns.jobs.post.bind(this.batchApi.ns.jobs)
        )({ body });
    }

    deleteJob(prefixedId: string) {
        return promisify(this.batchApi.delete.bind(this.batchApi))({
            path: `/apis/batch/v1/namespaces/default/jobs/${prefixedId}`,
            body: {
                kind: "DeleteOptions",
                apiVersion: "batch/v1",
                propagationPolicy: "Background"
            }
        });
    }

    deleteJobIfRunning(id: string) {
        return this.getJobs({ path: `/${id}/status` }).then((result: any) => {
            if (result.items.length > 0) {
                return this.deleteJob(id);
            } else {
                return Promise.resolve();
            }
        });
    }

    getConnectorConfigMap() {
        return promisify(
            this.coreApi.ns.configmaps.get.bind(this.coreApi.ns.configmaps)
        )({
            name: "connector-config"
        }).then((result: any) =>
            _(result.data)
                .mapKeys((value: any, key: string) => {
                    return key.slice(0, key.length - 5);
                })
                .mapValues((value: string) => JSON.parse(value))
                .value()
        );
    }

    updateConnectorConfigMap(id: string, newConfig: any) {
        return promisify(
            this.coreApi.ns.configmaps.patch.bind(this.coreApi.ns.configmaps)
        )({
            name: "connector-config",
            body: {
                data: {
                    [`${id}.json`]: JSON.stringify(newConfig)
                }
            }
        });
    }

    static getDetails(apiType: K8SApiType) {
        if (apiType === "minikube") {
            const minikubeIP = getMinikubeIP();

            const minikubePath = path.join(
                process.env[
                    process.platform === "win32" ? "USERPROFILE" : "HOME"
                ],
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
    }
}
