import express, { Response } from "express";

import _ from "lodash";
import K8SApi from "./k8sApi";
import { requireUnconditionalAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import {
    installStatusRouter,
    createServiceProbe
} from "magda-typescript-common/src/express/status";
import { HttpError } from "@kubernetes/client-node";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import ServerError from "magda-typescript-common/src/ServerError";

export interface Options {
    dockerRepo: string;
    authApiUrl: string;
    imageTag: string;
    registryApiUrl: string;
    pullPolicy: string;
    jwtSecret: string;
    userId: string;
    tenantId: number;
    namespace?: string;
    authDecisionClient: AuthDecisionQueryClient;
    testMode?: boolean;
}

function handleError(e: unknown, res: Response) {
    if (e instanceof HttpError) {
        res.status(e.statusCode).send(e.body);
    } else if (e instanceof ServerError) {
        res.status(e.statusCode).send(e.message);
    } else {
        res.status(500).send(`${e}`);
    }
}

export default function buildApiRouter(options: Options) {
    const router: express.Router = express.Router();
    const authDecisionClient = options.authDecisionClient;

    const k8sApi = new K8SApi(options.namespace, options.testMode);

    const status = {
        probes: {
            k8s: async () => {
                await k8sApi.getJobs();
                return {
                    ready: true
                };
            },
            auth: createServiceProbe(options.authApiUrl)
        }
    };
    installStatusRouter(router, status);

    /**
     * @apiGroup Connectors
     * @api {get} /v0/admin/connectors Get the list of all connectors
     *
     * @apiDescription Get the list of all connectors.
     * Require permission of `object/connector/read` to access this API
     *
     * @apiSuccess (response body) {Connector[]} ResponseBody a list of connectors.
     * For all available fields of each connector item, please check API `{get} /v0/admin/connectors/:id`.
     *
     * @apiUse GenericError
     */
    router.get(
        "/connectors",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/connector/read"
        }),
        async (req, res) => {
            try {
                const connectors = await k8sApi.getConnectors();
                res.json(connectors);
            } catch (e) {
                handleError(e, res);
            }
        }
    );

    /**
     * @apiGroup Connectors
     * @api {get} /v0/admin/connectors/:id Get the connector by ID
     *
     * @apiDescription Get the connector detailed information by ID
     * Require permission of `object/connector/read` to access this API
     *
     * @apiSuccess (response body) {string} id Connector ID
     * @apiSuccess (response body) {string} name Connector name
     * @apiSuccess (response body) {string} sourceUrl Connector sourceUrl
     * @apiSuccess (response body) {number} [pageSize] Connector pageSize
     * @apiSuccess (response body) {string} schedule Connector schedule string in crontab format and in UTC timezone.
     * @apiSuccess (response body) {string[]} [ignoreHarvestSources] Make connector to ignore datasets from certain sources. Not all connector types & sources support this setting.
     * @apiSuccess (response body) {string[]} [allowedOrganisationNames] Make connector to ignore datasets from certain organisations. Not all connector types & sources support this setting.
     * @apiSuccess (response body) {string[]} [ignoreOrganisationNames] Make connector to ignore datasets from certain organisations. Not all connector types & sources support this setting.
     * @apiSuccess (response body) {object} [extras] Some predefined extra data to be attached to the `source` aspect of all harvested dataset.
     * @apiSuccess (response body) {object} [presetRecordAspects] the config setting that makes connector write predefined data to selected record type's selected aspect.
     * @apiSuccess (response body) {string} [presetRecordAspects.id] the ID of the aspect where the predefined data written to.
     * @apiSuccess (response body) {string} [presetRecordAspects.recordType] the record type where the predefined data written to. Possible value: "Organization" | "Dataset" | "Distribution";
     * @apiSuccess (response body) {string} [presetRecordAspects.opType] operation type; Describe how to add the aspect to the record
     *   - MERGE_LEFT: merge `presetAspect` with records aspects.
     *       i.e. `presetAspect` will be overwritten by records aspects data if any
     *   - MEREG_RIGHT: merge records aspects with `presetAspect`.
     *       i.e. records aspects data (if any) will be overwritten by `presetAspect`
     *   - REPLACE: `presetAspect` will replace any existing records aspect
     *   - FILL: `presetAspect` will be added if no existing aspect
     *   Default value (If not specified) will be `MERGE_LEFT`
     * @apiSuccess (response body) {object} [presetRecordAspects.data] The extra aspect data to be applied to the selected aspect of selected records.
     * @apiSuccess (response body) {object} cronJob Details of the cronJob object created for the connector in [v1CronJob](https://github.com/kubernetes-client/javascript/blob/2b6813f99a85605f691973d6bc43f291ac072fc7/src/gen/model/v1CronJob.ts#L21) structure.
     * @apiSuccess (response body) {boolean} suspend Whether the cronjob has been suspended.
     * @apiSuccess (response body) {object} status The status of the cronjob
     * @apiSuccess (response body) {object} [status.lastScheduleTime] The last schedule time
     * @apiSuccess (response body) {object} [status.lastSuccessfulTime] The last successful job run time
     *
     * @apiUse GenericError
     */
    router.get(
        "/connectors/:id",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/connector/read"
        }),
        async (req, res) => {
            try {
                const connector = await k8sApi.getConnector(req.params.id);
                res.json(connector);
            } catch (e) {
                handleError(e, res);
            }
        }
    );

    /**
     * @apiGroup Connectors
     * @api {put} /v0/admin/connectors/:id Update the connector by ID
     *
     * @apiDescription Update the connector by ID
     * Require permission of `object/connector/update` to access this API.
     * Please note: you cannot update a connector if it's deployed & managed as part of Helm Charts.
     *
     * @apiParam (path) {string} id Connector ID
     * @apiParam (request body) {string} [name] Connector name
     * @apiParam (request body) {string} [sourceUrl] Connector sourceUrl
     * @apiParam (request body) {number} [pageSize] Connector pageSize
     * @apiParam (request body) {string} [schedule] Connector schedule string in crontab format and in UTC timezone.
     * @apiParam (request body) {string[]} [ignoreHarvestSources] Make connector to ignore datasets from certain sources. Not all connector types & sources support this setting.
     * @apiParam (request body) {string[]} [allowedOrganisationNames] Make connector to ignore datasets from certain organisations. Not all connector types & sources support this setting.
     * @apiParam (request body) {string[]} [ignoreOrganisationNames] Make connector to ignore datasets from certain organisations. Not all connector types & sources support this setting.
     * @apiParam (request body) {object} [extras] Some predefined extra data to be attached to the `source` aspect of all harvested dataset.
     * @apiParam (request body) {object} [presetRecordAspects] the config setting that makes connector write predefined data to selected record type's selected aspect.
     * @apiParam (request body) {string} [presetRecordAspects.id] the ID of the aspect where the predefined data written to.
     * @apiParam (request body) {string} [presetRecordAspects.recordType] the record type where the predefined data written to. Possible value: "Organization" | "Dataset" | "Distribution";
     * @apiParam (request body) {string} [presetRecordAspects.opType] operation type; Describe how to add the aspect to the record
     *   - MERGE_LEFT: merge `presetAspect` with records aspects.
     *       i.e. `presetAspect` will be overwritten by records aspects data if any
     *   - MEREG_RIGHT: merge records aspects with `presetAspect`.
     *       i.e. records aspects data (if any) will be overwritten by `presetAspect`
     *   - REPLACE: `presetAspect` will replace any existing records aspect
     *   - FILL: `presetAspect` will be added if no existing aspect
     *   Default value (If not specified) will be `MERGE_LEFT`
     * @apiParam (request body) {object} [presetRecordAspects.data] The extra aspect data to be applied to the selected aspect of selected records.
     *
     * @apiSuccess (response body) {Connector} ResponseBody Information of the updated connector.
     * For all available fields of the connector, please check API `{get} /v0/admin/connectors/:id`.
     *
     * @apiUse GenericError
     */
    router.put(
        "/connectors/:id",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/connector/update"
        }),
        async (req, res) => {
            try {
                const id = req.params.id;
                await k8sApi.updateConnector(id, req.body);
                const connector = await k8sApi.getConnector(id);
                res.json(connector);
            } catch (e) {
                handleError(e, res);
            }
        }
    );

    /**
     * @apiGroup Connectors
     * @api {delete} /v0/admin/connectors/:id Delete the connector by ID
     *
     * @apiDescription Delete the connector by ID
     * Require permission of `object/connector/delete` to access this API.
     * Please note: you cannot delete a connector if it's deployed & managed as part of Helm Charts.
     *
     * @apiParam (path) {string} id Connector ID
     *
     * @apiSuccess (response body) {boolean} result Indicate whether the deletion action is taken or the connector doesn't exist.
     *
     * @apiUse GenericError
     */
    router.delete(
        "/connectors/:id",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/connector/delete"
        }),
        async (req, res) => {
            try {
                const id = req.params.id;
                const result = await k8sApi.deleteConnector(id);
                res.json({ result });
            } catch (e) {
                handleError(e, res);
            }
        }
    );

    /**
     * @apiGroup Connectors
     * @api {post} /v0/admin/connectors Create a new connector
     * @apiDescription Create a new connector
     * Require permission of `object/connector/create` to access this API.
     *
     * @apiParam (request body) {string} id Connector ID
     * @apiParam (request body) {string} dockerImageString the full docker image string of the connector including docker repository, image name & tag.
     *   e.g. `docker.io/data61/magda-ckan-connector:1.3.0`
     *   When `dockerImageString` is provided, `dockerImageName` field will not be used.
     * @apiParam (request body) {string} dockerImageName The docker image name of the connector.
     *   e.g. `magda-ckan-connector`. System will pull docker image from configured docker repository & image tag (configurable via magda-admin-api helm chart).
     *   `dockerImageName` will only be used when `dockerImageString` is not supplied.
     * @apiParam (request body) {string} [name] Connector name
     * @apiParam (request body) {string} [sourceUrl] Connector sourceUrl
     * @apiParam (request body) {number} [pageSize] Connector pageSize
     * @apiParam (request body) {string} [schedule] Connector schedule string in crontab format and in UTC timezone.
     * @apiParam (request body) {string[]} [ignoreHarvestSources] Make connector to ignore datasets from certain sources. Not all connector types & sources support this setting.
     * @apiParam (request body) {string[]} [allowedOrganisationNames] Make connector to ignore datasets from certain organisations. Not all connector types & sources support this setting.
     * @apiParam (request body) {string[]} [ignoreOrganisationNames] Make connector to ignore datasets from certain organisations. Not all connector types & sources support this setting.
     * @apiParam (request body) {object} [extras] Some predefined extra data to be attached to the `source` aspect of all harvested dataset.
     * @apiParam (request body) {object} [presetRecordAspects] the config setting that makes connector write predefined data to selected record type's selected aspect.
     * @apiParam (request body) {string} [presetRecordAspects.id] the ID of the aspect where the predefined data written to.
     * @apiParam (request body) {string} [presetRecordAspects.recordType] the record type where the predefined data written to. Possible value: "Organization" | "Dataset" | "Distribution";
     * @apiParam (request body) {string} [presetRecordAspects.opType] operation type; Describe how to add the aspect to the record
     *   - MERGE_LEFT: merge `presetAspect` with records aspects.
     *       i.e. `presetAspect` will be overwritten by records aspects data if any
     *   - MEREG_RIGHT: merge records aspects with `presetAspect`.
     *       i.e. records aspects data (if any) will be overwritten by `presetAspect`
     *   - REPLACE: `presetAspect` will replace any existing records aspect
     *   - FILL: `presetAspect` will be added if no existing aspect
     *   Default value (If not specified) will be `MERGE_LEFT`
     * @apiParam (request body) {object} [presetRecordAspects.data] The extra aspect data to be applied to the selected aspect of selected records.
     *
     * @apiSuccess (response body) {Connector} ResponseBody Information of the created connector.
     * For all available fields of the connector, please check API `{get} /v0/admin/connectors/:id`.
     *
     * @apiUse GenericError
     */
    router.post(
        "/connectors",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/connector/create"
        }),
        async (req, res) => {
            try {
                const {
                    id,
                    dockerImageString,
                    dockerImageName,
                    ...restConfigData
                } = req.body;

                await k8sApi.createConnector(
                    { id, ...restConfigData },
                    {
                        registryApiUrl: options.registryApiUrl,
                        tenantId: options.tenantId,
                        defaultUserId: options.userId,
                        dockerImageString,
                        dockerImageName,
                        dockerImageTag: options.imageTag,
                        dockerRepo: options.dockerRepo,
                        pullPolicy: options.pullPolicy
                    }
                );

                const data = await k8sApi.getConnector(id);
                res.json(data);
            } catch (e) {
                handleError(e, res);
            }
        }
    );

    /**
     * @apiGroup Connectors
     * @api {post} /v0/admin/connectors/:id/start Start the connector by ID
     *
     * @apiDescription Start the connector by ID
     * Require permission of `object/connector/update` to access this API.
     * The API will set the `suspend` field of the connector cronjob to `false`.
     *
     * @apiParam (path) {string} id Connector ID
     *
     * @apiSuccess (response body) {boolean} result will always be `true`.
     *
     * @apiUse GenericError
     */
    router.post(
        "/connectors/:id/start",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/connector/update"
        }),
        async (req, res) => {
            try {
                const id = req.params.id;
                await k8sApi.startConnector(id);
                res.json({ result: true });
            } catch (e) {
                handleError(e, res);
            }
        }
    );

    /**
     * @apiGroup Connectors
     * @api {post} /v0/admin/connectors/:id/stop Stop the connector by ID
     *
     * @apiDescription Stop the connector by ID
     * Require permission of `object/connector/update` to access this API.
     * The API will set the `suspend` field of the connector cronjob to `true`.
     *
     * @apiParam (path) {string} id Connector ID
     *
     * @apiSuccess (response body) {boolean} result will always be `true`.
     *
     * @apiUse GenericError
     */
    router.post(
        "/connectors/:id/stop",
        requireUnconditionalAuthDecision(authDecisionClient, {
            operationUri: "object/connector/update"
        }),
        async (req, res) => {
            try {
                const id = req.params.id;
                await k8sApi.stopConnector(id);
                res.json({ result: true });
            } catch (e) {
                handleError(e, res);
            }
        }
    );

    return router;
}
