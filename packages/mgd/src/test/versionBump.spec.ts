import { expect } from "chai";
import { Command } from "commander";
import { registerDatasetCommands } from "../commands/dataset.js";
import { registerDistCommands } from "../commands/dist.js";
import { startMockServer, MockRoute } from "./mockServer.js";
import { captureStdout } from "./captureStdout.js";

const TAGGED_V0 = {
    currentVersionNumber: 0,
    versions: [
        {
            versionNumber: 0,
            createTime: "2026-01-01T00:00:00.000Z",
            description: "initial version",
            title: "Old",
            eventId: 7
        }
    ]
};

function baseRoutes(kind: "dataset" | "distribution"): MockRoute[] {
    const strings =
        kind === "dataset"
            ? "dcat-dataset-strings"
            : "dcat-distribution-strings";
    return [
        { method: "GET", path: "/v0/auth/users/whoami", body: { id: "u1" } },
        {
            method: "GET",
            path: new RegExp(`aspects/${strings}$`),
            body: { title: "Old" }
        },
        {
            method: "PUT",
            path: new RegExp(`aspects/${strings}$`),
            body: {},
            headers: { "x-magda-event-id": "42" }
        },
        { method: "GET", path: /aspects\/version$/, body: TAGGED_V0 },
        {
            method: "PUT",
            path: /aspects\/version$/,
            body: {},
            headers: { "x-magda-event-id": "43" }
        }
    ];
}

async function runUpdate(
    routes: MockRoute[],
    argv: string[],
    register: (p: Command) => void
) {
    const server = await startMockServer(routes);
    process.env.MGD_BASE_URL = server.url;
    try {
        const program = new Command();
        register(program);
        await captureStdout(() => program.parseAsync(argv, { from: "user" }));
        return server.requests;
    } finally {
        await server.close();
        delete process.env.MGD_BASE_URL;
    }
}

describe("version maintenance on update commands", () => {
    const origBaseUrl = process.env.MGD_BASE_URL;
    afterEach(() => {
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
    });

    it("dataset update bumps the dataset version, tagged with the content event", async () => {
        const requests = await runUpdate(
            baseRoutes("dataset"),
            ["dataset", "update", "ds-1", "--title", "New"],
            registerDatasetCommands
        );
        const versionPut = requests.find(
            (r) => r.method === "PUT" && r.url.includes("aspects/version")
        )!;
        expect(versionPut, "version PUT should happen").to.not.equal(undefined);
        const version = JSON.parse(versionPut.body.toString());
        expect(version.currentVersionNumber).to.equal(1);
        expect(version.versions).to.have.length(2);
        expect(version.versions[1]).to.include({
            versionNumber: 1,
            eventId: 42,
            title: "New",
            creatorId: "u1",
            description: "Version created on update submission"
        });
    });

    it("dataset update tags an untagged current version instead of bumping", async () => {
        const untagged = {
            ...TAGGED_V0,
            versions: [{ ...TAGGED_V0.versions[0] }]
        };
        delete (untagged.versions[0] as any).eventId;
        const routes = baseRoutes("dataset").map((r) =>
            r.method === "GET" && String(r.path).includes("version")
                ? { ...r, body: untagged }
                : r
        );
        const requests = await runUpdate(
            routes,
            ["dataset", "update", "ds-1", "--title", "New"],
            registerDatasetCommands
        );
        const versionPut = requests.find(
            (r) => r.method === "PUT" && r.url.includes("aspects/version")
        )!;
        const version = JSON.parse(versionPut.body.toString());
        expect(version.currentVersionNumber).to.equal(0);
        expect(version.versions).to.have.length(1);
        expect(version.versions[0].eventId).to.equal(42);
    });

    it("dataset update seeds a tagged v0 when the version aspect is missing", async () => {
        const routes = baseRoutes("dataset").filter(
            (r) => !(r.method === "GET" && String(r.path).includes("version"))
        );
        routes.push({
            method: "GET",
            path: /aspects\/version$/,
            status: 404,
            body: { message: "not found" }
        });
        const requests = await runUpdate(
            routes,
            ["dataset", "update", "ds-1", "--title", "New"],
            registerDatasetCommands
        );
        const versionPut = requests.find(
            (r) => r.method === "PUT" && r.url.includes("aspects/version")
        )!;
        const version = JSON.parse(versionPut.body.toString());
        expect(version.currentVersionNumber).to.equal(0);
        expect(version.versions[0]).to.include({
            description: "initial version",
            eventId: 42
        });
    });

    it("dataset update with an explicit --aspect version=... never auto-bumps", async () => {
        const requests = await runUpdate(
            baseRoutes("dataset"),
            [
                "dataset",
                "update",
                "ds-1",
                "--aspect",
                `version=${JSON.stringify(TAGGED_V0)}`
            ],
            registerDatasetCommands
        );
        const versionPuts = requests.filter(
            (r) => r.method === "PUT" && r.url.includes("aspects/version")
        );
        // exactly the user's own write; no auto-bump read or second write
        expect(versionPuts).to.have.length(1);
        const body = JSON.parse(versionPuts[0].body.toString());
        expect(body.currentVersionNumber).to.equal(0);
        const versionGets = requests.filter(
            (r) => r.method === "GET" && r.url.includes("aspects/version")
        );
        expect(versionGets).to.have.length(0);
    });

    it("dataset update still exits 0 when the version write fails", async () => {
        const routes = baseRoutes("dataset").map((r) =>
            r.method === "PUT" && String(r.path).includes("version")
                ? { ...r, status: 500, body: { message: "boom" } }
                : r
        );
        // must not throw
        await runUpdate(
            routes,
            ["dataset", "update", "ds-1", "--title", "New"],
            registerDatasetCommands
        );
    });

    it("dist update bumps the distribution version", async () => {
        const requests = await runUpdate(
            baseRoutes("distribution"),
            ["dist", "update", "dist-1", "--title", "New"],
            registerDistCommands
        );
        const versionPut = requests.find(
            (r) => r.method === "PUT" && r.url.includes("aspects/version")
        )!;
        const version = JSON.parse(versionPut.body.toString());
        expect(version.currentVersionNumber).to.equal(1);
        expect(version.versions[1]).to.include({
            eventId: 42,
            title: "New",
            description: "Distribution metadata updated"
        });
    });
});
