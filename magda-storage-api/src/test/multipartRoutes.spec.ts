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
import AuthorizedRegistryClient, {
    AuthorizedRegistryOptions
} from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { AuthDecisionReqConfig } from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { UnconditionalTrueDecision } from "magda-typescript-common/src/opa/AuthDecision.js";

const jwtSecret = "squirrel";
const USER_ID = "b1fddd6f-e230-4068-bd2c-1a21844f1598";

const minioClientOpts = {
    endPoint: process.env["MINIO_HOST"] as string,
    port: Number(process.env["MINIO_PORT"]),
    useSSL: false,
    accessKey: process.env["MINIO_ACCESS_KEY"] as string,
    secretKey: process.env["MINIO_SECRET_KEY"] as string,
    region: "unspecified-region"
};

function session() {
    return jwt.sign({ userId: USER_ID }, jwtSecret);
}

describe("Multipart routes", () => {
    const bucketName = "magda-mpu-routes-bucket";
    const rawClient = new Client(minioClientOpts);
    let app: express.Application;

    before(async () => {
        try {
            await rawClient.makeBucket(bucketName, minioClientOpts.region);
        } catch (e) {
            // ignore
        }
    });

    beforeEach(() => {
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
        authDecisionClient.getAuthDecision = authDecisionClient.getAuthDecision.callsFake(
            async (_c: AuthDecisionReqConfig, _t?: string) =>
                UnconditionalTrueDecision
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

    it("uploads a large object end to end via multipart", async () => {
        const key = "ds/dist/big.bin";
        const part1 = crypto.randomBytes(5 * 1024 * 1024);
        const part2 = crypto.randomBytes(2048);

        const initRes = await request(app)
            .post(`/v0/multipart/initiate/${bucketName}/${key}`)
            .set("X-Magda-Session", session())
            .set("Content-Type", "application/octet-stream")
            .expect(200);
        const uploadId = initRes.body.uploadId;
        expect(uploadId).to.be.a("string").and.not.empty;
        expect(initRes.body.recommendedPartSizeBytes).to.equal(
            16 * 1024 * 1024
        );

        const p1 = await request(app)
            .put(`/v0/multipart/part/${bucketName}/${key}`)
            .query({ uploadId, partNumber: 1 })
            .set("Content-Type", "application/octet-stream")
            .send(part1)
            .expect(200);
        const p2 = await request(app)
            .put(`/v0/multipart/part/${bucketName}/${key}`)
            .query({ uploadId, partNumber: 2 })
            .set("Content-Type", "application/octet-stream")
            .send(part2)
            .expect(200);

        const listRes = await request(app)
            .get(`/v0/multipart/parts/${bucketName}/${key}`)
            .query({ uploadId })
            .expect(200);
        expect(listRes.body.parts.length).to.equal(2);

        await request(app)
            .post(`/v0/multipart/complete/${bucketName}/${key}`)
            .query({ uploadId })
            .set("Content-Type", "application/json")
            .send({
                parts: [
                    { partNumber: 1, etag: p1.body.etag },
                    { partNumber: 2, etag: p2.body.etag }
                ]
            })
            .expect(200);

        const stat = await rawClient.statObject(bucketName, key);
        expect(stat.size).to.equal(part1.length + part2.length);
    });

    it("rejects a part upload with an invalid uploadId", async () => {
        await request(app)
            .put(`/v0/multipart/part/${bucketName}/ds/dist/x.bin`)
            .query({ uploadId: "not-a-real-token", partNumber: 1 })
            .set("Content-Type", "application/octet-stream")
            .send(Buffer.from("hello"))
            .expect(401);
    });

    it("rejects a token minted for a different object key", async () => {
        const initRes = await request(app)
            .post(`/v0/multipart/initiate/${bucketName}/ds/dist/keyA.bin`)
            .set("X-Magda-Session", session())
            .set("Content-Type", "application/octet-stream")
            .expect(200);
        await request(app)
            .put(`/v0/multipart/part/${bucketName}/ds/dist/keyB.bin`)
            .query({ uploadId: initRes.body.uploadId, partNumber: 1 })
            .set("Content-Type", "application/octet-stream")
            .send(Buffer.from("hello"))
            .expect(401);
    });

    it("rejects an out-of-range partNumber", async () => {
        const initRes = await request(app)
            .post(`/v0/multipart/initiate/${bucketName}/ds/dist/keyC.bin`)
            .set("X-Magda-Session", session())
            .set("Content-Type", "application/octet-stream")
            .expect(200);
        await request(app)
            .put(`/v0/multipart/part/${bucketName}/ds/dist/keyC.bin`)
            .query({ uploadId: initRes.body.uploadId, partNumber: 0 })
            .set("Content-Type", "application/octet-stream")
            .send(Buffer.from("hello"))
            .expect(400);
    });

    it("aborts an upload", async () => {
        const key = "ds/dist/abort-me.bin";
        const initRes = await request(app)
            .post(`/v0/multipart/initiate/${bucketName}/${key}`)
            .set("X-Magda-Session", session())
            .set("Content-Type", "application/octet-stream")
            .expect(200);
        const uploadId = initRes.body.uploadId;
        await request(app)
            .put(`/v0/multipart/part/${bucketName}/${key}`)
            .query({ uploadId, partNumber: 1 })
            .set("Content-Type", "application/octet-stream")
            .send(crypto.randomBytes(5 * 1024 * 1024))
            .expect(200);
        await request(app)
            .delete(`/v0/multipart/abort/${bucketName}/${key}`)
            .query({ uploadId })
            .expect(200, { aborted: true });
    });
});
