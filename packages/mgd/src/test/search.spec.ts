import { expect } from "chai";
import { Command } from "commander";
import { registerSearchCommands } from "../commands/search.js";
import { MgdApiError } from "../errors.js";
import { startMockServer } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

describe("search commands", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    afterEach(() => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
    });

    it("searches datasets and emits jsonl", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/search/datasets",
                body: {
                    hitCount: 2,
                    dataSets: [
                        { identifier: "ds-1", title: "Water" },
                        { identifier: "ds-2", title: "Fire" }
                    ]
                }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerSearchCommands(program);
            const out = await captureStdout(() =>
                program
                    .parseAsync(["search", "datasets", "water", "--jsonl"], {
                        from: "user"
                    })
                    .then(() => {})
            );
            const lines = out.trim().split("\n");
            expect(lines).to.have.length(2);
            expect(JSON.parse(lines[0]).identifier).to.equal("ds-1");
            const reqUrl = server.requests[0].url;
            expect(reqUrl).to.contain("query=water");
        } finally {
            await server.close();
        }
    });

    it("maps semantic-search 404 to semantic-search-unavailable", async () => {
        const server = await startMockServer([]); // no routes -> 404
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerSearchCommands(program);
            let err: unknown;
            try {
                await program
                    .parseAsync(["search", "semantic", "water"], {
                        from: "user"
                    })
                    .then(() => {});
            } catch (e) {
                err = e;
            }
            expect(err).to.be.instanceOf(MgdApiError);
            expect((err as MgdApiError).code).to.equal(
                "semantic-search-unavailable"
            );
        } finally {
            await server.close();
        }
    });

    it("maps semantic-search 500 'no such index' to semantic-search-unavailable", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/semantic-search/search",
                status: 500,
                body: {
                    message:
                        "OpenSearch index not found: no such index [semantic-index-v1]"
                }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerSearchCommands(program);
            let err: unknown;
            try {
                await program
                    .parseAsync(["search", "semantic", "water"], {
                        from: "user"
                    })
                    .then(() => {});
            } catch (e) {
                err = e;
            }
            expect(err).to.be.instanceOf(MgdApiError);
            expect((err as MgdApiError).code).to.equal(
                "semantic-search-unavailable"
            );
        } finally {
            await server.close();
        }
    });
});
