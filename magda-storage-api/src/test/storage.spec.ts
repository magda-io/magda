import {} from "mocha";
import * as sinon from "sinon";
import * as express from "express";
import * as _ from "lodash";
import * as request from "supertest";

import createApiRouter from "../createApiRouter";
import MagdaMinioClient from "../MagdaMinioClient";

const Minio = require("minio");

console.log(createApiRouter);

describe("Storage API tests", () => {
    let app: express.Application;
    const minioClientOpts = {
        endPoint: process.env["MINIO_HOST"],
        port: process.env["MINIO_PORT"],
        useSSL: false,
        accessKey: process.env["MINIO_ACCESS_KEY"],
        secretKey: process.env["MINIO_SECRET_KEY"],
        bucket: "magda-test-1"
    };
    const minioClient = new Minio.Client(minioClientOpts);
    console.log("The client opts: ", minioClientOpts);

    before(() => {
        minioClient.makeBucket(minioClientOpts.bucket, function(err: Error) {
            if (err) {
                return console.log("Error creating bucket.", err);
            }
            console.log('Bucket created successfully in "us-east-1".');
        });
    });

    after(() => {
        minioClient.removeBucket(minioClientOpts.bucket, function(err: Error) {
            if (err) {
                return console.log("unable to remove bucket: ", err);
            }
            console.log("Bucket removed successfully.");
        });
    });

    beforeEach(() => {
        app = express();
        app.use(
            "/v0",
            createApiRouter({
                objectStoreClient: new MagdaMinioClient(minioClientOpts)
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
            return request(app)
                .put("/v0/test-file")
                .set("Accept", "application/json")
                .set("Content-Type", "text/plain")
                .send("LALALALALALALALALA")
                .expect(200);
        });
    });

    describe("Download", () => {
        it("Uploading and then downloading the simple file", function() {
            return request(app)
                .put("/v0/test-file")
                .set("Accept", "application/json")
                .set("Content-Type", "text/csv")
                .send("Testing download")
                .expect(200)
                .then(_res => {
                    return request(app)
                        .get("/v0/test-file")
                        .set("Accept", "application/json")
                        .set("Accept", "text/plain")
                        .expect(200)
                        .expect("Testing download");
                });
        });
    });
});
