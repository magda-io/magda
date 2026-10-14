import {} from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Client } from "minio";
import createApiRouter from "../createApiRouter.js";
import MagdaMinioClient from "../MagdaMinioClient.js";
import { signUploadToken, verifyUploadToken } from "../multipartToken.js";
import AuthorizedRegistryClient, {
    AuthorizedRegistryOptions
} from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { AuthDecisionReqConfig } from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import {
    UnconditionalTrueDecision,
    UnconditionalFalseDecision
} from "magda-typescript-common/src/opa/AuthDecision.js";

const jwtSecret = "squirrel";
const USER_A = "b1fddd6f-e230-4068-bd2c-1a21844f1598";
const USER_B = "6a7c9e2d-4f1b-4d3a-8c5e-0f2b1a9d8e7c";
/** a user with `storage/object/*` permissions without any constraints */
const ADMIN_USER = "00000000-0000-4000-8000-000000000000";

const minioClientOpts = {
    endPoint: process.env["MINIO_HOST"] as string,
    port: Number(process.env["MINIO_PORT"]),
    useSSL: false,
    accessKey: process.env["MINIO_ACCESS_KEY"] as string,
    secretKey: process.env["MINIO_SECRET_KEY"] as string,
    region: "unspecified-region"
};

function session(userId: string) {
    return jwt.sign({ userId }, jwtSecret);
}

describe("Storage object ownership", () => {
    const bucketName = "magda-ownership-test-bucket";
    const rawClient = new Client(minioClientOpts);
    let app: express.Application;
    let authDecisionInputs: any[] = [];

    before(async () => {
        try {
            await rawClient.makeBucket(bucketName, minioClientOpts.region);
        } catch (e) {
            // ignore
        }
    });

    beforeEach(() => {
        authDecisionInputs = [];
        app = express();
        const registryOptions: AuthorizedRegistryOptions = {
            baseUrl: "http://registry.example.com",
            jwtSecret,
            userId: "00000000-0000-4000-8000-000000000000",
            tenantId: 0,
            maxRetries: 0
        };
        const authDecisionClient = sinon.createStubInstance(
            AuthDecisionQueryClient
        );
        // mirrors the `storage.object` policy rule for a user with ownership constrained permissions:
        // `input.storage.object.ownerId = input.user.id`
        authDecisionClient.getAuthDecision = authDecisionClient.getAuthDecision.callsFake(
            async (config: AuthDecisionReqConfig, jwtToken?: string) => {
                authDecisionInputs.push(config.input);
                const userId = jwtToken
                    ? (jwt.verify(jwtToken, jwtSecret) as any).userId
                    : undefined;
                if (userId === ADMIN_USER) {
                    return UnconditionalTrueDecision;
                }
                const ownerId = config?.input?.storage?.object?.ownerId;
                return userId && ownerId === userId
                    ? UnconditionalTrueDecision
                    : UnconditionalFalseDecision;
            }
        );
        app.use(
            "/v0",
            createApiRouter({
                jwtSecret,
                objectStoreClient: new MagdaMinioClient(minioClientOpts),
                authDecisionClient,
                registryClient: new AuthorizedRegistryClient(registryOptions),
                tenantId: 0,
                uploadLimit: "100mb",
                autoCreateBuckets: false,
                defaultBuckets: [],
                recommendedPartSize: "16mb",
                maxPartSize: "64mb",
                multipartUploadExpiry: "24h",
                incompleteUploadExpiryDays: 7
            })
        );
    });

    function randomKey(name: string) {
        return `owner-test/${crypto.randomUUID()}/${name}`;
    }

    function putObject(key: string, userId: string, content = "hello") {
        return request(app)
            .put(`/v0/${bucketName}/${key}`)
            .set("X-Magda-Session", session(userId))
            .set("Content-Type", "text/plain")
            .send(content);
    }

    function getObject(key: string, userId: string) {
        return request(app)
            .get(`/v0/${bucketName}/${key}`)
            .set("X-Magda-Session", session(userId));
    }

    function deleteObject(key: string, userId: string) {
        return request(app)
            .delete(`/v0/${bucketName}/${key}`)
            .set("X-Magda-Session", session(userId));
    }

    async function initiateMultipart(key: string, userId: string) {
        const res = await request(app)
            .post(`/v0/multipart/initiate/${bucketName}/${key}`)
            .set("X-Magda-Session", session(userId))
            .set("Content-Type", "application/octet-stream");
        return res;
    }

    async function uploadPartAndComplete(
        key: string,
        uploadId: string,
        userId: string
    ) {
        const part = await request(app)
            .put(`/v0/multipart/part/${bucketName}/${key}`)
            .query({ uploadId, partNumber: 1 })
            .set("Content-Type", "application/octet-stream")
            .send(crypto.randomBytes(1024))
            .expect(200);
        return request(app)
            .post(`/v0/multipart/complete/${bucketName}/${key}`)
            .query({ uploadId })
            .set("X-Magda-Session", session(userId))
            .set("Content-Type", "application/json")
            .send({ parts: [{ partNumber: 1, etag: part.body.etag }] });
    }

    async function getStoredMetaData(key: string) {
        const stat = await rawClient.statObject(bucketName, key);
        return stat.metaData;
    }

    describe("PUT upload", () => {
        it("should store the uploader as the owner under `magda-owner-id`", async () => {
            const key = randomKey("file.txt");
            await putObject(key, USER_A).expect(200);
            const metaData = await getStoredMetaData(key);
            expect(metaData["magda-owner-id"]).to.equal(USER_A);
            expect(metaData).to.not.have.property("magda-user-id");
        });

        it("should allow the owner to read, replace & delete the object", async () => {
            const key = randomKey("file.txt");
            await putObject(key, USER_A, "v1").expect(200);
            await getObject(key, USER_A).expect(200, "v1");
            await putObject(key, USER_A, "v2").expect(200);
            await getObject(key, USER_A).expect(200, "v2");
            await deleteObject(key, USER_A).expect(200, { deleted: true });
        });

        it("should deny another user to read, replace or delete the object", async () => {
            const key = randomKey("file.txt");
            await putObject(key, USER_A, "v1").expect(200);
            await getObject(key, USER_B).expect(403);
            await putObject(key, USER_B, "v2").expect(403);
            await deleteObject(key, USER_B).expect(403);
            await getObject(key, USER_A).expect(200, "v1");
            expect((await getStoredMetaData(key))["magda-owner-id"]).to.equal(
                USER_A
            );
        });

        it("should check the existing object's owner (not the uploader) before replacing it", async () => {
            const key = randomKey("file.txt");
            await putObject(key, USER_A).expect(200);
            authDecisionInputs = [];
            await putObject(key, USER_B).expect(403);
            expect(authDecisionInputs.length).to.equal(1);
            expect(authDecisionInputs[0].storage.object.ownerId).to.equal(
                USER_A
            );
            expect(authDecisionInputs[0].storage.object.exists).to.equal(true);
        });

        it("should keep the existing owner when another authorised user replaces the object", async () => {
            const key = randomKey("file.txt");
            await putObject(key, USER_A, "v1").expect(200);
            authDecisionInputs = [];
            await putObject(key, ADMIN_USER, "v2").expect(200);
            // before & after replace
            expect(authDecisionInputs.length).to.equal(2);
            expect(authDecisionInputs[0].storage.object.ownerId).to.equal(
                USER_A
            );
            expect(authDecisionInputs[1].storage.object.ownerId).to.equal(
                USER_A
            );
            expect(authDecisionInputs[0].storage.object.exists).to.equal(true);
            expect(authDecisionInputs[1].storage.object.exists).to.equal(true);
            expect((await getStoredMetaData(key))["magda-owner-id"]).to.equal(
                USER_A
            );
            await getObject(key, USER_A).expect(200, "v2");
        });
    });

    describe("POST (form) upload", () => {
        it("should store the uploader as the owner & apply owner scoped access", async () => {
            const dir = randomKey("dir");
            const key = `${dir}/file.txt`;
            await request(app)
                .post(`/v0/upload/${bucketName}/${dir}`)
                .set("X-Magda-Session", session(USER_A))
                .attach("file", Buffer.from("hello"), "file.txt")
                .expect(200);
            const metaData = await getStoredMetaData(key);
            expect(metaData["magda-owner-id"]).to.equal(USER_A);
            expect(metaData).to.not.have.property("magda-user-id");
            await getObject(key, USER_A).expect(200, "hello");
            await getObject(key, USER_B).expect(403);
            await request(app)
                .post(`/v0/upload/${bucketName}/${dir}`)
                .set("X-Magda-Session", session(USER_B))
                .attach("file", Buffer.from("replaced"), "file.txt")
                .expect(403);
            await deleteObject(key, USER_B).expect(403);
            await deleteObject(key, USER_A).expect(200, { deleted: true });
        });
    });

    describe("Multipart upload", () => {
        it("should store the uploader as the owner & apply owner scoped access", async () => {
            const key = randomKey("big.bin");
            const initRes = await initiateMultipart(key, USER_A);
            expect(initRes.status).to.equal(200);
            expect(
                verifyUploadToken(initRes.body.uploadId, jwtSecret).ownerId
            ).to.equal(USER_A);
            await uploadPartAndComplete(
                key,
                initRes.body.uploadId,
                USER_A
            ).then((res) => expect(res.status).to.equal(200));
            const metaData = await getStoredMetaData(key);
            expect(metaData["magda-owner-id"]).to.equal(USER_A);
            expect(metaData).to.not.have.property("magda-user-id");
            await getObject(key, USER_A).expect(200);
            await getObject(key, USER_B).expect(403);
            await deleteObject(key, USER_B).expect(403);
            await deleteObject(key, USER_A).expect(200, { deleted: true });
        });

        it("should deny another user to initiate a multipart upload replacing the object", async () => {
            const key = randomKey("big.bin");
            await putObject(key, USER_A).expect(200);
            const initRes = await initiateMultipart(key, USER_B);
            expect(initRes.status).to.equal(403);
        });

        it("should keep the existing owner when another authorised user replaces the object", async () => {
            const key = randomKey("big.bin");
            await putObject(key, USER_A).expect(200);
            const initRes = await initiateMultipart(key, ADMIN_USER);
            expect(initRes.status).to.equal(200);
            await uploadPartAndComplete(
                key,
                initRes.body.uploadId,
                ADMIN_USER
            ).then((res) => expect(res.status).to.equal(200));
            expect((await getStoredMetaData(key))["magda-owner-id"]).to.equal(
                USER_A
            );
        });

        it("should reject completing when the object has been replaced by another owner's object since initiate", async () => {
            const key = randomKey("big.bin");
            const initRes = await initiateMultipart(key, ADMIN_USER);
            expect(initRes.status).to.equal(200);
            await putObject(key, USER_B, "uploaded meanwhile").expect(200);
            const res = await uploadPartAndComplete(
                key,
                initRes.body.uploadId,
                ADMIN_USER
            );
            expect(res.status).to.equal(409);
            await getObject(key, USER_B).expect(200, "uploaded meanwhile");
        });

        it("should complete an upload whose token was signed before `ownerId` was added", async () => {
            const key = randomKey("big.bin");
            const initRes = await initiateMultipart(key, USER_A);
            expect(initRes.status).to.equal(200);
            const { ownerId, ...legacySession } = verifyUploadToken(
                initRes.body.uploadId,
                jwtSecret
            );
            expect(ownerId).to.equal(USER_A);
            const legacyUploadId = signUploadToken(
                legacySession,
                jwtSecret,
                "24h"
            );
            const res = await uploadPartAndComplete(
                key,
                legacyUploadId,
                USER_A
            );
            expect(res.status).to.equal(200);
            await getObject(key, USER_A).expect(200);
        });
    });

    describe("Objects uploaded with the legacy `magda-user-id` metadata", () => {
        async function putLegacyObject(key: string, metaData: any) {
            await rawClient.putObject(
                bucketName,
                key,
                Buffer.from("legacy"),
                undefined,
                { "Content-Type": "text/plain", ...metaData }
            );
        }

        it("should treat `magda-user-id` as the owner", async () => {
            const key = randomKey("legacy.txt");
            await putLegacyObject(key, { "magda-user-id": USER_A });
            await getObject(key, USER_A).expect(200, "legacy");
            await getObject(key, USER_B).expect(403);
            await putObject(key, USER_B).expect(403);
            await deleteObject(key, USER_B).expect(403);
            await deleteObject(key, USER_A).expect(200, { deleted: true });
        });

        it("should migrate the owner to `magda-owner-id` when the owner replaces the object", async () => {
            const key = randomKey("legacy.txt");
            await putLegacyObject(key, { "magda-user-id": USER_A });
            await putObject(key, USER_A, "v2").expect(200);
            const metaData = await getStoredMetaData(key);
            expect(metaData["magda-owner-id"]).to.equal(USER_A);
            expect(metaData).to.not.have.property("magda-user-id");
        });

        it("should prefer `magda-owner-id` when both keys are present", async () => {
            const key = randomKey("legacy.txt");
            await putLegacyObject(key, {
                "magda-owner-id": USER_A,
                "magda-user-id": USER_B
            });
            await getObject(key, USER_A).expect(200, "legacy");
            await getObject(key, USER_B).expect(403);
            await deleteObject(key, USER_B).expect(403);
        });
    });
});
