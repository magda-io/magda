import {} from "mocha";
import * as request from "supertest";
import * as express from "express";
import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import fakeArgv from "@magda/typescript-common/dist/test/fakeArgv";
import createApiRouter from "../createApiRouter";

import mockDatabase from "./mockDatabase";
import Database from "../Database";

const IMAGE_FORMATS_SUPPORTED = ["png", "gif", "svg"];

describe("Content api router", function(this: Mocha.ISuiteCallbackContext) {
    let app: express.Express;
    let argv: any;
    let agent: request.SuperTest<request.Test>;

    before(function() {
        argv = retrieveArgv();
        app = buildExpressApp();
        agent = request.agent(app);
    });

    function retrieveArgv() {
        const argv = addJwtSecretFromEnvVar(
            fakeArgv({
                listenPort: 6999,
                dbHost: "localhost",
                dbPort: 5432,
                jwtSecret: "squirrel"
            })
        );
        return argv;
    }

    function buildExpressApp() {
        const apiRouter = createApiRouter({
            jwtSecret: argv.jwtSecret,
            database: new mockDatabase() as Database
        });

        const app = express();
        app.use(require("body-parser").json());
        app.use(apiRouter);

        return app;
    }

    describe("GET /:contentId.:format", () => {
        it("should return data for existing - text", done => {
            agent
                .get("/text-1.text")
                .expect(200, "ass")
                .expect("Content-Type", /^text\/plain/)
                .end(done);
        });

        it("should return data for existing - json - as text", done => {
            agent
                .get("/json-1.text")
                .expect(200, "null")
                .expect("Content-Type", /^text\/plain/)
                .end(done);
        });

        it("should return data for existing - json - as json", done => {
            agent
                .get("/json-2.json")
                .expect(200, { acdc: "test" })
                .expect("Content-Type", /^application\/json/)
                .end(done);
        });

        IMAGE_FORMATS_SUPPORTED.forEach(format => {
            it(`should return data for existing - ${format} - as ${format}`, done => {
                agent
                    .get(`/${format}-id.bin`)
                    .expect(200)
                    .end(done);
            });
        });

        it("should return 404 for non-existant", done => {
            agent
                .get("/json-3.json")
                .expect(404)
                .end(done);
        });

        it("should return 500 for other errors", done => {
            agent
                .get("/svg-id.json")
                .expect(500)
                .end(done);
        });
    });
});
