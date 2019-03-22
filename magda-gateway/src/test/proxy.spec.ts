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
    "/v0/api/registry": "http://registry.example.com/",
    "/preview-map": "http://preview-map.example.com"
};

describe("proxying", () => {
    let app: express.Application;

    before(() => {
        // registryScope = nock(registryUrl);
    });

    after(() => {
        nock.cleanAll();
    });

    beforeEach(() => {
        app = buildApp({
            listenPort: 80,
            externalUrl: "https://example.com",
            dbHost: "localhost",
            dbPort: 5432,
            proxyRoutesJson: "{}",
            helmetJson: "{}",
            cspJson: "{}",
            corsJson: "{}",
            authorizationApi: "https://example.com",
            sessionSecret: "secret",
            jwtSecret: "othersecret",
            userId: "123",
            web: "https://example.com",
            previewMap: "https://preview-map"
        });
    });

    afterEach(() => {
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
    });

    _.map(PROXY_ROOTS, (key, value) => {
        describe(`when proxying ${key} to ${value}`, () => {
            it("doesn't pass auth headers through", () => {
                nock(value)
                    .get("/", null, {
                        badheaders: ["Authorization"]
                    })
                    .reply((uri, body, cb) => {
                        return 200;
                    });

                supertest(app)
                    .get(key)
                    .expect(200);
            });
        });
    });
});
