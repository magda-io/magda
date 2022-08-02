import k8s, { HttpError } from "@kubernetes/client-node";
import { JsonConnectorConfig } from "magda-typescript-common/src/JsonConnector";
import ServerError from "magda-typescript-common/src/ServerError";
import _ from "lodash";
import connectorObjName from "./connectorObjName";
import buildConnectorCronJobManifest from "./buildConnectorCronJobManifest";

interface Connector extends JsonConnectorConfig {
    cronJob: k8s.V1CronJob;
    configData: JsonConnectorConfig;
    suspend: boolean;
    status: {
        lastScheduleTime: string;
        lastSuccessfulTime: string;
    };
}

export default class K8SApi {
    public batchApi: k8s.BatchV1Api;
    public coreApi: k8s.CoreV1Api;

    constructor(public namespace: string = "default") {
        const kc = new k8s.KubeConfig();
        kc.loadFromCluster();

        this.batchApi = kc.makeApiClient(k8s.BatchV1Api);
        this.coreApi = kc.makeApiClient(k8s.CoreV1Api);
    }

    async getJobs() {
        const res = await this.batchApi.listNamespacedJob(this.namespace);
        return res.body.items;
    }

    async getJob(id: string) {
        const res = await this.batchApi.readNamespacedJob(id, this.namespace);
        return res.body;
    }

    async getPodsWithSelector(selector: string) {
        const res = await this.coreApi.listNamespacedPod(
            this.namespace,
            undefined,
            undefined,
            undefined,
            selector
        );
        return res.body.items;
    }

    async getService(id: string) {
        const res = await this.coreApi.listNamespacedService(this.namespace);
        return res.body.items;
    }

    async getJobStatus(id: string) {
        const job = (await this.batchApi.readNamespacedJob(id, this.namespace))
            .body;
        return job.status;
    }

    async createJob(body: k8s.V1Job) {
        const res = await this.batchApi.createNamespacedJob(
            this.namespace,
            body
        );
        return res.body;
    }

    async createService(body: k8s.V1Service) {
        const res = await this.coreApi.createNamespacedService(
            this.namespace,
            body
        );
        return res.body;
    }

    async deleteJob(id: string) {
        const res = await this.batchApi.deleteNamespacedJob(id, this.namespace);
        return res.body;
    }

    deleteJobIfPresent(id: string) {
        return this.getJobStatus(id)
            .then((result: any) => {
                return this.deleteJob(id);
            })
            .catch((e) => {
                if (e instanceof HttpError && e.statusCode === 404) {
                    return Promise.resolve();
                }
                throw e;
            });
    }

    async deleteService(id: string) {
        const res = await this.coreApi.deleteNamespacedService(
            id,
            this.namespace
        );
        return res.body;
    }

    async getConnectorConfigMaps() {
        const configMaps = (
            await this.coreApi.listNamespacedConfigMap(this.namespace)
        )?.body?.items?.filter(
            (item) => !!item?.metadata?.name?.startsWith("connector-")
        );

        if (!configMaps?.length) {
            return [];
        } else {
            return configMaps;
        }
    }

    async updateConfigMap(id: string, newConfig: object) {
        const res = await this.coreApi.patchNamespacedConfigMap(
            id,
            this.namespace,
            newConfig
        );
        return res.body;
    }

    async getConfigMap(id: string) {
        const res = await this.coreApi.readNamespacedConfigMap(
            id,
            this.namespace
        );
        return res.body;
    }

    async getConnectors() {
        const cronJobs = (
            await this.batchApi.listNamespacedCronJob(this.namespace)
        )?.body?.items?.filter(
            (item) => !!item?.metadata?.name?.startsWith("connector-")
        );
        if (!cronJobs?.length) {
            return [];
        }
        const result = [] as Connector[];
        for (let i = 0; i < cronJobs.length; i++) {
            const connector = await this.connectorCronJobObjectToConnectorData(
                cronJobs[i]
            );
            result.push(connector);
        }
        return result;
    }

    async getConnector(id: string) {
        const res = await this.batchApi.readNamespacedCronJob(
            connectorObjName(id),
            this.namespace
        );
        return await this.connectorCronJobObjectToConnectorData(res.body);
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
            await this.batchApi.deleteNamespacedCronJob(
                connectorObjName(id),
                this.namespace
            );
            // set deleted = true as we at least took the action to remove cron job
            deleted = true;
            await this.coreApi.deleteNamespacedConfigMap(
                connectorObjName(id),
                this.namespace
            );
            return true;
        } catch (e) {
            if (e instanceof HttpError && e.statusCode == 404) {
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
            connector?.cronJob?.metadata?.labels?.[
                "app.kubernetes.io/managed-by"
            ] === "Helm"
        ) {
            throw new ServerError(
                "Cannot update a connector that is managed as part of the deployed Helm chart.",
                400
            );
        }
        const configData = {
            ...connector.configData,
            ...connectorConfig
        };
        await this.updateConfigMap(connectorObjName(id), {
            data: {
                "config.json": JSON.stringify(configData)
            }
        });

        if (connectorConfig?.schedule?.length) {
            await this.batchApi.patchNamespacedCronJob(
                connectorObjName(id),
                this.namespace,
                {
                    spec: {
                        schedule: connectorConfig.schedule
                    }
                }
            );
        }
    }

    async connectorExist(id: string) {
        try {
            await this.batchApi.readNamespacedCronJob(
                connectorObjName(id),
                this.namespace
            );
            return true;
        } catch (e) {
            if (e instanceof HttpError && e.statusCode === 404) {
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
            await this.coreApi.readNamespacedConfigMap(
                connectorObjectName,
                this.namespace
            );
            // when configMap exists, patch the configMap
            await this.coreApi.patchNamespacedConfigMap(
                connectorObjectName,
                this.namespace,
                configMap
            );
        } catch (e) {
            if (e instanceof HttpError && e.statusCode === 404) {
                // when configMap doesn't exist, create a new configMap
                await this.coreApi.createNamespacedConfigMap(
                    this.namespace,
                    configMap
                );
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

        await this.batchApi.createNamespacedCronJob(this.namespace, cronJob);
    }

    async startConnector(id: string) {
        const name = connectorObjName(id);
        await this.batchApi.patchNamespacedCronJob(name, this.namespace, {
            spec: {
                suspend: false
            }
        });
    }

    async stopConnector(id: string) {
        const name = connectorObjName(id);
        await this.batchApi.patchNamespacedCronJob(name, this.namespace, {
            spec: {
                suspend: true
            }
        });
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
        const configMap = await this.getConfigMap(connectorId);
        const configData = JSON.parse(configMap?.data?.["config.json"]);
        const connectorData: Connector = {
            id: connectorId,
            cronJob,
            name: configData?.name,
            ...configData,
            schedule: cronJob?.spec?.schedule,
            suspend: cronJob.spec.suspend,
            status: cronJob?.status,
            configData
        };
        return connectorData;
    }
}
