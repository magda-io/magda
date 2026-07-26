import { expect } from "chai";
import { Command } from "commander";
import { registerDatasetCommands } from "../commands/dataset.js";
import { registerDistCommands } from "../commands/dist.js";
import { registerAspectCommands } from "../commands/aspect.js";
import { startMockServer, MockRoute } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

async function run(
    register: (program: Command) => void,
    argv: string[],
    routes: MockRoute[]
): Promise<string> {
    const server = await startMockServer(routes);
    const orig = process.env.MGD_BASE_URL;
    process.env.MGD_BASE_URL = server.url;
    try {
        const program = new Command();
        program.exitOverride();
        register(program);
        return await captureStdout(() =>
            program.parseAsync(argv, { from: "user" })
        );
    } finally {
        if (orig === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = orig;
        await server.close();
    }
}

describe("consistent --json handling", () => {
    describe("read commands accept --json without erroring", () => {
        it("aspect get <id> --json", async () => {
            const out = await run(
                registerAspectCommands,
                ["aspect", "get", "my-aspect", "--json"],
                [
                    {
                        method: "GET",
                        path: /aspects\/my-aspect$/,
                        body: { id: "my-aspect", name: "My Aspect" }
                    }
                ]
            );
            expect(JSON.parse(out).id).to.equal("my-aspect");
        });

        it("dataset aspect get <recordId> <aspectId> --json", async () => {
            const out = await run(
                registerDatasetCommands,
                ["dataset", "aspect", "get", "ds-1", "custom", "--json"],
                [
                    {
                        method: "GET",
                        path: /records\/ds-1\/aspects\/custom$/,
                        body: { hello: "world" }
                    }
                ]
            );
            expect(JSON.parse(out).hello).to.equal("world");
        });
    });

    describe("mutation commands emit structured --json output", () => {
        it("aspect create emits { aspectId, ok }", async () => {
            const out = await run(
                registerAspectCommands,
                [
                    "aspect",
                    "create",
                    "my-aspect",
                    "--name",
                    "My Aspect",
                    "--schema",
                    "{}",
                    "--json"
                ],
                [{ method: "PUT", path: /aspects\/my-aspect$/, body: {} }]
            );
            expect(JSON.parse(out)).to.deep.equal({
                aspectId: "my-aspect",
                ok: true
            });
        });

        it("dataset aspect set emits { recordId, aspectId, ok }", async () => {
            const out = await run(
                registerDatasetCommands,
                [
                    "dataset",
                    "aspect",
                    "set",
                    "ds-1",
                    "custom",
                    "{}",
                    "--json"
                ],
                [
                    {
                        method: "PUT",
                        path: /records\/ds-1\/aspects\/custom$/,
                        body: {}
                    }
                ]
            );
            expect(JSON.parse(out)).to.deep.equal({
                recordId: "ds-1",
                aspectId: "custom",
                ok: true
            });
        });

        it("dataset aspect delete emits { recordId, aspectId, ok }", async () => {
            const out = await run(
                registerDatasetCommands,
                ["dataset", "aspect", "delete", "ds-1", "custom", "--json"],
                [
                    {
                        method: "DELETE",
                        path: /records\/ds-1\/aspects\/custom$/,
                        body: {}
                    }
                ]
            );
            expect(JSON.parse(out)).to.deep.equal({
                recordId: "ds-1",
                aspectId: "custom",
                ok: true
            });
        });

        it("dataset update emits { datasetId, ok }", async () => {
            const out = await run(
                registerDatasetCommands,
                ["dataset", "update", "ds-1", "--title", "New", "--json"],
                [
                    {
                        method: "GET",
                        path: /aspects\/dcat-dataset-strings$/,
                        body: { title: "Old" }
                    },
                    {
                        method: "PUT",
                        path: /aspects\/dcat-dataset-strings$/,
                        body: {}
                    }
                ]
            );
            expect(JSON.parse(out)).to.deep.equal({
                datasetId: "ds-1",
                ok: true
            });
        });

        it("dist update emits { distributionId, ok }", async () => {
            const out = await run(
                registerDistCommands,
                ["dist", "update", "dist-1", "--title", "New", "--json"],
                [
                    {
                        method: "GET",
                        path: /aspects\/dcat-distribution-strings$/,
                        body: { title: "Old" }
                    },
                    {
                        method: "PUT",
                        path: /aspects\/dcat-distribution-strings$/,
                        body: {}
                    }
                ]
            );
            expect(JSON.parse(out)).to.deep.equal({
                distributionId: "dist-1",
                ok: true
            });
        });
    });
});
