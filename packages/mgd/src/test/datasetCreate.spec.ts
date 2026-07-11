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
});
