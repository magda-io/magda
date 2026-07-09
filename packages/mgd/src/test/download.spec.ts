import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { resolveDownloadUrl, downloadToFile } from "../transfer.js";
import { registerFileCommands } from "../commands/file.js";
import { startMockServer } from "./mockServer.js";

describe("resolveDownloadUrl", () => {
    it("maps magda:// URLs to gateway storage paths", () => {
        const r = resolveDownloadUrl(
            "magda://storage-api/ds%201/dist-1/file.csv"
        );
        expect(r).to.deep.equal({
            kind: "storage",
            path: "/v0/storage/magda-datasets/ds%201/dist-1/file.csv"
        });
    });
    it("passes through external http URLs", () => {
        const r = resolveDownloadUrl("https://example.com/data.csv");
        expect(r).to.deep.equal({
            kind: "external",
            url: "https://example.com/data.csv"
        });
    });
});

describe("downloadToFile", () => {
    let tmp: string;
    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-dl-"));
    });
    afterEach(async () => {
        await fs.rm(tmp, { recursive: true, force: true });
    });

    it("streams a full download to disk", async () => {
        const target = path.join(tmp, "out.bin");
        const fetcher = async () =>
            new Response("hello world", { status: 200 });
        const result = await downloadToFile(fetcher, target);
        expect(result.bytes).to.equal(11);
        expect(await fs.readFile(target, "utf8")).to.equal("hello world");
    });

    it("resumes from an existing .part file when server honors Range", async () => {
        const target = path.join(tmp, "out.bin");
        await fs.writeFile(target + ".part", "hello ");
        const fetcher = async (rangeStart?: number) => {
            expect(rangeStart).to.equal(6);
            return new Response("world", {
                status: 206,
                headers: { "content-range": "bytes 6-10/11" }
            });
        };
        const result = await downloadToFile(fetcher, target, { resume: true });
        expect(result.resumedFrom).to.equal(6);
        expect(await fs.readFile(target, "utf8")).to.equal("hello world");
    });

    it("restarts when server ignores Range", async () => {
        const target = path.join(tmp, "out.bin");
        await fs.writeFile(target + ".part", "garbage");
        const fetcher = async () =>
            new Response("hello world", { status: 200 });
        const result = await downloadToFile(fetcher, target, { resume: true });
        expect(result.resumedFrom).to.equal(0);
        expect(await fs.readFile(target, "utf8")).to.equal("hello world");
    });
});

describe("file download command", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    let tmp: string;
    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-dlc-"));
    });
    afterEach(async () => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
        await fs.rm(tmp, { recursive: true, force: true });
    });

    it("downloads a storage object through the gateway", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/storage/magda-datasets/ds1/d1/f.csv",
                handler: (_req, res) => {
                    res.writeHead(200, {
                        "content-type": "text/csv",
                        "content-length": "3"
                    }).end("a,b");
                }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerFileCommands(program);
            const out = path.join(tmp, "f.csv");
            await program.parseAsync(
                ["file", "download", "magda-datasets/ds1/d1/f.csv", "-o", out],
                { from: "user" }
            );
            expect(await fs.readFile(out, "utf8")).to.equal("a,b");
            expect(server.requests[0].headers["x-magda-api-key"]).to.equal(
                undefined
            ); // anonymous profile — header only set when key present
        } finally {
            await server.close();
        }
    });
});
