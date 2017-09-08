import * as request from "supertest";
import * as fixtures from "./fixtures";
import mockAuthorization from "@magda/typescript-common/dist/test/mockAuthorization";
import { State, ConnectorState, ConfigState, JobState } from "./arbitraries";
import * as express from "express";
import * as nock from "nock";
import * as _ from "lodash";

export function doGet(
    app: express.Application,
    isAdmin: boolean = true
): Promise<request.Response> {
    return mockAuthorization(
        "http://admin.example.com",
        isAdmin,
        request(app).get("/connectors")
    );
}

export function getStateForStatus(status: string): State {
    return {
        connector: {
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

export function setupNock(k8sApiScope: nock.Scope, state: State) {
    mockConnectorConfig(k8sApiScope, 200, state);
    mockJobs(k8sApiScope, 200, state);
}

export function mockConnectorConfig(
    k8sApiScope: nock.Scope,
    statusCode: number,
    state?: State
) {
    k8sApiScope
        .get("/api/v1/namespaces/default/configmaps/connector-config")
        .reply(
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
