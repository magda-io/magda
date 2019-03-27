import {} from "mocha";
import * as sinon from "sinon";
import * as express from "express";
// import { expect } from "chai";
import * as nock from "nock";
import * as _ from "lodash";
import * as supertest from "supertest";
// import * as URI from "urijs";

import buildApp from "../buildApp";

const PROXY_ROOTS = {
    "/api/v0/registry": "http://registry",
    "/preview-map": "http://preview-map/"
};

describe("proxying", () => {
    let app: express.Application;

    before(() => {
        // registryScope = nock(registryUrl);
        // nock.disableNetConnect();
    });

    after(() => {
        nock.cleanAll();
        // nock.enableNetConnect();
    });

    beforeEach(() => {
        app = buildApp({
            listenPort: 80,
            externalUrl: "http://127.0.0.1",
            dbHost: "localhost",
            dbPort: 5432,
            proxyRoutesJson: {
                registry: {
                    to: "http://registry",
                    auth: true
                }
            },
            helmetJson: "{}",
            cspJson: "{}",
            corsJson: "{}",
            authorizationApi: "http://127.0.0.1",
            sessionSecret: "secret",
            jwtSecret: "othersecret",
            userId: "123",
            web: "https://127.0.0.1",
            previewMap: "http://preview-map"
        });
    });

    afterEach(() => {
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
    });

    _.map(PROXY_ROOTS, (value, key) => {
        describe(`when proxying ${key} to ${value}`, () => {
            it("proxies requests", () => {
                nock(value)
                    .get("/")
                    .reply(200);

                return supertest(app)
                    .get(key)
                    .expect(200);
            });

            it("doesn't pass auth headers through", () => {
                nock(value, {
                    badheaders: ["Authorization"]
                })
                    .get("/")
                    .reply(200);

                return supertest(app)
                    .get(key)
                    .set("Authorization", "blah")
                    .expect(200);
            });
        });
    });
});
