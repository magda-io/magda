import { expect } from "chai";
import { Command } from "commander";
import { registerDatasetCommands } from "../commands/dataset.js";
import { startMockServer } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

describe("dataset aspect patch", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    afterEach(() => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
    });

    async function runPatch(extraArgs: string[]) {
        const server = await startMockServer([
            {
                method: "PUT",
                path: /records\/ds-1\/aspects\/dcat-dataset-strings$/,
                body: {}
            }
        ]);
        process.env.MGD_BASE_URL = server.url;
        try {
            const program = new Command();
            registerDatasetCommands(program);
            const out = await captureStdout(() =>
                program.parseAsync(
                    [
                        "dataset",
                        "aspect",
                        "patch",
                        "ds-1",
                        "dcat-dataset-strings",
                        '{"keywords":["a","b"]}',
                        ...extraArgs
                    ],
                    { from: "user" }
                )
            );
            return { server, out };
        } finally {
            await server.close();
        }
    }

    it("delegates the merge to the registry via ?merge=true with only the supplied fields", async () => {
        const { server } = await runPatch([]);
        // The CLI must not read-then-replace: no GET, a single merge PUT.
        expect(server.requests.map((r) => r.method)).to.deep.equal(["PUT"]);
        const put = server.requests[0];
        expect(put.url).to.match(/[?&]merge=true(&|$)/);
        expect(JSON.parse(put.body.toString())).to.deep.equal({
            keywords: ["a", "b"]
        });
    });

    it("emits a structured result with --json", async () => {
        const { out } = await runPatch(["--json"]);
        expect(JSON.parse(out)).to.deep.equal({
            recordId: "ds-1",
            aspectId: "dcat-dataset-strings",
            ok: true
        });
    });
});
