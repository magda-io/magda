import {} from "mocha";
import { ApiRouterOptions } from "../createApiRouter";
import { DatasetMessage } from "../model";
// import { assert } from "chai";

import createApiRouter from "../createApiRouter";
// import Registry from "@magda/typescript-common/dist/registry/RegistryClient";

import * as supertest from "supertest";
import * as mockery from "mockery";
import * as nock from "nock";
import * as express from "express";

const nodemailerMock = require("nodemailer-mock");
const registryUrl: string = "https://registry.example.com";
// const registry = new Registry({
//     baseUrl: registryUrl,
//     maxRetries: 0
// });
const routerOpts: ApiRouterOptions = {
    jwtSecret: "squirrel",
    registryUrl: registryUrl,
    smtpHostname: "smtp.example.com",
    smtpPort: 465,
    smtpSecure: true
};
const DATA: DatasetMessage = {
    senderName: "Bob Cunningham",
    senderEmail: "bob.cunningham@example.com",
    message: "Give me this dataset!"
};

describe("send mail", () => {
    let router: express.Router = createApiRouter(routerOpts);
    let registryScope: nock.Scope;

    beforeEach(() => {
        registryScope = nock(registryUrl);
    });

    before(() => {
        mockery.enable({
            warnOnUnregistered: false
        });

        mockery.registerMock("nodemailer", nodemailerMock);
    });

    afterEach(() => {
        nodemailerMock.mock.reset();
        registryScope.done();
        registryScope.removeAllListeners();
    });

    after(() => {
        mockery.deregisterAll();
        mockery.disable();
    });

    it("should use different templates given different related queries"),
        () => {};

    it("should respond with an unsuccessful response if record is invalid"),
        (done: any) => {
            return supertest(router)
                .post("/public/send/dataset/request")
                .set({
                    "Content-Type": "application/json"
                })
                .send({
                    senderName: DATA.senderName,
                    senderEmail: DATA.senderEmail,
                    message: DATA.message,
                    datasetId: "ds-abc123"
                })
                .expect(500, done);
        };

    it("should respond with an successful response if record is valid"),
        () => {
            registryScope
                .get("/records?aspect=dcat-dataset-strings&id=ds-abc123")
                .reply(200, {
                    agencyName: "Test Agency",
                    agencyContact: "Test Agency Contact",
                    dataset: "Test dataset"
                });
        };
});
