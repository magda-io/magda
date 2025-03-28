import * as k8s from "@kubernetes/client-node";
import { ApiException } from "@kubernetes/client-node";
import { JsonConnectorConfig } from "magda-typescript-common/src/JsonConnector.js";
import ServerError from "magda-typescript-common/src/ServerError.js";
import _ from "lodash";
import connectorObjName from "./connectorObjName.js";
import buildConnectorCronJobManifest from "./buildConnectorCronJobManifest.js";
import { PromiseMiddlewareWrapper } from "@kubernetes/client-node/dist/gen/middleware.js";

export interface Connector extends JsonConnectorConfig {
    cronJob: k8s.V1CronJob;
    configData: JsonConnectorConfig;
    suspend: boolean;
    status: {
        lastScheduleTime: string;
        lastSuccessfulTime: string;
    };
}

function getConnectorConfigMapNameFromCronJob(cronJob: k8s.V1CronJob): string {
    const vols = cronJob?.spec?.jobTemplate?.spec?.template?.spec?.volumes;
    if (!vols?.length) {
        return null;
    }
    for (const vol of vols) {
        if (!!vol?.configMap?.name?.startsWith("connector-")) {
            return vol.configMap.name;
        }
    }
    return null;
}

const mergePatchOpts = {
    middleware: [
        new PromiseMiddlewareWrapper(
            k8s.setHeaderMiddleware(
                "Content-Type",
                k8s.PatchStrategy.MergePatch
            )[0]
        )
    ]
};

export default class K8SApi {
    public batchApi: k8s.BatchV1Api;
    public coreApi: k8s.CoreV1Api;
    public namespace: string;
    public testMode: boolean;

    constructor(namespace: string = "default", testMode: boolean = false) {
        this.namespace = namespace;
        this.testMode = typeof testMode === "boolean" ? testMode : false;
        const kc = new k8s.KubeConfig();
        if (this.testMode) {
            kc.addCluster({
                name: "test",
                server: "http://mock-k8s-api.com",
                skipTLSVerify: true
            });
            kc.addUser({
                name: "test-user"
            });
            kc.addContext({
                name: "test",
                cluster: "test",
                user: "test-user"
            });
            kc.setCurrentContext("test");
        } else {
            kc.loadFromCluster();
        }

        this.batchApi = kc.makeApiClient(k8s.BatchV1Api);
        this.coreApi = kc.makeApiClient(k8s.CoreV1Api);
    }

    async getJobs() {
        const res = await this.batchApi.listNamespacedJob({
            namespace: this.namespace
        });
        return res.items;
    }

    async getJob(id: string) {
        const res = await this.batchApi.readNamespacedJob({
            name: id,
            namespace: this.namespace
        });
        return res;
    }

    async getPodsWithSelector(selector: string) {
        const res = await this.coreApi.listNamespacedPod({
            namespace: this.namespace,
            labelSelector: selector
        });
        return res.items;
    }

    async getService(id: string) {
        const res = await this.coreApi.listNamespacedService({
            namespace: this.namespace
        });
        return res.items;
    }

    async getJobStatus(id: string) {
        const job = await this.batchApi.readNamespacedJob({
            name: id,
            namespace: this.namespace
        });
        return job.status;
    }

    async createJob(body: k8s.V1Job) {
        const res = await this.batchApi.createNamespacedJob({
            namespace: this.namespace,
            body: body
        });
        return res;
    }

    async createService(body: k8s.V1Service) {
        const res = await this.coreApi.createNamespacedService({
            namespace: this.namespace,
            body: body
        });
        return res;
    }

    async deleteJob(id: string) {
        const res = await this.batchApi.deleteNamespacedJob({
            name: id,
            namespace: this.namespace
        });
        return res;
    }

    deleteJobIfPresent(id: string) {
        return this.getJobStatus(id)
            .then((result: any) => {
                return this.deleteJob(id);
            })
            .catch((e) => {
                if (e instanceof ApiException && e.code === 404) {
                    return Promise.resolve();
                }
                throw e;
            });
    }

    async deleteService(id: string) {
        const res = await this.coreApi.deleteNamespacedService({
            name: id,
            namespace: this.namespace
        });
        return res;
    }

    async getConnectorConfigMaps() {
        const configMaps = (
            await this.coreApi.listNamespacedConfigMap({
                namespace: this.namespace
            })
        ).items?.filter(
            (item) => !!item?.metadata?.name?.startsWith("connector-")
        );

        if (!configMaps?.length) {
            return [];
        } else {
            return configMaps;
        }
    }

    async updateConfigMap(id: string, newConfig: k8s.V1ConfigMap) {
        try {
            const response = await this.coreApi.patchNamespacedConfigMap(
                {
                    name: id,
                    namespace: this.namespace,
                    body: newConfig
                },
                mergePatchOpts
            );
            return response;
        } catch (error) {
            console.error("Error updating configmap:", error);
            throw error;
        }
    }

    async getConfigMap(id: string) {
        try {
            const response = await this.coreApi.readNamespacedConfigMap({
                name: id,
                namespace: this.namespace
            });
            return response;
        } catch (error) {
            console.error("Error getting configmap:", error);
            throw error;
        }
    }

    async getConnectors() {
        const cronJobs = await this.batchApi.listNamespacedCronJob({
            namespace: this.namespace
        });
        const items = cronJobs.items?.filter(
            (item) => !!item?.metadata?.name?.startsWith("connector-")
        );
        if (!items?.length) {
            return [];
        }
        const result = [] as Connector[];
        for (let i = 0; i < items.length; i++) {
            const connector = await this.connectorCronJobObjectToConnectorData(
                items[i]
            );
            result.push(connector);
        }
        return result;
    }

    async getConnector(id: string) {
        const res = await this.batchApi.readNamespacedCronJob({
            name: connectorObjName(id),
            namespace: this.namespace
        });
        return await this.connectorCronJobObjectToConnectorData(res);
    }

    async deleteConnector(id: string): Promise<boolean> {
        let deleted: boolean = false;
        try {
            const connector = await this.getConnector(id);
            if (
                connector?.cronJob?.metadata?.labels?.[
                    "app.kubernetes.io/managed-by"
                ] === "Helm"
            ) {
                throw new ServerError(
                    "Cannot delete a connector that is managed as part of the deployed Helm chart.",
                    400
                );
            }
            await this.batchApi.deleteNamespacedCronJob({
                name: connectorObjName(id),
                namespace: this.namespace
            });
            // set deleted = true as we at least took the action to remove cron job
            deleted = true;
            await this.coreApi.deleteNamespacedConfigMap({
                name: connectorObjName(id),
                namespace: this.namespace
            });
            return true;
        } catch (e) {
            if (e instanceof ApiException && e.code == 404) {
                return deleted;
            }
            throw e;
        }
    }

    async updateConnector(
        id: string,
        connectorConfig: Partial<JsonConnectorConfig>
    ) {
        if (_.isEmpty(connectorConfig)) {
            throw new ServerError("Supplied ConnectorConfig is empty", 400);
        }
        const connector = await this.getConnector(id);
        if (
            connector.cronJob?.metadata?.labels?.[
                "app.kubernetes.io/managed-by"
            ] === "Helm"
        ) {
            throw new ServerError(
                "Cannot update a connector that is managed as part of the deployed Helm chart.",
                400
            );
        }
        const configMapName = getConnectorConfigMapNameFromCronJob(
            connector.cronJob
        );
        const configData = {
            ...connector.configData,
            ...connectorConfig
        };
        await this.updateConfigMap(configMapName, {
            data: {
                "config.json": JSON.stringify(configData)
            }
        });

        if (connectorConfig?.schedule?.length) {
            await this.batchApi.patchNamespacedCronJob(
                {
                    name: connectorObjName(id),
                    namespace: this.namespace,
                    body: {
                        spec: {
                            schedule: connectorConfig.schedule
                        }
                    }
                },
                mergePatchOpts
            );
        }
    }

    async connectorExist(id: string) {
        try {
            await this.batchApi.readNamespacedCronJob({
                name: connectorObjName(id),
                namespace: this.namespace
            });
            return true;
        } catch (e) {
            if (e instanceof ApiException && e.code === 404) {
                return false;
            }
            throw e;
        }
    }

    async createConnector(
        connectorConfig: JsonConnectorConfig,
        options: {
            registryApiUrl: string;
            tenantId: number;
            defaultUserId: string;
            dockerImageString?: string;
            dockerImageName?: string;
            dockerImageTag?: string;
            dockerRepo?: string;
            pullPolicy?: string;
        }
    ) {
        const connectorId = connectorConfig?.id;
        if (!connectorId) {
            throw new ServerError("Connector ID cannot be empty.", 400);
        }

        if (await this.connectorExist(connectorId)) {
            throw new ServerError(
                `Connector with id ${connectorId} already exist.`,
                400
            );
        }

        if (!connectorConfig?.schedule) {
            throw new ServerError(`expected missing "schedule" field`, 400);
        }

        if (
            !options.dockerImageString &&
            (!options.dockerImageName ||
                !options.dockerRepo ||
                !options.dockerImageTag)
        ) {
            throw new ServerError(
                "Either `dockerImageString` or all `dockerImageName`, `dockerRepo` and `dockerImageTag` fields are required.",
                400
            );
        }

        const connectorObjectName = connectorObjName(connectorId);

        const configMap = new k8s.V1ConfigMap();
        configMap.apiVersion = "v1";
        configMap.kind = "ConfigMap";
        configMap.metadata = new k8s.V1ObjectMeta();
        configMap.metadata.name = connectorObjectName;
        configMap.metadata.namespace = this.namespace;
        configMap.metadata.labels = {
            "app.kubernetes.io/managed-by": "Magda"
        };
        configMap.data = {
            "config.json": JSON.stringify(connectorConfig)
        };

        try {
            await this.coreApi.readNamespacedConfigMap({
                name: connectorObjectName,
                namespace: this.namespace
            });
            // when configMap exists, patch the configMap
            await this.coreApi.patchNamespacedConfigMap(
                {
                    name: connectorObjectName,
                    namespace: this.namespace,
                    body: configMap
                },
                mergePatchOpts
            );
        } catch (e) {
            if (e instanceof ApiException && e.code === 404) {
                // when configMap doesn't exist, create a new configMap
                await this.coreApi.createNamespacedConfigMap({
                    namespace: this.namespace,
                    body: configMap
                });
            } else {
                throw e;
            }
        }

        const cronJob = buildConnectorCronJobManifest({
            id: connectorId,
            ...options,
            schedule: connectorConfig.schedule,
            namespace: this.namespace
        });

        await this.batchApi.createNamespacedCronJob({
            namespace: this.namespace,
            body: cronJob
        });
    }

    async startConnector(id: string) {
        const name = connectorObjName(id);

        await this.batchApi.patchNamespacedCronJob(
            {
                name: name,
                namespace: this.namespace,
                body: {
                    spec: {
                        suspend: false
                    }
                }
            },
            mergePatchOpts
        );
    }

    async stopConnector(id: string) {
        const name = connectorObjName(id);

        await this.batchApi.patchNamespacedCronJob(
            {
                name: name,
                namespace: this.namespace,
                body: {
                    spec: {
                        suspend: true
                    }
                }
            },
            mergePatchOpts
        );
    }

    async connectorCronJobObjectToConnectorData(cronJob: k8s.V1CronJob) {
        const connectorId = cronJob?.metadata?.name;
        if (!connectorId) {
            throw new Error(
                `cronJob object has empty name field: ${JSON.stringify(
                    cronJob
                )}`
            );
        }
        if (!connectorId.startsWith("connector-")) {
            throw new Error(
                `cronJob object does not has a name start with "connector-": ${JSON.stringify(
                    cronJob
                )}`
            );
        }
        const configMapName = getConnectorConfigMapNameFromCronJob(cronJob);
        if (!configMapName) {
            throw new ServerError(
                "Cannot retrieve configMap name from CronJob manifest",
                500
            );
        }
        const configMap = await this.getConfigMap(configMapName);
        const configData = JSON.parse(
            configMap?.data?.["config.json"]
        ) as JsonConnectorConfig;
        const connectorData: Connector = {
            id: connectorId.replace("connector-", ""),
            cronJob,
            name: configData?.name,
            ...configData,
            schedule: cronJob?.spec?.schedule,
            suspend: cronJob.spec.suspend,
            status: {
                lastScheduleTime:
                    cronJob?.status?.lastScheduleTime?.toISOString() || "",
                lastSuccessfulTime:
                    cronJob?.status?.lastSuccessfulTime?.toISOString() || ""
            },
            configData
        };
        return connectorData;
    }
}
