import { expect } from "chai";
import { Command } from "commander";
import { registerDistCommands } from "../commands/dist.js";
import { startMockServer, MockRoute } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

function routes(): MockRoute[] {
    return [
        { method: "GET", path: "/v0/auth/users/whoami", body: { id: "u1" } },
        {
            // parent lookup
            method: "GET",
            path: "/v0/registry/records",
            body: {
                records: [
                    {
                        id: "ds-1",
                        name: "My data",
                        aspects: {
                            "dataset-distributions": {
                                distributions: ["dist-1", "dist-2"]
                            },
                            "dcat-dataset-strings": { title: "My data" }
                        }
                    }
                ]
            }
        },
        {
            // the distribution being removed
            method: "GET",
            path: /^\/v0\/registry\/records\/dist-1$/,
            body: {
                id: "dist-1",
                aspects: {
                    "dcat-distribution-strings": {
                        downloadURL: "magda://storage-api/ds-1/dist-1/a.csv"
                    },
                    version: {
                        currentVersionNumber: 1,
                        versions: [
                            {
                                versionNumber: 0,
                                createTime: "2026-01-01T00:00:00.000Z",
                                description: "initial version",
                                title: "old.csv",
                                internalDataFileUrl:
                                    "magda://storage-api/ds-1/dist-1/old.csv"
                            },
                            {
                                versionNumber: 1,
                                createTime: "2026-01-02T00:00:00.000Z",
                                description:
                                    "Replaced superseded by a new distribution",
                                title: "a.csv",
                                eventId: 5,
                                internalDataFileUrl:
                                    "magda://storage-api/ds-1/dist-1/a.csv"
                            }
                        ]
                    }
                }
            }
        },
        {
            method: "GET",
            path: /records\/ds-1\/aspects\/dataset-distributions$/,
            body: { distributions: ["dist-1", "dist-2"] }
        },
        {
            method: "PUT",
            path: /records\/ds-1\/aspects\/dataset-distributions$/,
            body: {},
            headers: { "x-magda-event-id": "70" }
        },
        {
            method: "GET",
            path: /records\/ds-1\/aspects\/dcat-dataset-strings$/,
            body: { title: "My data" }
        },
        {
            method: "PUT",
            path: /records\/ds-1\/aspects\/dcat-dataset-strings$/,
            body: {},
            headers: { "x-magda-event-id": "71" }
        },
        {
            method: "GET",
            path: /records\/ds-1\/aspects\/version$/,
            body: {
                currentVersionNumber: 0,
                versions: [
                    {
                        versionNumber: 0,
                        createTime: "2026-01-01T00:00:00.000Z",
                        description: "initial version",
                        title: "My data",
                        eventId: 3
                    }
                ]
            }
        },
        {
            method: "PUT",
            path: /records\/ds-1\/aspects\/version$/,
            body: {}
        },
        {
            method: "DELETE",
            path: /^\/v0\/registry\/records\/dist-1$/,
            body: {}
        },
        { method: "DELETE", path: /^\/v0\/storage\//, body: {} }
    ];
}

async function run(argv: string[], mockRoutes = routes()) {
    const server = await startMockServer(mockRoutes);
    process.env.MGD_BASE_URL = server.url;
    try {
        const program = new Command();
        registerDistCommands(program);
        const out = await captureStdout(() =>
            program.parseAsync(argv, { from: "user" })
        );
        return { requests: server.requests, out };
    } finally {
        await server.close();
        delete process.env.MGD_BASE_URL;
    }
}

describe("dist remove", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    afterEach(() => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
    });

    it("unlinks, bumps the dataset version, deletes record and files", async () => {
        const { requests } = await run(["dist", "remove", "dist-1"]);

        const unlink = requests.find(
            (r) =>
                r.method === "PUT" &&
                r.url.includes("/records/ds-1/aspects/dataset-distributions")
        )!;
        expect(JSON.parse(unlink.body.toString()).distributions).to.deep.equal([
            "dist-2"
        ]);

        const versionPut = requests.find(
            (r) =>
                r.method === "PUT" &&
                r.url.includes("/records/ds-1/aspects/version")
        )!;
        const version = JSON.parse(versionPut.body.toString());
        expect(version.currentVersionNumber).to.equal(1);
        expect(version.versions[1]).to.include({
            description: "Distribution removed",
            title: "My data",
            eventId: 71,
            creatorId: "u1"
        });

        const recordDelete = requests.find(
            (r) =>
                r.method === "DELETE" &&
                r.url.includes("/registry/records/dist-1")
        );
        expect(recordDelete).to.not.equal(undefined);

        const storageDeletes = requests.filter(
            (r) => r.method === "DELETE" && r.url.includes("/v0/storage/")
        );
        // a.csv (downloadURL + v1 internalDataFileUrl, deduplicated) and
        // old.csv (v0 internalDataFileUrl)
        expect(storageDeletes).to.have.length(2);
    });

    it("--keep-files skips storage deletion", async () => {
        const { requests } = await run([
            "dist",
            "remove",
            "dist-1",
            "--keep-files"
        ]);
        const storageDeletes = requests.filter(
            (r) => r.method === "DELETE" && r.url.includes("/v0/storage/")
        );
        expect(storageDeletes).to.have.length(0);
        // the record itself is still deleted
        expect(
            requests.find(
                (r) =>
                    r.method === "DELETE" &&
                    r.url.includes("/registry/records/dist-1")
            )
        ).to.not.equal(undefined);
    });

    it("--json reports ids, version and deleted files", async () => {
        const { out } = await run(["dist", "remove", "dist-1", "--json"]);
        const parsed = JSON.parse(out);
        expect(parsed.distributionId).to.equal("dist-1");
        expect(parsed.datasetId).to.equal("ds-1");
        expect(parsed.datasetVersionNumber).to.equal(1);
        expect(parsed.filesDeleted).to.have.length(2);
    });

    it("--bucket targets a custom storage bucket", async () => {
        const { requests } = await run([
            "dist",
            "remove",
            "dist-1",
            "--bucket",
            "custom-bucket"
        ]);
        const storageDeletes = requests.filter(
            (r) => r.method === "DELETE" && r.url.includes("/v0/storage/")
        );
        expect(storageDeletes).to.have.length(2);
        for (const d of storageDeletes) {
            expect(d.url).to.include("/v0/storage/custom-bucket/");
        }
    });

    it("errors when the distribution has no parent dataset", async () => {
        const noParent = routes().map((r) =>
            r.method === "GET" && r.path === "/v0/registry/records"
                ? { ...r, body: { records: [] } }
                : r
        );
        let failed = false;
        try {
            await run(["dist", "remove", "dist-1"], noParent);
        } catch (e) {
            failed = true;
            expect(e instanceof Error ? e.message : String(e)).to.include(
                "parent dataset"
            );
        }
        expect(failed).to.equal(true);
    });
});
