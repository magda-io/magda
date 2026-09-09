import { expect } from "chai";
import { Command } from "commander";
import { registerDatasetCommands } from "../commands/dataset.js";
import { startMockServer } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

describe("dataset create", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    afterEach(() => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
    });

    it("creates a draft dataset with owner from whoami", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1", orgUnitId: "o1" }
            },
            {
                method: "POST",
                path: "/v0/registry/records",
                handler: (_req, res, recorded) => {
                    const record = JSON.parse(recorded.body.toString());
                    res.writeHead(200, {
                        "content-type": "application/json"
                    }).end(JSON.stringify(record));
                }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            const out = await captureStdout(() =>
                program.parseAsync(
                    ["dataset", "create", "--title", "My Data", "--desc", "d"],
                    { from: "user" }
                )
            );
            expect(out.trim()).to.match(/^magda-ds-[0-9a-f-]{36}$/);
            const posted = JSON.parse(
                server.requests
                    .find((r) => r.method === "POST")!
                    .body.toString()
            );
            expect(posted.aspects.publishing.state).to.equal("draft");
            expect(posted.aspects["access-control"].ownerId).to.equal("u1");
        } finally {
            await server.close();
        }
    });

    it("attaches custom aspects from --aspect", async () => {
        const server = await startMockServer([
            { method: "GET", path: "/v0/auth/users/whoami", body: {} },
            { method: "POST", path: "/v0/registry/records", body: {} }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            await captureStdout(() =>
                program.parseAsync(
                    [
                        "dataset",
                        "create",
                        "--title",
                        "T",
                        "--aspect",
                        'my-aspect={"a":1}'
                    ],
                    { from: "user" }
                )
            );
            const posted = JSON.parse(
                server.requests
                    .find((r) => r.method === "POST")!
                    .body.toString()
            );
            expect(posted.aspects["my-aspect"]).to.deep.equal({ a: 1 });
        } finally {
            await server.close();
        }
    });

    it("tags the seeded v0 with the creation event id", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1" }
            },
            {
                method: "POST",
                path: "/v0/registry/records",
                body: {},
                headers: { "x-magda-event-id": "55" }
            },
            { method: "PUT", path: /aspects\/version$/, body: {} }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            await captureStdout(() =>
                program.parseAsync(
                    ["dataset", "create", "--title", "My data"],
                    { from: "user" }
                )
            );
            const versionPut = server.requests.find(
                (r) => r.method === "PUT" && r.url.includes("aspects/version")
            )!;
            expect(versionPut, "v0 should be tagged").to.not.equal(undefined);
            const version = JSON.parse(versionPut.body.toString());
            expect(version.currentVersionNumber).to.equal(0);
            expect(version.versions[0].eventId).to.equal(55);
        } finally {
            await server.close();
        }
    });

    it("uses the site's default publisher and writes both publisher fields", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1" }
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
                    name: "Default Agency",
                    aspects: {
                        "organization-details": { title: "Default Agency" }
                    }
                }
            },
            { method: "POST", path: "/v0/registry/records", body: {} }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            await captureStdout(() =>
                program.parseAsync(
                    ["dataset", "create", "--title", "My data"],
                    { from: "user" }
                )
            );
            const posted = JSON.parse(
                server.requests
                    .find((r) => r.method === "POST")!
                    .body.toString()
            );
            expect(posted.aspects["dataset-publisher"]).to.deep.equal({
                publisher: "org-default"
            });
            expect(posted.aspects["dcat-dataset-strings"].publisher).to.equal(
                "Default Agency"
            );
        } finally {
            await server.close();
        }
    });

    for (const aspectId of ["dataset-publisher", "dcat-dataset-strings"]) {
        it(`rejects managed publisher aspect ${aspectId}`, async () => {
            const server = await startMockServer([
                { method: "GET", path: "/v0/auth/users/whoami", body: {} }
            ]);
            process.env.MGD_BASE_URL = server.url;
            try {
                const program = new Command();
                registerDatasetCommands(program);
                let error: unknown;
                try {
                    await captureStdout(() =>
                        program.parseAsync(
                            [
                                "dataset",
                                "create",
                                "--title",
                                "My data",
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
                expect(
                    server.requests.some((r) => r.method === "POST")
                ).to.equal(false);
            } finally {
                await server.close();
            }
        });
    }

    it("skips v0 tagging when the response has no event id header", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1" }
            },
            { method: "POST", path: "/v0/registry/records", body: {} }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            await captureStdout(() =>
                program.parseAsync(
                    ["dataset", "create", "--title", "My data"],
                    { from: "user" }
                )
            );
            const versionPuts = server.requests.filter(
                (r) => r.method === "PUT" && r.url.includes("aspects/version")
            );
            expect(versionPuts).to.have.length(0);
        } finally {
            await server.close();
        }
    });
});
