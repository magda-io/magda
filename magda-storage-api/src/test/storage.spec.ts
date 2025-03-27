import {} from "mocha";
import sinon from "sinon";
import { expect } from "chai";
import express from "express";
import { Test, Response } from "supertest";
import request from "supertest";
import nock from "nock";
import fs from "fs";
import delay from "magda-typescript-common/src/delay.js";
import AuthorizedRegistryClient, {
    AuthorizedRegistryOptions
} from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";

import jwt from "jsonwebtoken";
import { Client } from "minio";

import createApiRouter from "../createApiRouter.js";
import MagdaMinioClient from "../MagdaMinioClient.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { AuthDecisionReqConfig } from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { UnconditionalTrueDecision } from "magda-typescript-common/src/opa/AuthDecision.js";

/** A random UUID */
const USER_ID = "b1fddd6f-e230-4068-bd2c-1a21844f1598";

/** A gif of a funky banana */
const bananadance: Buffer = fs.readFileSync("src/test/bananadance.gif");

function injectUserId(jwtSecret: string, req: Test): Test {
    const userId = USER_ID;
    const id = jwt.sign({ userId: userId }, jwtSecret);
    return req.set("X-Magda-Session", id);
}

let authDecisionCallLogs: {
    config: AuthDecisionReqConfig;
    jwtToken?: string;
}[] = [];

describe("Storage API tests", () => {
    let app: express.Application;
    const bucketName = "magda-test-bucket";
    const region = "unspecified-region";
    const minioClientOpts = {
        endPoint: process.env["MINIO_HOST"],
        port: Number(process.env["MINIO_PORT"]),
        useSSL: false,
        accessKey: process.env["MINIO_ACCESS_KEY"],
        secretKey: process.env["MINIO_SECRET_KEY"],
        region
    };
    const minioClient = new Client(minioClientOpts);
    const authApiUrl = "http://example.com";
    const registryApiUrl = "http://registry.example.com";
    const jwtSecret = "squirrel";
    let registryScope: nock.Scope;
    let authApiScope: nock.Scope;
    const uploadLimit = "100mb";

    before(async () => {
        try {
            await minioClient.makeBucket(bucketName, region);
            console.log(
                "Bucket created successfully in " + minioClientOpts.region
            );
        } catch (err) {
            if (
                err instanceof Error &&
                "code" in err &&
                err.code === "BucketAlreadyOwnedByYou"
            ) {
                console.log("Bucket already exists");
            } else {
                console.log("Error creating bucket.", err);
            }
        }
    });

    beforeEach(() => {
        app = express();
        const registryOptions: AuthorizedRegistryOptions = {
            baseUrl: registryApiUrl,
            jwtSecret: jwtSecret,
            userId: "00000000-0000-4000-8000-000000000000",
            tenantId: 0,
            maxRetries: 0
        };
        const registryClient = new AuthorizedRegistryClient(registryOptions);
        const authDecisionClient = sinon.createStubInstance(
            AuthDecisionQueryClient
        );
        authDecisionClient.getAuthDecision = authDecisionClient.getAuthDecision.callsFake(
            async (config: AuthDecisionReqConfig, jwtToken?: string) => {
                authDecisionCallLogs.push({
                    config,
                    jwtToken
                });
                return UnconditionalTrueDecision;
            }
        );

        app.use(
            "/v0",
            createApiRouter({
                jwtSecret,
                objectStoreClient: new MagdaMinioClient(minioClientOpts),
                authDecisionClient,
                registryClient,
                tenantId: 0,
                uploadLimit,
                autoCreateBuckets: false,
                defaultBuckets: []
            })
        );
        registryScope = nock(registryApiUrl);
        authApiScope = nock(authApiUrl);
    });

    afterEach(() => {
        authDecisionCallLogs = [];
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
        registryScope.done();
    });

    function mockAuthorization(
        jwtSecret: string,
        req: Test
    ): Promise<Response> {
        const userId = USER_ID;

        authApiScope.get(`/private/users/${userId}`).reply(200, { id: userId });

        const id = jwt.sign({ userId: userId }, jwtSecret);

        return req.set("X-Magda-Session", id);
    }

    describe("Create bucket", () => {
        after(async () => {
            try {
                await minioClient.removeBucket(dummyBucket);
                console.log("Bucket " + dummyBucket + " removed successfully.");
            } catch (err) {
                console.log("Unable to remove bucket: ", err);
            }
        });

        // Random string
        const dummyBucket =
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);

        it("should create a bucket", async () => {
            await mockAuthorization(
                jwtSecret,
                request(app)
                    .put("/v0/" + dummyBucket)
                    .expect(201, {
                        message:
                            "Bucket " +
                            dummyBucket +
                            " created successfully in unspecified-region 🎉"
                    })
            );

            const bucketExists = await minioClient.bucketExists(dummyBucket);

            expect(bucketExists).to.be.true;
        });

        it("should create a bucket when given a region", async () => {
            const name = "neko";
            const region = "australia-southeast1";
            const newOpts = Object.assign({}, minioClientOpts, {
                region: region
            });
            const minioClient = new Client(newOpts);
            try {
                await minioClient.makeBucket(name, region);
                console.log("Bucket created successfully in " + newOpts.region);
            } catch (err) {
                if (
                    err instanceof Error &&
                    "code" in err &&
                    err.code === "BucketAlreadyOwnedByYou"
                ) {
                    console.log("Bucket already exists");
                } else {
                    console.log("Error creating bucket.", err);
                }
            }
            // delay 500ms in case check bucket too quick
            await delay(500);
            const bucketExists = await minioClient.bucketExists(name);
            expect(bucketExists).to.be.true;
        });

        it("should return 201 if bucket already exists", () => {
            return mockAuthorization(
                jwtSecret,
                request(app)
                    .put("/v0/" + dummyBucket)
                    .expect(201, {
                        message: "Bucket " + dummyBucket + " already exists 👍"
                    })
            );
        });
    });

    describe("Upload via POST", () => {
        const csvContent = fs.readFileSync("src/test/test_csv_1.csv", "utf-8");

        it("should result in the upload file being present in minio", async () => {
            registryScope
                .get(
                    "/records/inFull/magda-ds-eb747545-c298-46a6-904f-4b711a4eb319"
                )
                .reply(200, {
                    id: "magda-ds-eb747545-c298-46a6-904f-4b711a4eb319",
                    aspects: {
                        test1: {}
                    }
                })
                .persist();

            await mockAuthorization(
                jwtSecret,
                request(app)
                    .post(
                        "/v0/upload/" +
                            bucketName +
                            "?recordId=magda-ds-eb747545-c298-46a6-904f-4b711a4eb319"
                    )
                    .attach("text", "src/test/test_csv_1.csv")
                    .accept("csv")
                    .expect(200)
            );

            expect(authDecisionCallLogs.length).gte(1);
            authDecisionCallLogs.forEach((item) => {
                // should include record context data
                expect(item?.config?.input?.object?.record?.id).to.equal(
                    "magda-ds-eb747545-c298-46a6-904f-4b711a4eb319"
                );

                // should include file meta data
                expect(
                    item?.config?.input?.storage?.object?.bucketName
                ).to.equal(bucketName);
                expect(item?.config?.input?.storage?.object?.name).to.equal(
                    "test_csv_1.csv"
                );
            });

            await mockAuthorization(
                jwtSecret,
                request(app)
                    .post("/v0/upload/" + bucketName)
                    .attach("image", bananadance, "bananadance.gif")
                    .accept("gif")
                    .expect(200)
            );

            await injectUserId(
                jwtSecret,
                request(app)
                    .get("/v0/" + bucketName + "/bananadance.gif")
                    .accept("gif")
                    .expect(200)
                    .expect(bananadance)
            );

            await injectUserId(
                jwtSecret,
                request(app)
                    .get("/v0/" + bucketName + "/test_csv_1.csv")
                    .accept("csv")
                    .expect(200)
                    .expect(csvContent)
            );
        });

        it("should allow arbitrary depth for file paths", async () => {
            await mockAuthorization(
                jwtSecret,
                request(app)
                    .post("/v0/upload/" + bucketName + "/this/is/a/deep/path")
                    .attach("text", "src/test/test_csv_1.csv")
                    .expect(200)
            );

            await injectUserId(
                jwtSecret,
                request(app)
                    .get(
                        "/v0/" +
                            bucketName +
                            "/this/is/a/deep/path/test_csv_1.csv"
                    )
                    .accept("csv")
                    .expect(200)
                    .expect(csvContent)
            );
        });

        it("should fail with 400 if it contains no files", () => {
            return mockAuthorization(
                jwtSecret,
                request(app)
                    .post("/v0/upload/" + bucketName)
                    .field("originalname", "test-browser-upload-1")
                    .expect(400)
            );
        });
    });

    describe("PUT", () => {
        it("should result in the file being downloadable", async () => {
            await mockAuthorization(
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/upload-test-file-admin")
                    .set("Accept", "application/json")
                    .set("Content-Type", "text/plain")
                    .send("LALALALALALALALALA")
                    .expect(200)
            );

            await injectUserId(
                jwtSecret,
                request(app)
                    .get("/v0/" + bucketName + "/upload-test-file-admin")
                    .expect(200)
                    .expect("LALALALALALALALALA")
            );
        });

        it("should return 400 if we do something incompatible with minio", () => {
            // Here we PUT a complete null body with no details, something that's
            // only likely to happen through postman or curl. Minio / node's stream
            // api won't allow this, so we can test that we're catching that error
            // properly.
            return mockAuthorization(
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/download-test-file-2")
                    .set("Content-Length", "0")
                    .send()
                    .expect(400)
            );
        });
    });

    describe("Download and PUT", () => {
        describe("should work for content type: ", () => {
            it("Empty content", () => {
                return mockAuthorization(
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/download-test-file-2")
                        .set("Accept", "application/json")
                        .set("Content-Type", "text/plain")
                        .send("")
                        .expect(200)
                ).then((_res) => {
                    return injectUserId(
                        jwtSecret,
                        request(app)
                            .get("/v0/" + bucketName + "/download-test-file-2")
                            .set("Accept", "application/json")
                            .set("Accept", "text/plain")
                            .expect(200)
                            .expect("")
                            .expect("Content-Type", "text/plain")
                    );
                });
            });

            it("JPG Image", () => {
                const img: Buffer = fs.readFileSync("src/test/test_image.jpg");
                return mockAuthorization(
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/binary-content-jpg")
                        .set("Accept", "image/jpg")
                        .set("Content-Type", "image/jpg")
                        .send(img)
                        .expect(200)
                ).then((_res) => {
                    return injectUserId(
                        jwtSecret,
                        request(app)
                            .get("/v0/" + bucketName + "/binary-content-jpg")
                            .set("Accept", "image/jpg")
                            .expect(200)
                            .expect(img)
                            .expect("Content-Type", "image/jpg")
                    );
                });
            });

            it("Bananadance GIF", () => {
                return mockAuthorization(
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/binary-content-gif")
                        .set("Accept", "image/gif")
                        .set("Content-Type", "image/gif")
                        .send(bananadance)
                        .expect(200)
                ).then((_res) => {
                    return injectUserId(
                        jwtSecret,
                        request(app)
                            .get("/v0/" + bucketName + "/binary-content-gif")
                            .set("Accept", "image/gif")
                            .responseType("blob")
                            .expect(200)
                            .expect(bananadance)
                            .expect("Content-Type", "image/gif")
                    );
                });
            });

            it("CSV File", () => {
                const csvContent = fs.readFileSync(
                    "src/test/test_csv_1.csv",
                    "utf-8"
                );
                return mockAuthorization(
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/test-csv-1")
                        .set("Content-Type", "text/csv")
                        .send(csvContent)
                        .expect(200)
                ).then((_res) => {
                    return injectUserId(
                        jwtSecret,
                        request(app)
                            .get("/v0/" + bucketName + "/test-csv-1")
                            .set("Accept", "text/csv")
                            .expect(200)
                            .expect(csvContent)
                            .expect("Content-Type", "text/csv")
                    );
                });
            });

            it("JSON File", () => {
                const jsonContent = fs.readFileSync(
                    "src/test/test_json_1.json",
                    "utf-8"
                );
                return mockAuthorization(
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/test-json-1")
                        .set("Content-Type", "application/json")
                        .send(jsonContent)
                        .expect(200)
                ).then((_res) => {
                    return injectUserId(
                        jwtSecret,
                        request(app)
                            .get("/v0/" + bucketName + "/test-json-1")
                            .set("Accept", "application/json")
                            .expect(200)
                            .expect(jsonContent)
                            .expect("Content-Type", "application/json")
                    );
                });
            });
        });

        it("arbitrary directory depths", () => {
            const img: Buffer = fs.readFileSync("src/test/test_image.jpg");
            return mockAuthorization(
                jwtSecret,
                request(app)
                    .put(
                        "/v0/" +
                            bucketName +
                            "/this/is/a/path/binary-content-jpg"
                    )
                    .set("Accept", "image/jpg")
                    .set("Content-Type", "image/jpg")
                    .send(img)
                    .expect(200)
            ).then((_res) => {
                return injectUserId(
                    jwtSecret,
                    request(app)
                        .get(
                            "/v0/" +
                                bucketName +
                                "/this/is/a/path/binary-content-jpg"
                        )
                        .set("Accept", "image/jpg")
                        .expect(200)
                        .expect("Content-Type", "image/jpg")
                );
            });
        });
    });

    describe("Delete", () => {
        describe("deleting a file should result in it returning 404 for", () => {
            it("a simple file", () => {
                return mockAuthorization(
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/delete-test-file-1")
                        .set("Accept", "application/json")
                        .set("Content-Type", "text/plain")
                        .send("Testing delete")
                        .expect(200)
                ).then((_res) => {
                    return mockAuthorization(
                        jwtSecret,
                        request(app)
                            .delete("/v0/" + bucketName + "/delete-test-file-1")
                            .expect(200)
                            .expect({ deleted: true })
                    ).then((_res) => {
                        return request(app)
                            .get("/v0/" + bucketName + "/delete-test-file-1")
                            .set("Accept", "application/json")
                            .set("Accept", "text/plain")
                            .expect(404);
                    });
                });
            });

            it("arbitrary directory depths", () => {
                return mockAuthorization(
                    jwtSecret,
                    request(app)
                        .put(
                            "/v0/" +
                                bucketName +
                                "/path/path/path/delete-test-file-1"
                        )
                        .set("Accept", "application/json")
                        .set("Content-Type", "text/plain")
                        .send("Testing delete")
                        .expect(200)
                ).then((_res) => {
                    return mockAuthorization(
                        jwtSecret,
                        request(app)
                            .delete(
                                "/v0/" +
                                    bucketName +
                                    "/path/path/path/delete-test-file-1"
                            )
                            .expect(200)
                            .expect({ deleted: true })
                    ).then((_res) => {
                        return request(app)
                            .get("/v0/" + bucketName + "/delete-test-file-1")
                            .set("Accept", "application/json")
                            .set("Accept", "text/plain")
                            .expect(404);
                    });
                });
            });

            it("empty content", () => {
                return mockAuthorization(
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/delete-test-file-2")
                        .set("Accept", "application/json")
                        .set("Content-Type", "text/plain")
                        .send("")
                        .expect(200)
                ).then((_res) => {
                    return mockAuthorization(
                        jwtSecret,
                        request(app)
                            .delete("/v0/" + bucketName + "/delete-test-file-2")
                            .expect(200)
                            .expect({ deleted: true })
                    ).then((_res) => {
                        return request(app)
                            .get("/v0/" + bucketName + "/delete-test-file-2")
                            .set("Accept", "application/json")
                            .set("Accept", "text/plain")
                            .expect(404);
                    });
                });
            });

            it("Deleting non-existent file should simply return 200", () => {
                return mockAuthorization(
                    jwtSecret,
                    request(app)
                        .delete(
                            "/v0/" + bucketName + "/nonexistent-file-dfijgy45"
                        )
                        .expect(200)
                );
            });
        });

        it("should response 200 when deletes not exists file", async () => {
            await mockAuthorization(
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/delete-test-file-1")
                    .set("Accept", "application/json")
                    .set("Content-Type", "text/plain")
                    .send("Testing delete")
                    .expect(200)
            );
            await mockAuthorization(
                jwtSecret,
                request(app)
                    .delete("/v0/" + bucketName + "/delete-test-file-1")
                    .expect(200)
                    .expect({ deleted: true })
            );
            await request(app)
                .get("/v0/" + bucketName + "/delete-test-file-1")
                .set("Accept", "application/json")
                .set("Accept", "text/plain")
                .expect(404);

            // delete again should response 200 with `deleted` field set to `false`
            await request(app)
                .delete("/v0/" + bucketName + "/delete-test-file-1")
                .expect(200)
                .expect({ deleted: false });
        });
    });
});
