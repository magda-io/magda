import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MagdaClient } from "../client.js";
import { planParts, uploadFile, SINGLE_SHOT_MAX } from "../transfer.js";
import { startMockServer } from "./mockServer.js";

describe("planParts", () => {
    it("splits a file into fixed-size parts with a short tail", () => {
        expect(planParts(25, 10)).to.deep.equal([
            { partNumber: 1, start: 0, end: 10 },
            { partNumber: 2, start: 10, end: 20 },
            { partNumber: 3, start: 20, end: 25 }
        ]);
    });
    it("handles empty files as one empty part", () => {
        expect(planParts(0, 10)).to.deep.equal([
            { partNumber: 1, start: 0, end: 0 }
        ]);
    });
});

describe("uploadFile", () => {
    let tmp: string;
    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-ul-"));
    });
    afterEach(async () => {
        await fs.rm(tmp, { recursive: true, force: true });
    });

    it("uses single-shot for small files", async () => {
        const local = path.join(tmp, "small.csv");
        await fs.writeFile(local, "a,b\n1,2\n");
        const server = await startMockServer([
            {
                method: "POST",
                path: /^\/v0\/storage\/upload\//,
                body: { message: "ok" }
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            const result = await uploadFile(client, {
                localPath: local,
                bucket: "magda-datasets",
                key: "ds1/d1/small.csv",
                recordId: "ds1"
            });
            expect(result.multipart).to.equal(false);
            const req = server.requests[0];
            expect(req.url).to.contain(
                "/v0/storage/upload/magda-datasets/ds1/d1"
            );
            expect(req.url).to.contain("recordId=ds1");
            expect(req.headers["content-type"]).to.contain(
                "multipart/form-data"
            );
        } finally {
            await server.close();
        }
    });

    it("uses multipart for large files and completes with collected etags", async function () {
        this.timeout(10000);
        const local = path.join(tmp, "big.bin");
        // 2.5 "parts" of 8 bytes with a forced tiny part size for the test
        await fs.writeFile(local, Buffer.alloc(20, 1));
        const parts: any[] = [];
        const server = await startMockServer([
            {
                method: "POST",
                path: /multipart\/initiate/,
                body: {
                    uploadId: "tok",
                    recommendedPartSizeBytes: 8,
                    maxPartSizeBytes: 64,
                    minPartSize: 1
                }
            },
            {
                method: "PUT",
                path: /multipart\/part/,
                handler: (req, res, recorded) => {
                    const url = new URL(recorded.url, "http://x");
                    const partNumber = Number(
                        url.searchParams.get("partNumber")
                    );
                    parts.push({ partNumber, size: recorded.body.length });
                    res.writeHead(200, {
                        "content-type": "application/json"
                    }).end(
                        JSON.stringify({
                            partNumber,
                            etag: `etag-${partNumber}`
                        })
                    );
                }
            },
            {
                method: "POST",
                path: /multipart\/complete/,
                body: { message: "done" }
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            const result = await uploadFile(client, {
                localPath: local,
                bucket: "magda-datasets",
                key: "ds1/d1/big.bin",
                // force the multipart path without a 16MB fixture:
                singleShot: false,
                forceMultipart: true
            });
            expect(result.multipart).to.equal(true);
            expect(parts.map((p) => p.size)).to.deep.equal([8, 8, 4]);
            const completeReq = server.requests.at(-1)!;
            const body = JSON.parse(completeReq.body.toString());
            expect(body.parts).to.deep.equal([
                { partNumber: 1, etag: "etag-1" },
                { partNumber: 2, etag: "etag-2" },
                { partNumber: 3, etag: "etag-3" }
            ]);
        } finally {
            await server.close();
        }
    });

    it("aborts the multipart session when a part fails", async () => {
        const local = path.join(tmp, "big.bin");
        await fs.writeFile(local, Buffer.alloc(20, 1));
        let aborted = false;
        const server = await startMockServer([
            {
                method: "POST",
                path: /multipart\/initiate/,
                body: { uploadId: "tok", recommendedPartSizeBytes: 8 }
            },
            {
                method: "PUT",
                path: /multipart\/part/,
                status: 502,
                body: { message: "part failed" }
            },
            {
                method: "DELETE",
                path: /multipart\/abort/,
                handler: (_req, res) => {
                    aborted = true;
                    res.writeHead(200, {
                        "content-type": "application/json"
                    }).end("{}");
                }
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            let err: unknown;
            try {
                await uploadFile(client, {
                    localPath: local,
                    bucket: "b",
                    key: "k/big.bin",
                    forceMultipart: true
                });
            } catch (e) {
                err = e;
            }
            expect(err).to.be.instanceOf(Error);
            expect(aborted).to.equal(true);
        } finally {
            await server.close();
        }
    });

    it("falls back to single-shot when initiate 404s", async () => {
        const local = path.join(tmp, "big.bin");
        await fs.writeFile(local, Buffer.alloc(20, 1));
        const server = await startMockServer([
            {
                method: "POST",
                path: /multipart\/initiate/,
                status: 404,
                body: { message: "no route" }
            },
            {
                method: "POST",
                path: /^\/v0\/storage\/upload\//,
                body: { message: "ok" }
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            const result = await uploadFile(client, {
                localPath: local,
                bucket: "b",
                key: "k/big.bin",
                forceMultipart: true
            });
            expect(result.multipart).to.equal(false);
        } finally {
            await server.close();
        }
    });
});
