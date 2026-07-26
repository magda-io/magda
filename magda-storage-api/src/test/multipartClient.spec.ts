import {} from "mocha";
import { expect } from "chai";
import { Client } from "minio";
import crypto from "crypto";
import MagdaMinioClient from "../MagdaMinioClient.js";

const opts = {
    endPoint: process.env["MINIO_HOST"] as string,
    port: Number(process.env["MINIO_PORT"]),
    useSSL: false,
    accessKey: process.env["MINIO_ACCESS_KEY"] as string,
    secretKey: process.env["MINIO_SECRET_KEY"] as string,
    region: "unspecified-region"
};

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}

describe("MagdaMinioClient multipart + partial get", () => {
    const bucket = "magda-mpu-test-bucket";
    const rawClient = new Client(opts);
    const magda = new MagdaMinioClient(opts);

    before(async () => {
        try {
            await rawClient.makeBucket(bucket, opts.region);
        } catch (err) {
            // ignore BucketAlreadyOwnedByYou
        }
    });

    it("uploads an object in multiple parts and stores metadata", async () => {
        const key = "mpu/multi-part-object.bin";
        // part 1 must be >= 5MB (S3 minimum for non-final parts)
        const part1 = crypto.randomBytes(5 * 1024 * 1024);
        const part2 = crypto.randomBytes(1024);

        const uploadId = await magda.initiateMultipartUpload(
            bucket,
            key,
            magda.toS3MetaHeaders({
                "Content-Type": "application/octet-stream",
                "magda-record-id": "record-xyz"
            })
        );
        expect(uploadId).to.be.a("string").and.not.empty;

        const etag1 = await magda.uploadPart(bucket, key, uploadId, 1, part1);
        const etag2 = await magda.uploadPart(bucket, key, uploadId, 2, part2);
        expect(etag1).to.be.a("string").and.not.empty;

        const listed = await magda.listParts(bucket, key, uploadId);
        expect(listed.map((p) => p.partNumber).sort()).to.deep.equal([1, 2]);

        const result = await magda.completeMultipartUpload(
            bucket,
            key,
            uploadId,
            [
                { partNumber: 1, etag: etag1 },
                { partNumber: 2, etag: etag2 }
            ]
        );
        expect(result.etag).to.be.a("string").and.not.empty;

        const stat = await rawClient.statObject(bucket, key);
        expect(stat.size).to.equal(part1.length + part2.length);
        expect(stat.metaData["magda-record-id"]).to.equal("record-xyz");
    });

    it("aborts a multipart upload", async () => {
        const key = "mpu/aborted-object.bin";
        const part1 = crypto.randomBytes(5 * 1024 * 1024);
        const uploadId = await magda.initiateMultipartUpload(bucket, key, {});
        await magda.uploadPart(bucket, key, uploadId, 1, part1);
        await magda.abortMultipartUpload(bucket, key, uploadId);
        // after abort, completing with the old id must fail
        let failed = false;
        try {
            await magda.completeMultipartUpload(bucket, key, uploadId, [
                { partNumber: 1, etag: "whatever" }
            ]);
        } catch (e) {
            failed = true;
        }
        expect(failed).to.equal(true);
    });

    it("reads a byte range with getPartialObject", async () => {
        const key = "mpu/range-object.bin";
        const data = Buffer.from("0123456789ABCDEF");
        await rawClient.putObject(bucket, key, data);
        const stream = await magda.getPartialObject(bucket, key, 4, 4);
        const buf = await streamToBuffer(stream);
        expect(buf.toString()).to.equal("4567");
    });
});
