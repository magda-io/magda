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

    it("merges scalar fields into dcat-dataset-strings", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /aspects\/dcat-dataset-strings$/,
                body: { title: "Old", description: "keep me" }
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
            expect(body.modified).to.be.a("string");
        } finally {
            await server.close();
        }
    });
});
