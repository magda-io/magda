import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { registerDistCommands } from "../commands/dist.js";
import { startMockServer } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

describe("dist replace-file", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    let tmp: string;
    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-rf-"));
    });
    afterEach(async () => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
        await fs.rm(tmp, { recursive: true, force: true });
    });

    it("uploads, merges metadata, bumps version and keeps history-referenced old file", async () => {
        const local = path.join(tmp, "new.csv");
        await fs.writeFile(local, "x,y\n1,2\n");
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1" }
            },
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/dist-1$/,
                body: {
                    id: "dist-1",
                    aspects: {
                        "dcat-distribution-strings": {
                            title: "old.csv",
                            downloadURL:
                                "magda://storage-api/ds-1/dist-1/old.csv"
                        },
                        version: {
                            currentVersionNumber: 0,
                            versions: [
                                {
                                    versionNumber: 0,
                                    title: "old.csv",
                                    internalDataFileUrl:
                                        "magda://storage-api/ds-1/dist-1/old.csv"
                                }
                            ]
                        }
                    }
                }
            },
            {
                method: "GET",
                path: "/v0/registry/records",
                body: { records: [{ id: "ds-1" }] }
            },
            { method: "POST", path: /^\/v0\/storage\/upload\//, body: {} },
            {
                method: "GET",
                path: /aspects\/dcat-distribution-strings$/,
                body: { title: "old.csv" }
            },
            { method: "PUT", path: /aspects\//, body: {} },
            { method: "DELETE", path: /^\/v0\/storage\//, body: {} }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDistCommands(program);
            await captureStdout(() =>
                program.parseAsync(["dist", "replace-file", "dist-1", local], {
                    from: "user"
                })
            );
            const versionPut = server.requests.find(
                (r) => r.method === "PUT" && r.url.includes("aspects/version")
            )!;
            const version = JSON.parse(versionPut.body.toString());
            expect(version.currentVersionNumber).to.equal(1);
            expect(version.versions).to.have.length(2);
            expect(version.versions[1].internalDataFileUrl).to.equal(
                "magda://storage-api/ds-1/dist-1/new.csv"
            );
            // old file IS referenced by version 0 -> must NOT be deleted
            const deletes = server.requests.filter(
                (r) => r.method === "DELETE" && r.url.includes("old.csv")
            );
            expect(deletes).to.have.length(0);
        } finally {
            await server.close();
        }
    });

    it("deletes the old object when it is not referenced by version history", async () => {
        const local = path.join(tmp, "new.csv");
        await fs.writeFile(local, "x\n");
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1" }
            },
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/dist-1$/,
                body: {
                    id: "dist-1",
                    aspects: {
                        "dcat-distribution-strings": {
                            title: "old.csv",
                            downloadURL:
                                "magda://storage-api/ds-1/dist-1/old.csv"
                        }
                        // no version aspect at all
                    }
                }
            },
            {
                method: "GET",
                path: "/v0/registry/records",
                body: { records: [{ id: "ds-1" }] }
            },
            { method: "POST", path: /^\/v0\/storage\/upload\//, body: {} },
            {
                method: "GET",
                path: /aspects\/dcat-distribution-strings$/,
                body: { title: "old.csv" }
            },
            { method: "PUT", path: /aspects\//, body: {} },
            { method: "DELETE", path: /^\/v0\/storage\//, body: {} }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDistCommands(program);
            await captureStdout(() =>
                program.parseAsync(["dist", "replace-file", "dist-1", local], {
                    from: "user"
                })
            );
            const deletes = server.requests.filter(
                (r) => r.method === "DELETE" && r.url.includes("old.csv")
            );
            expect(deletes).to.have.length(1);
        } finally {
            await server.close();
        }
    });
});
