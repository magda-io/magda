import {} from "mocha";
import sinon from "sinon";
import express from "express";
import _ from "lodash";
import request from "supertest";

import createApiRouter from "../createApiRouter";
import MagdaMinioClient from "../MagdaMinioClient";

const Minio = require("minio");

import fs from "fs";

describe("Storage API tests", () => {
    let app: express.Application;
    const minioClientOpts = {
        endPoint: process.env["MINIO_HOST"],
        port: Number(process.env["MINIO_PORT"]),
        useSSL: false,
        accessKey: process.env["MINIO_ACCESS_KEY"],
        secretKey: process.env["MINIO_SECRET_KEY"],
        bucket: "magda-test-1"
    };
    const minioClient = new Minio.Client(minioClientOpts);

    before(() => {
        minioClient.makeBucket(minioClientOpts.bucket, (err: Error) => {
            if (err) {
                return console.log("Error creating bucket.", err);
            }
            console.log('Bucket created successfully in "us-east-1".');
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
                .put("/v0/upload-test-file")
                .set("Accept", "application/json")
                .set("Content-Type", "text/plain")
                .send("LALALALALALALALALA")
                .expect(200);
        });
    });

    describe("Download", () => {
        it("Uploading and then downloading the simple file", function() {
            return request(app)
                .put("/v0/download-test-file-1")
                .set("Accept", "application/json")
                .set("Content-Type", "text/csv")
                .send("Testing download")
                .expect(200)
                .then(_res => {
                    return request(app)
                        .get("/v0/download-test-file-1")
                        .set("Accept", "application/json")
                        .set("Accept", "text/plain")
                        .expect(200)
                        .expect("Testing download");
                });
        });

        it("Empty content", function() {
            return request(app)
                .put("/v0/download-test-file-2")
                .set("Accept", "application/json")
                .set("Content-Type", "text/plain")
                .send("")
                .expect(200)
                .then(_res => {
                    return request(app)
                        .get("/v0/download-test-file-2")
                        .set("Accept", "application/json")
                        .set("Accept", "text/plain")
                        .expect(200)
                        .expect("");
                });
        });
        it("Binary content", function() {
            const img: Buffer = fs.readFileSync("src/test/test_image.jpg");
            return request(app)
                .put("/v0/binary-content")
                .set("Accept", "image/jpg")
                .set("Content-Type", "image/jpg")
                .send(img)
                .expect(200)
                .then(_res => {
                    return request(app)
                        .get("/v0/binary-content")
                        .set("Accept", "image/jpg")
                        .expect(200)
                        .expect(img);
                });
        });
    });
});
