import { expect } from "chai";
import { spawn } from "node:child_process";
import http from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fse from "fs-extra";
import { requireResolve } from "@magda/esm-utils";
import { AspectDefItem } from "../migrateAspectDefinitions.js";

// Runs the real migrator executable against a stub Registry, so a failure must
// surface as a non-zero exit status (as the Kubernetes Job sees it), not only
// as a rejected promise.

const packageDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
);
const DEFAULT_ADMIN_USER_ID = "00000000-0000-4000-8000-000000000000";

function bundledAspectDefs(): AspectDefItem[] {
    const dir = path.dirname(
        requireResolve("@magda/registry-aspects/package.json")
    );
    return fse
        .readdirSync(dir)
        .filter((file) => file.endsWith(".schema.json"))
        .map((file) => {
            const jsonSchema = fse.readJsonSync(path.resolve(dir, file));
            const id = file.replace(/\.schema\.json$/, "");
            return { id, name: jsonSchema?.title || id, jsonSchema };
        });
}

type StubRegistry = {
    url: string;
    stored: Map<string, AspectDefItem>;
    puts: AspectDefItem[];
    failGet: Set<string>;
    failPut: boolean;
    close: () => Promise<void>;
};

async function startStubRegistry(defs: AspectDefItem[]): Promise<StubRegistry> {
    const stub: StubRegistry = {
        url: "",
        stored: new Map(defs.map((def) => [def.id, structuredClone(def)])),
        puts: [],
        failGet: new Set(),
        failPut: false,
        close: async () => undefined
    };
    const server = http.createServer((req, res) => {
        const match = req.url?.match(/^\/v0\/aspects\/([^/?]+)/);
        const send = (status: number, body: unknown) => {
            res.writeHead(status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(body));
        };
        if (!match) return send(404, { message: "Unknown path" });
        const id = decodeURIComponent(match[1]);
        if (req.method === "GET") {
            if (stub.failGet.has(id))
                return send(500, { message: "Registry is unavailable" });
            const def = stub.stored.get(id);
            return def ? send(200, def) : send(404, { message: "Not found" });
        }
        if (req.method === "PUT") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
                const def = JSON.parse(body);
                stub.puts.push(def);
                if (stub.failPut)
                    return send(500, { message: "Registry is unavailable" });
                stub.stored.set(def.id, def);
                send(200, def);
            });
            return;
        }
        send(405, { message: "Method not allowed" });
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
    );
    const { port } = server.address() as AddressInfo;
    // The request handler reads this same object, so tests can flip failures.
    stub.url = `http://127.0.0.1:${port}/v0`;
    stub.close = () => new Promise((resolve) => server.close(() => resolve()));
    return stub;
}

function runMigrator(
    registryUrl: string
): Promise<{ code: number | null; output: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [
                "--import",
                "tsx/esm",
                "src/index.ts",
                "--registryUrl",
                registryUrl,
                "--userId",
                DEFAULT_ADMIN_USER_ID,
                "--jwtSecret",
                "test-secret",
                "--maxRetries",
                "0",
                "--secondsBetweenRetries",
                "0"
            ],
            { cwd: packageDir, stdio: ["ignore", "pipe", "pipe"] }
        );
        let output = "";
        child.stdout.on("data", (chunk) => (output += chunk));
        child.stderr.on("data", (chunk) => (output += chunk));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, output }));
    });
}

const COMPLETED = "Registry aspect definitions migration has been completed!";

describe("migrator executable", function (this: Mocha.Suite) {
    this.timeout(60000);

    const bundled = bundledAspectDefs();
    const accessGroupDetails = bundled.find(
        (def) => def.id === "access-group-details"
    );
    let stub: StubRegistry | undefined;

    afterEach(async () => {
        await stub?.close();
        stub = undefined;
    });

    it("exits 0 without writes when every definition is up to date", async () => {
        stub = await startStubRegistry(bundled);
        const { code, output } = await runMigrator(stub.url);
        expect(code, output).to.equal(0);
        expect(output).to.contain(COMPLETED);
        expect(stub.puts).to.deep.equal([]);
    });

    it("upgrades an outdated access-group-details once, then makes no writes", async () => {
        stub = await startStubRegistry([
            ...bundled.filter((def) => def.id !== "access-group-details"),
            {
                ...accessGroupDetails,
                name: "Access Group Details",
                jsonSchema: {
                    ...accessGroupDetails.jsonSchema,
                    properties: {
                        ...accessGroupDetails.jsonSchema.properties,
                        resourceUri: {
                            ...accessGroupDetails.jsonSchema.properties
                                .resourceUri,
                            enum: ["object/record"]
                        }
                    }
                }
            }
        ]);
        const first = await runMigrator(stub.url);
        expect(first.code, first.output).to.equal(0);
        expect(stub.puts.map((def) => def.id)).to.deep.equal([
            "access-group-details"
        ]);
        expect(stub.puts[0].name).to.equal("Access Group Details");
        expect(stub.puts[0].jsonSchema).to.deep.equal(
            accessGroupDetails.jsonSchema
        );

        stub.puts.length = 0;
        const second = await runMigrator(stub.url);
        expect(second.code, second.output).to.equal(0);
        expect(stub.puts).to.deep.equal([]);
    });

    it("exits non-zero when a definition lookup fails", async () => {
        stub = await startStubRegistry(bundled);
        stub.failGet.add("access-group-details");
        const { code, output } = await runMigrator(stub.url);
        expect(code, output).to.equal(1);
        expect(output).to.contain(
            "Failed to look up aspect definition 'access-group-details'"
        );
        expect(output).not.to.contain(COMPLETED);
        expect(stub.puts).to.deep.equal([]);
    });

    it("exits non-zero when creating a missing definition fails", async () => {
        stub = await startStubRegistry(
            bundled.filter((def) => def.id !== "agent-skill-installation")
        );
        stub.failPut = true;
        const { code, output } = await runMigrator(stub.url);
        expect(code, output).to.equal(1);
        expect(output).to.contain(
            "Failed to create aspect definition 'agent-skill-installation'"
        );
        expect(output).not.to.contain(COMPLETED);
    });

    it("exits non-zero when updating access-group-details fails", async () => {
        stub = await startStubRegistry([
            ...bundled.filter((def) => def.id !== "access-group-details"),
            { ...accessGroupDetails, jsonSchema: { type: "object" } }
        ]);
        stub.failPut = true;
        const { code, output } = await runMigrator(stub.url);
        expect(code, output).to.equal(1);
        expect(output).to.contain(
            "Failed to update aspect definition 'access-group-details'"
        );
        expect(output).not.to.contain(COMPLETED);
    });

    it("exits non-zero when the Registry is unreachable", async () => {
        // Bind then close a port so nothing listens on it.
        const closed = await startStubRegistry([]);
        await closed.close();
        const { code, output } = await runMigrator(closed.url);
        expect(code, output).to.equal(1);
        expect(output).to.contain("Failed to look up aspect definition");
        expect(output).not.to.contain(COMPLETED);
    });
});
