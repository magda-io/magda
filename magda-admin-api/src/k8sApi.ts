const Api = require("kubernetes-client");
const fs = require("fs");
require("util.promisify/shim")();
import { promisify } from "util";
import * as _ from "lodash";
import * as path from "path";
import getMinikubeIP from "@magda/typescript-common/dist/util/getMinikubeIP";
// var request = require('request');
// require('request-debug')(request);

export type K8SApiType = "minikube" | "cluster" | "test";

export default class K8SApi {
    private jobs: any;
    private configMaps: any;
    private getJobsInner: any;

    constructor(apiType: K8SApiType, private namespace: string = "default") {
        const details = K8SApi.getDetails(apiType);
        const batchApi = new Api.Batch(details);
        this.jobs = batchApi.ns(this.namespace).jobs;
        this.getJobsInner = promisify(this.jobs.get.bind(this.jobs));

        const coreApi = new Api.Core(details);
        this.configMaps = coreApi.ns(this.namespace).configmaps;
    }

    getJobs(): Promise<any> {
        return this.getJobsInner();
    }

    getJobStatus(id: string): Promise<any> {
        return this.getJobsInner({ name: `${id}/status` });
    }

    createJob(body: any): Promise<any> {
        return promisify(this.jobs.post.bind(this.jobs))({ body });
    }

    deleteJob(id: string) {
        return promisify(this.jobs.delete.bind(this.jobs))({
            name: id,
            body: {
                kind: "DeleteOptions",
                apiVersion: "batch/v1",
                propagationPolicy: "Background"
            }
        });
    }

    deleteJobIfPresent(id: string) {
        return this.getJobStatus(id)
            .then((result: any) => {
                return this.deleteJob(id);
            })
            .catch(e => {
                if (e.code === 404) {
                    return Promise.resolve();
                } else {
                    throw e;
                }
            });
    }

    getConnectorConfigMap() {
        return promisify(
            this.configMaps.get.bind(this.configMaps)
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
            this.configMaps.patch.bind(this.configMaps)
        )({
            name: "connector-config",
            body: {
                data: {
                    [`${id}.json`]: newConfig && JSON.stringify(newConfig)
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
        } else if (apiType === "test") {
            return {
                url: "https://kubernetes.example.com"
            };
        } else {
            return Api.config.getInCluster();
        }
    }
}
