import { expect } from "chai";
import { Command } from "commander";
import { registerDatasetCommands } from "../commands/dataset.js";
import { registerDistCommands } from "../commands/dist.js";
import { startMockServer, MockRoute, RecordedRequest } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

// A dataset record carrying a dataset-distributions aspect.
function datasetRoute(
    datasetId: string,
    distributions: unknown[]
): MockRoute {
    return {
        method: "GET",
        path: new RegExp(`/records/${datasetId}$`),
        body: {
            id: datasetId,
            aspects: { "dataset-distributions": { distributions } }
        }
    };
}

// The bulk records-aspect merge endpoint; returns a list of event ids.
const bulkPublishRoute: MockRoute = {
    method: "PUT",
    path: "/v0/registry/records/aspects/publishing",
    body: [1, 2, 3]
};

interface RunResult {
    out: string;
    requests: RecordedRequest[];
    bulkPut: RecordedRequest;
    bulkBody: { recordIds: string[]; data: { state: string } };
}

async function run(argv: string[], routes: MockRoute[]): Promise<RunResult> {
    const server = await startMockServer(routes);
    const origBaseUrl = process.env.MGD_BASE_URL;
    process.env.MGD_BASE_URL = server.url;
    try {
        const program = new Command();
        registerDatasetCommands(program);
        registerDistCommands(program);
        const out = await captureStdout(() =>
            program.parseAsync(argv, { from: "user" })
        );
        const bulkPut = server.requests.find(
            (r) =>
                r.method === "PUT" &&
                r.url.startsWith("/v0/registry/records/aspects/publishing")
        )!;
        return {
            out,
            requests: server.requests,
            bulkPut,
            bulkBody: bulkPut && JSON.parse(bulkPut.body.toString())
        };
    } finally {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
        await server.close();
    }
}

describe("dataset publish / unpublish", () => {
    it("cascades to every distribution via one merge-PUT to the bulk endpoint", async () => {
        const { bulkPut, bulkBody } = await run(
            ["dataset", "publish", "ds-1"],
            [datasetRoute("ds-1", ["dist-1", "dist-2"]), bulkPublishRoute]
        );
        expect(bulkPut.url).to.match(/[?&]merge=true(&|$)/);
        expect(bulkBody.recordIds).to.deep.equal(["ds-1", "dist-1", "dist-2"]);
        expect(bulkBody.data).to.deep.equal({ state: "published" });
    });

    it("--without-distributions sets only the dataset record", async () => {
        const { bulkBody } = await run(
            ["dataset", "publish", "ds-1", "--without-distributions"],
            [datasetRoute("ds-1", ["dist-1", "dist-2"]), bulkPublishRoute]
        );
        expect(bulkBody.recordIds).to.deep.equal(["ds-1"]);
        expect(bulkBody.data).to.deep.equal({ state: "published" });
    });

    it("unpublish sets state back to draft, cascading by default", async () => {
        const { bulkBody } = await run(
            ["dataset", "unpublish", "ds-1"],
            [datasetRoute("ds-1", ["dist-1"]), bulkPublishRoute]
        );
        expect(bulkBody.recordIds).to.deep.equal(["ds-1", "dist-1"]);
        expect(bulkBody.data).to.deep.equal({ state: "draft" });
    });

    it("handles a dataset with zero distributions", async () => {
        const { bulkBody } = await run(
            ["dataset", "publish", "ds-1"],
            [datasetRoute("ds-1", []), bulkPublishRoute]
        );
        expect(bulkBody.recordIds).to.deep.equal(["ds-1"]);
    });

    it("reads distribution ids from both id strings and dereferenced objects", async () => {
        const { bulkBody } = await run(
            ["dataset", "publish", "ds-1"],
            [
                datasetRoute("ds-1", ["dist-1", { id: "dist-2" }]),
                bulkPublishRoute
            ]
        );
        expect(bulkBody.recordIds).to.deep.equal(["ds-1", "dist-1", "dist-2"]);
    });

    it("emits a structured result with --json", async () => {
        const { out } = await run(
            ["dataset", "publish", "ds-1", "--json"],
            [datasetRoute("ds-1", ["dist-1"]), bulkPublishRoute]
        );
        expect(JSON.parse(out)).to.deep.equal({
            state: "published",
            records: [
                { id: "ds-1", type: "dataset", state: "published" },
                { id: "dist-1", type: "distribution", state: "published" }
            ]
        });
    });
});

describe("dist publish / unpublish", () => {
    it("publish sets a single distribution to published", async () => {
        const { bulkBody } = await run(
            ["dist", "publish", "dist-9"],
            [bulkPublishRoute]
        );
        expect(bulkBody.recordIds).to.deep.equal(["dist-9"]);
        expect(bulkBody.data).to.deep.equal({ state: "published" });
    });

    it("unpublish sets a single distribution to draft", async () => {
        const { bulkBody } = await run(
            ["dist", "unpublish", "dist-9"],
            [bulkPublishRoute]
        );
        expect(bulkBody.recordIds).to.deep.equal(["dist-9"]);
        expect(bulkBody.data).to.deep.equal({ state: "draft" });
    });

    it("emits a structured result with --json", async () => {
        const { out } = await run(
            ["dist", "publish", "dist-9", "--json"],
            [bulkPublishRoute]
        );
        expect(JSON.parse(out)).to.deep.equal({
            state: "published",
            records: [
                { id: "dist-9", type: "distribution", state: "published" }
            ]
        });
    });
});
