import {} from "mocha";
import * as sinon from "sinon";
import * as express from "express";
import * as nock from "nock";
import * as _ from "lodash";
import * as supertest from "supertest";

import createApiRouter from "../createApiRouter";
import MagdaMinioClient from "../MagdaMinioClient";

console.log(createApiRouter);

describe("proxying", () => {
    let app: express.Application;

    // after(() => {
    //     nock.cleanAll();
    // });

    beforeEach(() => {
        app = express();
        app.use(
            "/v0",
            createApiRouter({
                objectStoreClient: new MagdaMinioClient({
                    endPoint: "localhost",
                    port: 9000,
                    useSSL: false,
                    accessKey: "magdaminioaccesskey",
                    secretKey: "cricketmoroccobengreenturmeric",
                    bucket: "magda-test-1"
                })
            })
        );
    });

    afterEach(() => {
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
    });

    describe("Upload", () => {
        it("Uploading a simple file", () => {
            return supertest(app)
                .put("/v0/test-file")
                .set("Accept", "application/json")
                .set("Content-Type", "text/csv")
                .send("LALALALALALALALALA")
                .expect(200);
        });
    });
});
