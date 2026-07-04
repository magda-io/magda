import {} from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
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

function sessionHeader() {
    return jwt.sign({ userId: USER_ID }, jwtSecret);
}

describe("Range download", () => {
    const bucketName = "magda-range-test-bucket";
    const rawClient = new Client(minioClientOpts);
    const body = Buffer.from("0123456789ABCDEFGHIJ"); // 20 bytes
    let app: express.Application;

    before(async () => {
        try {
            await rawClient.makeBucket(bucketName, minioClientOpts.region);
        } catch (e) {
            // ignore already-exists
        }
        await rawClient.putObject(
            bucketName,
            "range-file.txt",
            body,
            body.length,
            {
                "Content-Type": "text/plain"
            }
        );
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

    it("advertises Accept-Ranges and serves the full object without a Range", async () => {
        const res = await request(app)
            .get(`/v0/${bucketName}/range-file.txt`)
            .set("X-Magda-Session", sessionHeader())
            .expect(200);
        expect(res.headers["accept-ranges"]).to.equal("bytes");
        expect(res.text).to.equal(body.toString());
    });

    it("serves a closed byte range with 206 + Content-Range", async () => {
        const res = await request(app)
            .get(`/v0/${bucketName}/range-file.txt`)
            .set("X-Magda-Session", sessionHeader())
            .set("Range", "bytes=0-3")
            .expect(206);
        expect(res.headers["content-range"]).to.equal(
            `bytes 0-3/${body.length}`
        );
        expect(res.headers["content-length"]).to.equal("4");
        expect(res.text).to.equal("0123");
    });

    it("serves an open-ended range with 206", async () => {
        const res = await request(app)
            .get(`/v0/${bucketName}/range-file.txt`)
            .set("X-Magda-Session", sessionHeader())
            .set("Range", "bytes=16-")
            .expect(206);
        expect(res.headers["content-range"]).to.equal(
            `bytes 16-19/${body.length}`
        );
        expect(res.text).to.equal("GHIJ");
    });

    it("returns 416 for an unsatisfiable range", async () => {
        const res = await request(app)
            .get(`/v0/${bucketName}/range-file.txt`)
            .set("X-Magda-Session", sessionHeader())
            .set("Range", "bytes=100-200")
            .expect(416);
        expect(res.headers["content-range"]).to.equal(`bytes */${body.length}`);
    });
});
