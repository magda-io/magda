import {} from "mocha";
import sinon from "sinon";
import express from "express";
import _ from "lodash";
import { Test, Response } from "supertest";
import request from "supertest";
import nock from "nock";
import fs from "fs";

const jwt = require("jsonwebtoken");
const Minio = require("minio");

import createApiRouter from "../createApiRouter";
import MagdaMinioClient from "../MagdaMinioClient";

/** A random UUID */
const USER_ID = "b1fddd6f-e230-4068-bd2c-1a21844f1598";

/** A gif of a funky banana */
const bananadance: Buffer = fs.readFileSync("src/test/bananadance.gif");

export default function mockAuthorization(
    authApiUrl: string,
    isAdmin: boolean,
    jwtSecret: string,
    req: Test
): Promise<Response> {
    const userId = USER_ID;
    const scope = nock(authApiUrl, { allowUnmocked: true });

    scope.get(`/private/users/${userId}`).reply(200, { isAdmin });

    const id = jwt.sign({ userId: userId }, jwtSecret);

    return req.set("X-Magda-Session", id).then(res => {
        scope.done();
        return res;
    });
}

function injectUserId(jwtSecret: string, req: Test): Promise<Response> {
    const userId = USER_ID;
    const id = jwt.sign({ userId: userId }, jwtSecret);
    return req.set("X-Magda-Session", id).then(res => {
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
        region: "unspecified-region"
    };
    const minioClient = new Minio.Client(minioClientOpts);
    const authApiUrl = "http://example.com";
    const registryApiUrl = "http://registry.example.com";
    const jwtSecret = "squirrel";
    let registryScope: nock.Scope;
    const uploadLimit = "100mb";

    before(() => {
        minioClient.makeBucket(bucketName, (err: Error) => {
            if (err && (err as any).code !== "BucketAlreadyOwnedByYou") {
                return console.log("Error creating bucket.", err);
            }
            console.log(
                "Bucket created successfully in " + minioClientOpts.region
            );
        });
    });

    beforeEach(() => {
        app = express();
        app.use(
            "/v0",
            createApiRouter({
                objectStoreClient: new MagdaMinioClient(minioClientOpts),
                authApiUrl,
                registryApiUrl,
                jwtSecret,
                tenantId: 0,
                uploadLimit
            })
        );
        registryScope = nock(registryApiUrl);
    });

    afterEach(() => {
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
        registryScope.done();
    });

    describe("Create bucket", () => {
        describe("Creating proper buckets", () => {
            after(() => {
                return minioClient.removeBucket(dummyBucket, function(
                    err: Error
                ) {
                    if (err) {
                        return console.log("Unable to remove bucket: ", err);
                    }
                    return console.log(
                        "Bucket " + dummyBucket + " removed successfully."
                    );
                });
            });

            // Random string
            const dummyBucket =
                Math.random()
                    .toString(36)
                    .substring(2, 15) +
                Math.random()
                    .toString(36)
                    .substring(2, 15);
            it("Not an admin", () => {
                return mockAuthorization(
                    authApiUrl,
                    false,
                    jwtSecret,
                    request(app)
                        .put("/v0/" + dummyBucket)
                        .expect(401, "Not authorized.")
                );
            });

            it("As an admin", () => {
                return mockAuthorization(
                    authApiUrl,
                    true,
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
            });

            it("Creating a bucket that already exists", () => {
                return mockAuthorization(
                    authApiUrl,
                    true,
                    jwtSecret,
                    request(app)
                        .put("/v0/" + dummyBucket)
                        .expect(201, {
                            message:
                                "Bucket " + dummyBucket + " already exists 👍"
                        })
                );
            });
        });
    });

    describe("Upload", () => {
        it("as an admin should result in the file being downloadable", () => {
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

        it("without being an admin, should return 401", () => {
            return mockAuthorization(
                authApiUrl,
                false,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/upload-test-file-non-admin")
                    .set("Accept", "application/json")
                    .set("Content-Type", "text/plain")
                    .send("LALALALALALALALALA")
                    .expect(401, "Not authorized.")
            );
        });

        it("Should fail with 401 if the user is not an admin", () => {
            return mockAuthorization(
                authApiUrl,
                false,
                jwtSecret,
                request(app)
                    .post("/v0/upload/" + bucketName)
                    .field("originalname", "test-browser-upload-no-admin")
                    .attach("image", "src/test/test_image.jpg")
                    .expect(401, "Not authorized.")
            );
        });

        it("should succeed if user is an admin", async () => {
            const csvContent = fs.readFileSync(
                "src/test/test_csv_1.csv",
                "utf-8"
            );

            await mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .post("/v0/upload/" + bucketName)
                    .attach("text", "src/test/test_csv_1.csv")
                    .accept("csv")
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

        it("uploading no files should fail with 400", () => {
            return mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .post("/v0/upload/" + bucketName)
                    .field("originalname", "test-browser-upload-1")
                    .expect(400)
            );
        });
    });

    describe("PUT", () => {
        it("should return 500 if we do something incompatible with minio", () => {
            // Here we PUT a complete null body with no details, something that's
            // only likely to happen through postman or curl. Minio / node's stream
            // api won't allow this, so we can test that we're catching that error
            // properly.
            return mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/download-test-file-2")
                    .set("Content-Length", "0")
                    .send()
                    .expect(500)
            );
        });
    });

    describe("Download and PUT", () => {
        describe("should work for content type: ", () => {
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
                    authApiUrl,
                    true,
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/binary-content-jpg")
                        .set("Accept", "image/jpg")
                        .set("Content-Type", "image/jpg")
                        .send(img)
                        .expect(200)
                ).then(_res => {
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
                    authApiUrl,
                    true,
                    jwtSecret,
                    request(app)
                        .put("/v0/" + bucketName + "/binary-content-gif")
                        .set("Accept", "image/gif")
                        .set("Content-Type", "image/gif")
                        .send(bananadance)
                        .expect(200)
                ).then(_res => {
                    return injectUserId(
                        jwtSecret,
                        request(app)
                            .get("/v0/" + bucketName + "/binary-content-gif")
                            .set("Accept", "image/gif")
                            .expect(200)
                            .expect(bananadance)
                            .expect("Content-Type", "image/gif")
                    );
                });
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
                authApiUrl,
                true,
                jwtSecret,
                request(app)
                    .put("/v0/" + bucketName + "/test-json-1")
                    .set("Content-Type", "application/json")
                    .send(jsonContent)
                    .expect(200)
            ).then(_res => {
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

    describe("Delete", () => {
        describe("deleting a file should result in it returning 404 for", () => {
            it("a simple file", () => {
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
                                .get(
                                    "/v0/" + bucketName + "/delete-test-file-1"
                                )
                                .set("Accept", "application/json")
                                .set("Accept", "text/plain")
                                .expect(404);
                        });
                });
            });

            it("empty content", () => {
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
                                .get(
                                    "/v0/" + bucketName + "/delete-test-file-2"
                                )
                                .set("Accept", "application/json")
                                .set("Accept", "text/plain")
                                .expect(404);
                        });
                });
            });

            it("Deleting non-existent file should simply return 200", () => {
                return request(app)
                    .delete("/v0/" + bucketName + "/nonexistent-file-dfijgy45")
                    .expect(200);
            });
        });
    });

    describe("with record auth", () => {
        describe("with a browser upload", () => {
            doAuthTests(uploadFile);
        });

        describe("with a PUT", () => {
            doAuthTests(putFile);
        });

        async function putFile(
            expectedCode: number = 200,
            recordId: string = "storage-test-dataset"
        ) {
            let req = request(app)
                .put("/v0/" + bucketName + "/file.gif")
                .set("Accept", "image/gif")
                .set("Content-Type", "image/gif");

            if (recordId) {
                req.query({ recordId });
            }

            await mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                req.send(bananadance).expect(expectedCode)
            );
        }

        async function uploadFile(
            expectedCode: number = 200,
            recordId: string = "storage-test-dataset"
        ) {
            let req = request(app)
                .post("/v0/upload/" + bucketName)
                .attach("image", bananadance, "file.gif")
                .accept("gif");

            if (recordId) {
                req.query({ recordId });
            }

            await mockAuthorization(
                authApiUrl,
                true,
                jwtSecret,
                req.expect(expectedCode)
            );
        }

        function expectRegistryGetWithCredentials(expectedCode: number = 200) {
            registryScope
                .matchHeader("X-Magda-Session", value => {
                    const verifiedJwt = jwt.verify(value, jwtSecret);

                    return verifiedJwt.userId === USER_ID;
                })
                .get("/records/storage-test-dataset")
                .reply(expectedCode, {
                    id: "storage-test-dataset"
                });
        }

        /**
         * Performs tests that use record auth
         *
         * @param addFile A function that adds a file (could be via upload or PUT)
         */
        function doAuthTests(
            addFile: (expectedCode?: number, recordId?: string) => Promise<void>
        ) {
            it("GET should return a file if the user can access its associated record", async () => {
                // Add the file
                expectRegistryGetWithCredentials();
                await addFile();

                // Download the file
                expectRegistryGetWithCredentials();
                await injectUserId(
                    jwtSecret,
                    request(app)
                        .get("/v0/" + bucketName + "/file.gif")
                        .expect(200)
                        .expect(bananadance)
                        .expect("Content-Type", "image/gif")
                );
            });

            it("GET should return a file if the user can access its associated record, with an id that requires url encoding/decoding", async () => {
                // Add the file
                const expectRegistryCall = () => {
                    registryScope
                        .matchHeader("X-Magda-Session", value => {
                            const verifiedJwt = jwt.verify(value, jwtSecret);

                            return verifiedJwt.userId === USER_ID;
                        })
                        .get(
                            "/records/ds-act-https%3A%2F%2Fwww.data.act.gov.au%2Fapi%2Fviews%2Fgkvf-4ewf"
                        )
                        .reply(200, {
                            id:
                                "ds-act-https://www.data.act.gov.au/api/views/gkvf-4ewf"
                        });
                };

                expectRegistryCall();

                await addFile(
                    200,
                    "ds-act-https%3A%2F%2Fwww.data.act.gov.au%2Fapi%2Fviews%2Fgkvf-4ewf"
                );

                // Download the file
                expectRegistryCall();

                await injectUserId(
                    jwtSecret,
                    request(app)
                        .get("/v0/" + bucketName + "/file.gif")
                        .expect(200)
                        .expect(bananadance)
                        .expect("Content-Type", "image/gif")
                );
            });

            it("should return 404 if requesting the associated record with the users' id returns 404", async () => {
                // Add the file
                expectRegistryGetWithCredentials();
                await addFile();

                // Download the file
                expectRegistryGetWithCredentials(404);
                await injectUserId(
                    jwtSecret,
                    request(app)
                        .get("/v0/" + bucketName + "/file.gif")
                        .expect(404)
                );
            });

            it("should return 500 if an error occurs in the registry", async () => {
                sinon.stub(console, "error");

                // Add the file
                expectRegistryGetWithCredentials(200);
                await addFile();

                // Download the file
                expectRegistryGetWithCredentials(500);
                await injectUserId(
                    jwtSecret,
                    request(app)
                        .get("/v0/" + bucketName + "/file.gif")
                        .expect(500)
                );
            });

            it("without any link to a record id, should work even for an anonymous user", async () => {
                // Add the file
                await addFile(200, null);

                // Download the file
                await request(app)
                    .get("/v0/" + bucketName + "/file.gif")
                    .expect(200)
                    .expect(bananadance)
                    .expect("Content-Type", "image/gif");
            });

            it("should return 400 if the user tries to associate a file with a non-existent or unauthorized record", async () => {
                registryScope
                    .matchHeader("X-Magda-Session", value => {
                        const verifiedJwt = jwt.verify(value, jwtSecret);

                        return verifiedJwt.userId === USER_ID;
                    })
                    .get("/records/storage-test-dataset")
                    .reply(404);

                await addFile(400);
            });

            it("should return 400 if the user tries to associate a file with a non-existent or unauthorized record", async () => {
                registryScope
                    .matchHeader("X-Magda-Session", value => {
                        const verifiedJwt = jwt.verify(value, jwtSecret);

                        return verifiedJwt.userId === USER_ID;
                    })
                    .get("/records/storage-test-dataset")
                    .reply(404);

                await addFile(400);
            });
        }
    });
});
