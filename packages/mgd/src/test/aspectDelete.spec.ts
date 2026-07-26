import { expect } from "chai";
import { Command } from "commander";
import { registerAspectCommands } from "../commands/aspect.js";
import { startMockServer, MockRoute } from "./mockServer.js";
import { exitCodeFor, MgdApiError } from "../errors.js";

// Runs the aspect command group against a mock server, capturing stdout,
// stderr (where note() writes) and any thrown error. `note()` goes to
// stderr, so the existing captureStdout helper is not enough here.
async function run(
    argv: string[],
    routes: MockRoute[]
): Promise<{ stdout: string; stderr: string; error: unknown }> {
    const server = await startMockServer(routes);
    const origBaseUrl = process.env.MGD_BASE_URL;
    process.env.MGD_BASE_URL = server.url;

    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    let stdout = "";
    let stderr = "";
    (process.stdout as any).write = (c: any) => {
        stdout += String(c);
        return true;
    };
    (process.stderr as any).write = (c: any) => {
        stderr += String(c);
        return true;
    };

    let error: unknown = undefined;
    try {
        const program = new Command();
        program.exitOverride();
        registerAspectCommands(program);
        await program.parseAsync(argv, { from: "user" });
    } catch (e) {
        error = e;
    } finally {
        process.stdout.write = origOut;
        process.stderr.write = origErr;
        if (origBaseUrl === undefined) delete process.env.MGD_BASE_URL;
        else process.env.MGD_BASE_URL = origBaseUrl;
        await server.close();
    }
    return { stdout, stderr, error };
}

describe("aspect delete", () => {
    it("deletes an unused aspect definition (200 deleted=true)", async () => {
        const { stdout, stderr, error } = await run(
            ["aspect", "delete", "my-aspect"],
            [
                {
                    method: "DELETE",
                    path: /aspects\/my-aspect$/,
                    body: { deleted: true }
                }
            ]
        );
        expect(error).to.equal(undefined);
        expect(stderr).to.contain('Aspect definition "my-aspect" deleted.');
        expect(stdout).to.equal("");
    });

    it("reports nothing deleted for an unknown id (200 deleted=false), exit 0", async () => {
        const { stderr, error } = await run(
            ["aspect", "delete", "ghost"],
            [
                {
                    method: "DELETE",
                    path: /aspects\/ghost$/,
                    body: { deleted: false }
                }
            ]
        );
        expect(error).to.equal(undefined);
        expect(stderr).to.contain(
            'Aspect definition "ghost" did not exist (nothing deleted).'
        );
    });

    it("refuses when in use (409) -> non-zero exit, surfaces server message", async () => {
        const { error } = await run(
            ["aspect", "delete", "in-use"],
            [
                {
                    method: "DELETE",
                    path: /aspects\/in-use$/,
                    status: 409,
                    body: {
                        message:
                            "Cannot delete the aspect definition: 1 record(s) still reference it. Delete the referencing record aspect data first."
                    }
                }
            ]
        );
        expect(error).to.be.instanceOf(MgdApiError);
        expect((error as MgdApiError).status).to.equal(409);
        expect(exitCodeFor(error)).to.equal(1);
        expect((error as Error).message).to.contain(
            "1 record(s) still reference it"
        );
    });

    it("--json emits { aspectId, deleted, ok }", async () => {
        const { stdout, error } = await run(
            ["aspect", "delete", "my-aspect", "--json"],
            [
                {
                    method: "DELETE",
                    path: /aspects\/my-aspect$/,
                    body: { deleted: true }
                }
            ]
        );
        expect(error).to.equal(undefined);
        expect(JSON.parse(stdout)).to.deep.equal({
            aspectId: "my-aspect",
            deleted: true,
            ok: true
        });
    });
});
