import * as request from "supertest";
import * as fixtures from "./fixtures";
import mockAuthorization from "@magda/typescript-common/dist/test/mockAuthorization";
import { State, ConnectorState, ConfigState, JobState } from "./arbitraries";
import * as express from "express";
import * as nock from "nock";
import * as _ from "lodash";

export function getConnectors(
    app: express.Application,
    isAdmin: boolean = true
): Promise<request.Response> {
    return mockAuthorization(
        "http://admin.example.com",
        isAdmin,
        request(app).get("/connectors")
    );
}

export function getBasicState(connectorName: string = "connector"): State {
    return getStateForStatus("active", connectorName);
}

export function getStateForStatus(
    status: string,
    connectorName: string = "connector"
): State {
    return {
        [connectorName]: {
            config: {
                type: "type",
                name: "name",
                sourceUrl: "sourceUrl"
            },
            job: {
                startTime: "startTime",
                completionTime: "completionTime",
                status
            }
        }
    };
}

export function mockConnectorConfig(
    k8sApiScope: nock.Scope,
    statusCode: number,
    state?: State,
    optionally: boolean = false
) {
    const req = k8sApiScope.get(
        "/api/v1/namespaces/default/configmaps/connector-config"
    );

    if (optionally) {
        req.optionally();
    }

    return req.reply(
        statusCode,
        statusCode === 200
            ? fixtures.getConfigMap(_(state)
                  .mapValues((value: ConnectorState) => value.config)
                  .pickBy(_.identity)
                  .value() as { [id: string]: ConfigState })
            : "fail"
    );
}

export function mockJobs(
    k8sApiScope: nock.Scope,
    statusCode: number,
    state?: State
) {
    k8sApiScope.get("/apis/batch/v1/namespaces/default/jobs").reply(
        statusCode,
        statusCode === 200
            ? fixtures.getJobs(_(state)
                  .mapValues((value: ConnectorState) => value.job)
                  .pickBy(_.identity)
                  .value() as { [id: string]: JobState })
            : "fail"
    );
}
export function mockJobStatus(
    k8sApiScope: nock.Scope,
    statusCode: number,
    name: string,
    state?: State,
    optionally: boolean = false
) {
    const req = k8sApiScope.get(
        `/apis/batch/v1/namespaces/default/jobs/connector-${name}/status`
    );

    if (optionally) {
        req.optionally();
    }

    return req.reply(
        statusCode,
        statusCode === 200
            ? fixtures.getJobs(_(state)
                  .mapValues((value: ConnectorState) => value.job)
                  .pickBy(_.identity)
                  .value() as { [id: string]: JobState }) as any
            : "fail"
    );
}

export function putConnector(
    app: express.Application,
    id: string,
    body: any,
    isAdmin: boolean = true
): Promise<request.Response> {
    return mockAuthorization(
        "http://admin.example.com",
        isAdmin,
        request(app)
            .put(`/connectors/${id}`)
            .send(body)
    );
}

export function deleteConnector(
    app: express.Application,
    id: string,
    isAdmin: boolean = true
): Promise<request.Response> {
    return mockAuthorization(
        "http://admin.example.com",
        isAdmin,
        request(app).delete(`/connectors/${id}`)
    );
}

export function mockDeleteJob(
    k8sApiScope: nock.Scope,
    statusCode: number,
    id: string
) {
    k8sApiScope
        .delete(`/apis/batch/v1/namespaces/default/jobs/connector-${id}`, {
            kind: "DeleteOptions",
            apiVersion: "batch/v1",
            propagationPolicy: "Background"
        })
        .reply(statusCode, {
            code: statusCode
        });
}

export function mockCreateJob(
    k8sApiScope: nock.Scope,
    statusCode: number,
    body?: any,
    optionally: boolean = false
) {
    const req = k8sApiScope.post(
        `/apis/batch/v1/namespaces/default/jobs`,
        body
    );

    if (optionally) {
        req.optionally();
    }

    return req.reply(statusCode, {});
}

export function startConnector(
    app: express.Application,
    id: string,
    isAdmin: boolean = true
): Promise<request.Response> {
    return mockAuthorization(
        "http://admin.example.com",
        isAdmin,
        request(app).post(`/connectors/${id}/start`)
    );
}
