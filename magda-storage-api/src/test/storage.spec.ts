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
    const bucketName = "magda-test-bucket";
    const minioClientOpts = {
        endPoint: process.env["MINIO_HOST"],
        port: Number(process.env["MINIO_PORT"]),
        useSSL: false,
        accessKey: process.env["MINIO_ACCESS_KEY"],
        secretKey: process.env["MINIO_SECRET_KEY"],
        region: "us-east-1"
    };
    const minioClient = new Minio.Client(minioClientOpts);

    before(() => {
        minioClient.makeBucket(bucketName, (err: Error) => {
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
                .put("/v0/" + bucketName + "/upload-test-file")
                .set("Accept", "application/json")
                .set("Content-Type", "text/plain")
                .send("LALALALALALALALALA")
                .expect(200);
        });
    });

    describe("Download", () => {
        it("Uploading and then downloading the simple file", () => {
            return request(app)
                .put("/v0/" + bucketName + "/download-test-file-1")
                .set("Accept", "application/json")
                .set("Content-Type", "text/plain")
                .send("Testing download")
                .expect(200)
                .then(_res => {
                    return request(app)
                        .get("/v0/" + bucketName + "/download-test-file-1")
                        .set("Accept", "application/json")
                        .set("Accept", "text/plain")
                        .expect(200)
                        .expect("Testing download")
                        .expect("Content-Type", "text/plain");
                });
        });

        it("Empty content", () => {
            return request(app)
                .put("/v0/" + bucketName + "/download-test-file-2")
                .set("Accept", "application/json")
                .set("Content-Type", "text/plain")
                .send("")
                .expect(200)
                .then(_res => {
                    return request(app)
                        .get("/v0/" + bucketName + "/download-test-file-2")
                        .set("Accept", "application/json")
                        .set("Accept", "text/plain")
                        .expect(200)
                        .expect("")
                        .expect("Content-Type", "text/plain");
                });
        });

        it("Binary content", () => {
            const img: Buffer = fs.readFileSync("src/test/test_image.jpg");
            return request(app)
                .put("/v0/" + bucketName + "/binary-content")
                .set("Accept", "image/jpg")
                .set("Content-Type", "image/jpg")
                .send(img)
                .expect(200)
                .then(_res => {
                    return request(app)
                        .get("/v0/" + bucketName + "/binary-content")
                        .set("Accept", "image/jpg")
                        .expect(200)
                        .expect(img)
                        .expect("Content-Type", "image/jpg");
                });
        });
        it("CSV File", () => {
            const csvContent = fs.readFileSync(
                "src/test/test_csv_1.csv",
                "utf-8"
            );
            return request(app)
                .put("/v0/" + bucketName + "/test-csv-1")
                .set("Content-Type", "text/csv")
                .send(csvContent)
                .expect(200)
                .then(_res => {
                    return request(app)
                        .get("/v0/" + bucketName + "/test-csv-1")
                        .set("Accept", "text/csv")
                        .expect(200)
                        .expect(csvContent)
                        .expect("Content-Type", "text/csv");
                });
        });
        it("JSON File", () => {
            const jsonContent = fs.readFileSync(
                "src/test/test_json_1.json",
                "utf-8"
            );
            return request(app)
                .put("/v0/" + bucketName + "/test-json-1")
                .set("Content-Type", "application/json")
                .send(jsonContent)
                .expect(200)
                .then(_res => {
                    return request(app)
                        .get("/v0/" + bucketName + "/test-json-1")
                        .set("Accept", "application/json")
                        .expect(200)
                        .expect(jsonContent)
                        .expect("Content-Type", "application/json");
                });
        });
    });
});
