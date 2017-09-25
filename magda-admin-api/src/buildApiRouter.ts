import * as express from "express";
import connectorConfig from "./buildConnectorManifest";
import * as _ from "lodash";
import K8SApi, { K8SApiType } from "./k8sApi";
import { mustBeAdmin } from "@magda/typescript-common/dist/authorization-api/authMiddleware";

export interface Options {
    dockerRepo: string;
    authApiUrl: string;
    imageTag: string;
    kubernetesApiType: K8SApiType;
    registryApiUrl: string;
    pullPolicy: string;
}

export default function buildApiRouter(options: Options) {
    const router: express.Router = express.Router();
    const prefixId = (id: string) => `connector-${id}`;

    const k8sApi = new K8SApi(options.kubernetesApiType);

    router.use(mustBeAdmin(options.authApiUrl));

    router.get("/connectors", (req, res) => {
        Promise.all([k8sApi.getConnectorConfigMap(), k8sApi.getJobs()])
            .then(([connectorConfigMap, jobs]: [any, any]) => {
                const connectorStatus = _(jobs.items)
                    .map((item: any) => ({
                        name: item.metadata.name,
                        status: (() => {
                            if (item.status.active === 1) {
                                return "active";
                            } else if (item.status.succeeded === 1) {
                                return "succeeded";
                            } else if (item.status.failed === 1) {
                                return "failed";
                            } else {
                                return "inactive";
                            }
                        })(),
                        startTime: item.status.startTime,
                        completionTime: item.status.completionTime
                    }))
                    .keyBy((item: any) => item.name.slice("connector-".length))
                    .value();

                const result = _.map(
                    connectorConfigMap,
                    (connector: any, key: string) => {
                        return {
                            ...connector,
                            id: key,
                            job: connectorStatus[key]
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

    router.put("/connectors/:id", (req, res) => {
        const id = req.params.id;

        k8sApi
            .updateConnectorConfigMap(id, req.body)
            .then((result: any) => res.status(200).send(result))
            .catch((error: Error) => {
                console.error(error);
                res.status(500).send("Error");
            });
    });

    router.delete("/connectors/:id", (req, res) => {
        const id = req.params.id;

        k8sApi
            .deleteJobIfPresent(prefixId(id))
            .then(() => k8sApi.updateConnectorConfigMap(id, null))
            .then((result: any) => res.status(200).send(result))
            .catch((error: Error) => {
                console.error(error);
                res.status(500).send("Error");
            });
    });

    router.post("/connectors/:id/start", (req, res) => {
        const id = req.params.id;

        k8sApi
            .deleteJobIfPresent(prefixId(id))
            .then(() => k8sApi.getConnectorConfigMap())
            .then((configMap: any) => {
                if (!configMap[id]) {
                    res.status(404).send("No config for connector id");
                    return undefined;
                } else {
                    return k8sApi
                        .createJob(
                            connectorConfig({
                                id,
                                dockerImage: configMap[id].type,
                                dockerImageTag: options.imageTag,
                                dockerRepo: options.dockerRepo,
                                registryApiUrl: options.registryApiUrl,
                                pullPolicy: options.pullPolicy
                            })
                        )
                        .then((result: any) => {
                            res.status(200).send(result);
                        });
                }
            })
            .catch((err: Error) => {
                console.error(err);
                res.status(500).send("Error");
            });
    });

    router.post("/connectors/:id/stop", (req, res) => {
        const id = req.params.id;

        return k8sApi
            .deleteJob(prefixId(id))
            .then(() => {
                res.status(204).send();
            })
            .catch((err: Error) => {
                console.error(err);

                if ((err as any).code === 404) {
                    res.status(404).send("No running connector " + id);
                } else {
                    res.status(500).send("Error");
                }
            });
    });

    // Get a source (pre-transformation to aspects) dataset, distribution, or organization.
    // Optionally an item with a specific ID can be requested (otherwise a random one is provided).
    //   /connectors/:id/interactive/dataset
    //   /connectors/:id/interactive/distribution?id=foo
    //   /connectors/:id/interactive/organization
    //
    //   /connectors/:id/interactive/harness
    //     createDatasetRecord(aspectBuilders, sourceDataset)

    return router;
}
