import {} from "mocha";
import sinon from "sinon";
import express from "express";
import _ from "lodash";
import { Test, Response } from "supertest";
import request from "supertest";
import nock from "nock";
const jwt = require("jsonwebtoken");

import createApiRouter from "../createApiRouter";
import MagdaMinioClient from "../MagdaMinioClient";

const Minio = require("minio");

import fs from "fs";

export default function mockAuthorization(
    authApiUrl: string,
    isAdmin: boolean,
    jwtSecret: string,
    req: Test
): Promise<Response> {
    const userId = "1";
    const scope = nock(authApiUrl);

    scope.get(`/private/users/${userId}`).reply(200, { isAdmin });

    const id = jwt.sign({ userId: userId }, jwtSecret);

    return req.set("X-Magda-Session", id).then(res => {
        scope.done();
        return res;
    });
}

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
    const authApiUrl = "http://example.com";
    const jwtSecret = "squirrel";

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
                objectStoreClient: new MagdaMinioClient(minioClientOpts),
                authApiUrl,
                jwtSecret
            })
        );
    });

    afterEach(() => {
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
    });

    describe("Upload", () => {
        describe("Upload a simple file", () => {
            it("As an admin", () => {
                return mockAuthorization(
                    authApiUrl,
                    true,
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/upload-test-file-admin")
                        .set("Accept", "application/json")
                        .set("Content-Type", "text/plain")
                        .send("LALALALALALALALALA")
                        .expect(200)
                );
            });

            it("Not an admin", () => {
                return mockAuthorization(
                    authApiUrl,
                    false,
                    jwtSecret,
                    request(app)
                        .put(
                            "/v0/" + bucketName + "/upload-test-file-non-admin"
                        )
                        .set("Accept", "application/json")
                        .set("Content-Type", "text/plain")
                        .send("LALALALALALALALALA")
                        .expect(401, "Not authorized.")
                );
            });
        });
    });

    describe("Download", () => {
        it("Uploading and then downloading the simple file", () => {
            return mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/download-test-file-1")
                    .set("Accept", "application/json")
                    .set("Content-Type", "text/plain")
                    .send("Testing download")
                    .expect(200)
            ).then(_res => {
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
            return mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/download-test-file-2")
                    .set("Accept", "application/json")
                    .set("Content-Type", "text/plain")
                    .send("")
                    .expect(200)
            ).then(_res => {
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
            return mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/binary-content")
                    .set("Accept", "image/jpg")
                    .set("Content-Type", "image/jpg")
                    .send(img)
                    .expect(200)
            ).then(_res => {
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
            return mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/test-csv-1")
                    .set("Content-Type", "text/csv")
                    .send(csvContent)
                    .expect(200)
            ).then(_res => {
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
            return mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/test-json-1")
                    .set("Content-Type", "application/json")
                    .send(jsonContent)
                    .expect(200)
            ).then(_res => {
                return request(app)
                    .get("/v0/" + bucketName + "/test-json-1")
                    .set("Accept", "application/json")
                    .expect(200)
                    .expect(jsonContent)
                    .expect("Content-Type", "application/json");
            });
        });
    });

    describe("Delete", () => {
        it("Uploading and then deleting a simple file", () => {
            return mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/delete-test-file-1")
                    .set("Accept", "application/json")
                    .set("Content-Type", "text/plain")
                    .send("Testing delete")
                    .expect(200)
            ).then(_res => {
                return request(app)
                    .delete("/v0/" + bucketName + "/delete-test-file-1")
                    .expect(200)
                    .expect({ message: "File deleted successfully" })
                    .then(_res => {
                        return request(app)
                            .get("/v0/" + bucketName + "/delete-test-file-1")
                            .set("Accept", "application/json")
                            .set("Accept", "text/plain")
                            .expect(404);
                    });
            });
        });

        it("Uploading and then deleting : Empty content", () => {
            return mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/delete-test-file-2")
                    .set("Accept", "application/json")
                    .set("Content-Type", "text/plain")
                    .send("")
                    .expect(200)
            ).then(_res => {
                return request(app)
                    .delete("/v0/" + bucketName + "/delete-test-file-2")
                    .expect(200)
                    .expect({ message: "File deleted successfully" })
                    .then(_res => {
                        return request(app)
                            .get("/v0/" + bucketName + "/delete-test-file-2")
                            .set("Accept", "application/json")
                            .set("Accept", "text/plain")
                            .expect(404);
                    });
            });
        });

        it("Deleting non-existent file", () => {
            return request(app)
                .delete("/v0/" + bucketName + "/nonexistent-file-dfijgy45")
                .expect(200);
        });
    });
});
