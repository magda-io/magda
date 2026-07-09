import { expect } from "chai";
import {
    resolveMode,
    resolveModeFromArgv,
    printData,
    printError
} from "../output.js";
import { MgdApiError } from "../errors.js";

function captureStream(stream: NodeJS.WriteStream, fn: () => void): string {
    const orig = stream.write;
    let out = "";
    (stream as any).write = (chunk: any) => {
        out += String(chunk);
        return true;
    };
    try {
        fn();
    } finally {
        stream.write = orig;
    }
    return out;
}

describe("output", () => {
    it("resolves mode from flags", () => {
        expect(resolveMode({})).to.equal("human");
        expect(resolveMode({ json: true })).to.equal("json");
        expect(resolveMode({ jsonl: true })).to.equal("jsonl");
    });

    it("resolves mode from argv (subcommand flags)", () => {
        expect(resolveModeFromArgv(["search", "datasets", "water"])).to.equal(
            "human"
        );
        expect(
            resolveModeFromArgv(["search", "datasets", "water", "--json"])
        ).to.equal("json");
        expect(
            resolveModeFromArgv(["dataset", "get", "id", "--jsonl"])
        ).to.equal("jsonl");
    });

    it("prints a single pretty JSON document in json mode", () => {
        const out = captureStream(process.stdout, () =>
            printData("json", { a: 1 })
        );
        expect(JSON.parse(out)).to.deep.equal({ a: 1 });
    });

    it("prints one object per line in jsonl mode", () => {
        const out = captureStream(process.stdout, () =>
            printData("jsonl", { ignored: true }, [{ a: 1 }, { a: 2 }])
        );
        const lines = out.trim().split("\n");
        expect(lines).to.have.length(2);
        expect(JSON.parse(lines[0])).to.deep.equal({ a: 1 });
    });

    it("prints structured error JSON to stderr in json mode", () => {
        const err = new MgdApiError(
            "no perm",
            403,
            "forbidden",
            "check API key"
        );
        const out = captureStream(process.stderr, () =>
            printError(err, "json")
        );
        const parsed = JSON.parse(out);
        expect(parsed.error.code).to.equal("forbidden");
        expect(parsed.error.status).to.equal(403);
        expect(parsed.error.hint).to.equal("check API key");
    });

    it("prints human-readable error to stderr in human mode", () => {
        const out = captureStream(process.stderr, () =>
            printError(new Error("boom"), "human")
        );
        expect(out).to.contain("Error: boom");
    });
});
