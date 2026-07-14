import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { registerDatasetCommands } from "../commands/dataset.js";
import { startMockServer } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

describe("dataset add-file", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    let tmp: string;
    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-af-"));
    });
    afterEach(async () => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
        await fs.rm(tmp, { recursive: true, force: true });
    });

    function routes(overrides: any = {}) {
        return [
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1" }
            },
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/ds-1$/,
                body: {
                    id: "ds-1",
                    aspects: {
                        publishing: { state: "draft" },
                        "dataset-distributions": { distributions: ["dist-old"] }
                    }
                }
            },
            {
                method: "POST",
                path: /^\/v0\/storage\/upload\//,
                body: { message: "ok" },
                ...overrides.upload
            },
            {
                method: "POST",
                path: "/v0/registry/records",
                body: {},
                ...overrides.createRecord
            },
            {
                method: "GET",
                path: /aspects\/dataset-distributions$/,
                body: { distributions: ["dist-old"] }
            },
            {
                method: "GET",
                path: /aspects\/dcat-dataset-strings$/,
                body: { title: "t" }
            },
            { method: "PUT", path: /aspects\//, body: {} },
            { method: "DELETE", path: /^\/v0\/storage\//, body: {} }
        ];
    }

    it("uploads, creates the distribution and links it to the dataset", async () => {
        const local = path.join(tmp, "data.csv");
        await fs.writeFile(local, "a,b\n");
        const server = await startMockServer(routes());
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            const out = await captureStdout(() =>
                program.parseAsync(["dataset", "add-file", "ds-1", local], {
                    from: "user"
                })
            );
            const distId = out.trim();
            expect(distId).to.match(/^magda-dist-/);

            const posted = JSON.parse(
                server.requests
                    .find(
                        (r) =>
                            r.method === "POST" &&
                            r.url.startsWith("/v0/registry/records")
                    )!
                    .body.toString()
            );
            const s = posted.aspects["dcat-distribution-strings"];
            expect(s.useStorageApi).to.equal(true);
            expect(s.downloadURL).to.equal(
                `magda://storage-api/ds-1/${distId}/data.csv`
            );
            expect(posted.aspects.publishing.state).to.equal("draft");

            const distPut = server.requests.find(
                (r) =>
                    r.method === "PUT" &&
                    r.url.includes("aspects/dataset-distributions")
            )!;
            expect(
                JSON.parse(distPut.body.toString()).distributions
            ).to.deep.equal(["dist-old", distId]);
        } finally {
            await server.close();
        }
    });

    it("cleans up the uploaded object when record creation fails", async () => {
        const local = path.join(tmp, "data.csv");
        await fs.writeFile(local, "a,b\n");
        const server = await startMockServer(
            routes({
                createRecord: { status: 500, body: { message: "boom" } }
            })
        );
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            let err: unknown;
            try {
                await captureStdout(() =>
                    program.parseAsync(["dataset", "add-file", "ds-1", local], {
                        from: "user"
                    })
                );
            } catch (e) {
                err = e;
            }
            expect(err).to.be.instanceOf(Error);
            const deletes = server.requests.filter(
                (r) => r.method === "DELETE" && r.url.startsWith("/v0/storage/")
            );
            expect(deletes).to.have.length(1);
        } finally {
            await server.close();
        }
    });

    it("cleans up both the uploaded object and the distribution record when mergeAspect fails (recordCreated=true)", async () => {
        const local = path.join(tmp, "data.csv");
        await fs.writeFile(local, "a,b\n");
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1" }
            },
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/ds-1$/,
                body: {
                    id: "ds-1",
                    aspects: {
                        publishing: { state: "draft" },
                        "dataset-distributions": { distributions: ["dist-old"] }
                    }
                }
            },
            {
                method: "POST",
                path: /^\/v0\/storage\/upload\//,
                body: { message: "ok" }
            },
            {
                method: "POST",
                path: "/v0/registry/records",
                body: {}
            },
            {
                method: "GET",
                path: /aspects\/dataset-distributions$/,
                body: { distributions: ["dist-old"] }
            },
            {
                method: "PUT",
                path: /aspects\/dataset-distributions$/,
                status: 500,
                body: { message: "registry error" }
            },
            {
                method: "DELETE",
                path: /^\/v0\/registry\/records\//,
                body: {}
            },
            {
                method: "DELETE",
                path: /^\/v0\/storage\//,
                body: {}
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            let err: unknown;
            try {
                await captureStdout(() =>
                    program.parseAsync(["dataset", "add-file", "ds-1", local], {
                        from: "user"
                    })
                );
            } catch (e) {
                err = e;
            }
            expect(err).to.be.instanceOf(Error);
            const distDeletes = server.requests.filter(
                (r) =>
                    r.method === "DELETE" &&
                    r.url.startsWith("/v0/registry/records/")
            );
            expect(distDeletes).to.have.length(1);
            const storageDeletes = server.requests.filter(
                (r) => r.method === "DELETE" && r.url.startsWith("/v0/storage/")
            );
            expect(storageDeletes).to.have.length(1);
        } finally {
            await server.close();
        }
    });

    it("registers a link-only distribution with --access-url", async () => {
        const server = await startMockServer(routes());
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            await captureStdout(() =>
                program.parseAsync(
                    [
                        "dataset",
                        "add-file",
                        "ds-1",
                        "--access-url",
                        "https://example.com/api",
                        "--title",
                        "API endpoint"
                    ],
                    { from: "user" }
                )
            );
            const uploads = server.requests.filter((r) =>
                r.url.startsWith("/v0/storage/upload")
            );
            expect(uploads).to.have.length(0);
            const posted = JSON.parse(
                server.requests
                    .find(
                        (r) =>
                            r.method === "POST" &&
                            r.url.startsWith("/v0/registry/records")
                    )!
                    .body.toString()
            );
            const s = posted.aspects["dcat-distribution-strings"];
            expect(s.accessURL).to.equal("https://example.com/api");
            expect(s.useStorageApi).to.equal(undefined);
        } finally {
            await server.close();
        }
    });

    it("tags the distribution v0 and bumps the dataset version", async () => {
        const local = path.join(tmp, "data.csv");
        await fs.writeFile(local, "x,y\n");
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1" }
            },
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/ds-1$/,
                body: {
                    id: "ds-1",
                    name: "My data",
                    aspects: {
                        publishing: { state: "draft" },
                        "dataset-distributions": { distributions: [] },
                        "dcat-dataset-strings": { title: "My data" }
                    }
                }
            },
            { method: "POST", path: /^\/v0\/storage\/upload\//, body: {} },
            {
                method: "POST",
                path: "/v0/registry/records",
                body: {},
                headers: { "x-magda-event-id": "60" }
            },
            {
                method: "GET",
                path: /aspects\/dataset-distributions$/,
                body: { distributions: [] }
            },
            {
                method: "PUT",
                path: /aspects\/dataset-distributions$/,
                body: {},
                headers: { "x-magda-event-id": "61" }
            },
            {
                method: "GET",
                path: /aspects\/dcat-dataset-strings$/,
                body: { title: "My data" }
            },
            {
                method: "PUT",
                path: /aspects\/dcat-dataset-strings$/,
                body: {},
                headers: { "x-magda-event-id": "62" }
            },
            {
                method: "GET",
                path: /records\/ds-1\/aspects\/version$/,
                status: 404,
                body: { message: "not found" }
            },
            {
                method: "PUT",
                path: /aspects\/version$/,
                body: {},
                headers: { "x-magda-event-id": "63" }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            await captureStdout(() =>
                program.parseAsync(["dataset", "add-file", "ds-1", local], {
                    from: "user"
                })
            );
            const versionPuts = server.requests.filter(
                (r) => r.method === "PUT" && r.url.includes("aspects/version")
            );
            // one tag write on the new distribution, one bump on the dataset
            expect(versionPuts).to.have.length(2);
            const distTag = JSON.parse(versionPuts[0].body.toString());
            expect(distTag.currentVersionNumber).to.equal(0);
            expect(distTag.versions[0].eventId).to.equal(60);
            const dsPut = versionPuts.find((r) =>
                r.url.includes("/records/ds-1/")
            )!;
            const dsVersion = JSON.parse(dsPut.body.toString());
            // dataset had no version aspect: seeded v0, tagged with the
            // max content event id (62)
            expect(dsVersion.currentVersionNumber).to.equal(0);
            expect(dsVersion.versions[0].eventId).to.equal(62);
            expect(dsVersion.versions[0].description).to.equal(
                "initial version"
            );
        } finally {
            await server.close();
        }
    });
});
