import { expect } from "chai";
import { Command } from "commander";
import { registerDatasetCommands } from "../commands/dataset.js";
import { startMockServer } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

describe("dataset read commands", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    afterEach(() => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
    });

    it("gets a full dataset record via the inFull endpoint", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/inFull\/ds-1$/,
                body: {
                    id: "ds-1",
                    name: "Water Data",
                    aspects: {
                        "dcat-dataset-strings": { title: "Water Data" },
                        "dataset-distributions": { distributions: ["d1"] }
                    }
                }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            const out = await captureStdout(() =>
                program
                    .parseAsync(["dataset", "get", "ds-1", "--json"], {
                        from: "user"
                    })
                    .then(() => {})
            );
            expect(JSON.parse(out).id).to.equal("ds-1");
            expect(server.requests[0].url).to.contain(
                "/v0/registry/records/inFull/ds-1"
            );
        } finally {
            await server.close();
        }
    });

    it("includes custom aspects in dataset get --json", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/inFull\/ds-1$/,
                body: {
                    id: "ds-1",
                    name: "Sensor Dataset",
                    aspects: {
                        "dcat-dataset-strings": { title: "Sensor Dataset" },
                        "sensor-network": {
                            sensorCount: 42,
                            operator: "Acme Air"
                        }
                    }
                }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            const out = await captureStdout(() =>
                program
                    .parseAsync(["dataset", "get", "ds-1", "--json"], {
                        from: "user"
                    })
                    .then(() => {})
            );
            const record = JSON.parse(out);
            expect(record.aspects["sensor-network"]).to.deep.equal({
                sensorCount: 42,
                operator: "Acme Air"
            });
        } finally {
            await server.close();
        }
    });

    it("lists distributions dereferenced", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /^\/v0\/registry\/records\/ds-1$/,
                body: {
                    id: "ds-1",
                    aspects: {
                        "dataset-distributions": {
                            distributions: [
                                {
                                    id: "dist-1",
                                    name: "file.csv",
                                    aspects: {
                                        "dcat-distribution-strings": {
                                            title: "file.csv",
                                            format: "CSV"
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            const out = await captureStdout(() =>
                program
                    .parseAsync(
                        ["dataset", "distributions", "ds-1", "--jsonl"],
                        { from: "user" }
                    )
                    .then(() => {})
            );
            const item = JSON.parse(out.trim());
            expect(item.id).to.equal("dist-1");
            expect(server.requests[0].url).to.contain("dereference=true");
        } finally {
            await server.close();
        }
    });
});
