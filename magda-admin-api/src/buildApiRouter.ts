import * as express from "express";
import connectorConfig from "./connectorConfig";
import * as _ from "lodash";
import K8SApi, { K8SApiType } from "./k8sApi";
import { mustBeAdmin } from "@magda/authorization-api/dist/authMiddleware";

export interface Options {
    dockerRepo: string;
    authApiUrl: string;
    imageTag: string;
    kubernetesApiType: K8SApiType;
    registryApiUrl: string;
}

export default function buildApiRouter(options: Options) {
    const router: express.Router = express.Router();
    const prefixId = (id: string) => `connector-${id}`;

    const k8sApi = new K8SApi(options.kubernetesApiType);

    router.use(mustBeAdmin(options.authApiUrl));

    router.get("/crawlers", (req, res) => {
        Promise.all([k8sApi.getConnectorConfigMap(), k8sApi.getJobs()])
            .then(([connectorConfigMap, jobs]: [any, any]) => {
                const crawlerStatus = _(jobs.items)
                    .map((item: any) => ({
                        name: item.metadata.name,
                        status:
                            item.status.active === 1 ? "active" : "inactive",
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
                    dockerImage: configMap[id].type,
                    dockerImageTag: options.imageTag,
                    dockerRepo: options.dockerRepo,
                    registryApiUrl: options.registryApiUrl
                });

                return k8sApi.createJob(config).then((result: any) => {
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

    return router;
}
