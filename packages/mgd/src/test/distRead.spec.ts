import { expect } from "chai";
import { Command } from "commander";
import { registerDistCommands } from "../commands/dist.js";
import { startMockServer } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

describe("dist read commands", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    afterEach(() => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
    });

    it("gets a full distribution record via the inFull endpoint", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/inFull\/dist-1$/,
                body: {
                    id: "dist-1",
                    name: "file.csv",
                    aspects: {
                        "dcat-distribution-strings": {
                            title: "file.csv",
                            format: "CSV"
                        }
                    }
                }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDistCommands(program);
            const out = await captureStdout(() =>
                program
                    .parseAsync(["dist", "get", "dist-1", "--json"], {
                        from: "user"
                    })
                    .then(() => {})
            );
            expect(JSON.parse(out).id).to.equal("dist-1");
            expect(server.requests[0].url).to.contain(
                "/v0/registry/records/inFull/dist-1"
            );
        } finally {
            await server.close();
        }
    });

    it("includes custom aspects in dist get --json", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/inFull\/dist-1$/,
                body: {
                    id: "dist-1",
                    name: "file.csv",
                    aspects: {
                        "dcat-distribution-strings": { title: "file.csv" },
                        "sensor-reading": { unit: "ppm", precision: 3 }
                    }
                }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDistCommands(program);
            const out = await captureStdout(() =>
                program
                    .parseAsync(["dist", "get", "dist-1", "--json"], {
                        from: "user"
                    })
                    .then(() => {})
            );
            const record = JSON.parse(out);
            expect(record.aspects["sensor-reading"]).to.deep.equal({
                unit: "ppm",
                precision: 3
            });
        } finally {
            await server.close();
        }
    });
});
