import {} from "mocha";
import { ApiRouterOptions } from "../createApiRouter";
import { sendMail } from "../mail";

import * as express from "express";
import * as path from "path";

const options = {
    jwtSecret: "squirrel",
    registryUrl: "http://example.com",
    smtpHostname: "smtp.example.com",
    smtpPort: "465",
    smtpSecure: true
};

describe("send mail", () => {
    beforeEach(() => {});

    afterEach(() => {});

    it("should use different templates given different related queries"),
        () => {};

    it("should respond with a successful response if a record was found"),
        () => {};

    it("should respond with an unsuccessful response if a record wasn't found"),
        () => {};
});
