import { expect } from "chai";
import { Command } from "commander";
import { registerDatasetCommands } from "../commands/dataset.js";
import { startMockServer } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

describe("dataset update", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    afterEach(() => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
    });

    it("sets a publisher reference and name mirror", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/registry/records/org-1",
                body: {
                    id: "org-1",
                    name: "record-slug",
                    aspects: {
                        "organization-details": { title: "Data Agency" }
                    }
                }
            },
            {
                method: "GET",
                path: /aspects\/dcat-dataset-strings$/,
                body: { title: "Dataset", description: "keep me" }
            },
            {
                method: "PATCH",
                path: "/v0/registry/records",
                body: [42]
            },
            {
                method: "GET",
                path: /aspects\/version$/,
                body: {
                    currentVersionNumber: 0,
                    versions: [
                        {
                            versionNumber: 0,
                            createTime: "2026-01-01T00:00:00.000Z",
                            description: "initial version",
                            title: "Dataset",
                            eventId: 1
                        }
                    ]
                }
            },
            { method: "GET", path: "/v0/auth/users/whoami", body: {} },
            { method: "PUT", path: /aspects\/version$/, body: {} }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            await captureStdout(() =>
                program.parseAsync(
                    ["dataset", "update", "ds-1", "--publisher", "org-1"],
                    { from: "user" }
                )
            );
            const patchRequest = server.requests.find(
                (r) => r.method === "PATCH"
            )!;
            const patch = JSON.parse(patchRequest.body.toString());
            expect(patch.recordIds).to.deep.equal(["ds-1"]);
            expect(patch.jsonPath).to.deep.include({
                op: "add",
                path: "/aspects/dcat-dataset-strings",
                value: {
                    title: "Dataset",
                    description: "keep me",
                    publisher: "Data Agency",
                    modified: patch.jsonPath[0].value.modified
                }
            });
            expect(patch.jsonPath).to.deep.include({
                op: "add",
                path: "/aspects/dataset-publisher",
                value: { publisher: "org-1" }
            });
            const versionPut = server.requests.find(
                (r) => r.method === "PUT" && r.url.includes("aspects/version")
            )!;
            const version = JSON.parse(versionPut.body.toString());
            expect(version.currentVersionNumber).to.equal(1);
            expect(version.versions[1].eventId).to.equal(42);
        } finally {
            await server.close();
        }
    });

    it("backfills the site default on a publisher-less dataset", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /aspects\/dataset-publisher$/,
                status: 404,
                body: { message: "not found" }
            },
            {
                method: "GET",
                path: "/server-config.js",
                body: 'window.magda_server_config = {"defaultOrganizationId":"org-default"};'
            },
            {
                method: "GET",
                path: "/v0/registry/records/org-default",
                body: {
                    id: "org-default",
                    aspects: {
                        "organization-details": { title: "Default Agency" }
                    }
                }
            },
            {
                method: "GET",
                path: /aspects\/dcat-dataset-strings$/,
                body: { title: "Old" }
            },
            {
                method: "PATCH",
                path: "/v0/registry/records",
                body: [11]
            },
            {
                method: "GET",
                path: /aspects\/version$/,
                status: 404,
                body: { message: "not found" }
            },
            { method: "GET", path: "/v0/auth/users/whoami", body: {} },
            { method: "PUT", path: /aspects\/version$/, body: {} }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            await captureStdout(() =>
                program.parseAsync(
                    ["dataset", "update", "ds-1", "--title", "New"],
                    { from: "user" }
                )
            );
            const patchRequest = server.requests.find(
                (r) => r.method === "PATCH"
            )!;
            const patch = JSON.parse(patchRequest.body.toString());
            expect(patch.jsonPath[0].value.publisher).to.equal(
                "Default Agency"
            );
            expect(patch.jsonPath[1]).to.deep.equal({
                op: "add",
                path: "/aspects/dataset-publisher",
                value: { publisher: "org-default" }
            });
        } finally {
            await server.close();
        }
    });

    for (const aspectId of ["dataset-publisher", "dcat-dataset-strings"]) {
        it(`rejects managed publisher aspect ${aspectId}`, async () => {
            const program = new Command();
            registerDatasetCommands(program);
            let error: unknown;
            try {
                await captureStdout(() =>
                    program.parseAsync(
                        [
                            "dataset",
                            "update",
                            "ds-1",
                            "--aspect",
                            `${aspectId}={}`
                        ],
                        { from: "user" }
                    )
                );
            } catch (e) {
                error = e;
            }
            expect((error as Error).message).to.contain(
                "does not accept --aspect"
            );
        });
    }

    it("merges scalar fields into dcat-dataset-strings", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /aspects\/dataset-publisher$/,
                body: { publisher: "org-stale" }
            },
            {
                method: "GET",
                path: /aspects\/dcat-dataset-strings$/,
                body: {
                    title: "Old",
                    description: "keep me",
                    publisher: "Old Agency"
                }
            },
            {
                method: "PUT",
                path: /aspects\/dcat-dataset-strings$/,
                body: {}
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            await captureStdout(() =>
                program.parseAsync(
                    ["dataset", "update", "ds-1", "--title", "New"],
                    { from: "user" }
                )
            );
            const put = server.requests.find((r) => r.method === "PUT")!;
            const body = JSON.parse(put.body.toString());
            expect(body.title).to.equal("New");
            expect(body.description).to.equal("keep me");
            expect(body.publisher).to.equal("Old Agency");
            expect(body.modified).to.be.a("string");
            expect(
                server.requests.some((r) => r.url.includes("records/org-stale"))
            ).to.equal(false);
        } finally {
            await server.close();
        }
    });
});
