import { expect } from "chai";
import { Command } from "commander";
import { registerApiCommands } from "../commands/api.js";
import { startMockServer } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

describe("api request", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    afterEach(() => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
    });

    it("performs GET with query params and pretty-prints JSON", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/registry/records",
                body: { records: [] }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerApiCommands(program);
            const out = await captureStdout(() =>
                program
                    .parseAsync(
                        [
                            "api",
                            "request",
                            "get",
                            "/v0/registry/records",
                            "--query",
                            "limit=5",
                            "--query",
                            "aspect=dcat-dataset-strings"
                        ],
                        { from: "user" }
                    )
                    .then(() => {})
            );
            expect(JSON.parse(out)).to.deep.equal({ records: [] });
            expect(server.requests[0].url).to.contain("limit=5");
            expect(server.requests[0].url).to.contain(
                "aspect=dcat-dataset-strings"
            );
        } finally {
            await server.close();
        }
    });

    it("sends an inline JSON body on POST", async () => {
        const server = await startMockServer([
            { method: "POST", path: "/v0/registry/records", body: { id: "x" } }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerApiCommands(program);
            await captureStdout(() =>
                program
                    .parseAsync(
                        [
                            "api",
                            "request",
                            "POST",
                            "/v0/registry/records",
                            "--body",
                            '{"id":"x","name":"X","aspects":{}}'
                        ],
                        { from: "user" }
                    )
                    .then(() => {})
            );
            const req = server.requests[0];
            expect(req.headers["content-type"]).to.contain("application/json");
            expect(JSON.parse(req.body.toString()).id).to.equal("x");
        } finally {
            await server.close();
        }
    });
});
