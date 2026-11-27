/* Optional focused regression companion, launched by run.mjs --existing-tests.
 * Runs existing tests on the SAME disposable PG/OPA, with safe reporting only.
 */
import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Mocha from "mocha";

console.log = console.warn = console.error = () => undefined;
if (!/^magda-3945-[a-f0-9-]+$/.test(process.env.HARNESS_RUN_ID || "")) {
    throw new Error("Use the integration runner, not an external database");
}
const root = new URL("../../../", import.meta.url);
const files = (await readdir(new URL("magda-llm-services/src/test/", root)))
    .filter((file) => file.endsWith(".spec.ts"))
    .sort()
    .map((file) => `magda-llm-services/src/test/${file}`);
files.push(
    ...[
        "LlmAccessPartialDecision.spec.ts",
        "LlmAccessProfilesMigration.spec.ts",
        "LlmAccessProfilesSupport.spec.ts"
    ].map((file) => `magda-authorization-api/src/test/${file}`)
);
const failures: Array<{ name: string; type: string }> = [];
const perFile = Object.fromEntries(
    files.map((file) => [file, { passed: 0, failed: 0, pending: 0 }])
);
function count(test: any, outcome: "passed" | "failed" | "pending") {
    const file = files.find(
        (file) => test.file === fileURLToPath(new URL(file, root))
    );
    if (file) perFile[file][outcome]++;
}
let stats: any;
class MetadataOnlyReporter {
    constructor(runner: any) {
        runner.on("pass", (test: any) => count(test, "passed"));
        runner.on("pending", (test: any) => count(test, "pending"));
        runner.on("fail", (test: any, error: Error) => {
            count(test, "failed");
            // Never emit error.message/stack/actual/expected: assertions could
            // otherwise disclose a request fixture, prompt or model output.
            failures.push({ name: test.fullTitle(), type: error.name });
        });
        runner.on("end", () => {
            stats = runner.stats;
        });
    }
}
const mocha = new Mocha({ reporter: MetadataOnlyReporter, timeout: 30_000 });
for (const file of files) mocha.addFile(fileURLToPath(new URL(file, root)));
try {
    await mocha.loadFilesAsync();
    const failed = await new Promise<number>((resolve) => mocha.run(resolve));
    const evidence = {
        event: "harness-existing-tests",
        runId: process.env.HARNESS_RUN_ID,
        timestamp: new Date().toISOString(),
        files,
        passed: stats?.passes || 0,
        failed,
        pending: stats?.pending || 0,
        durationMs: stats?.duration,
        failures,
        perFile,
        topology:
            "Existing tests use disposable real PostgreSQL; partial-decision tests use real OPA; many service tests deliberately fake Auth/provider. Not provider E2E."
    };
    process.stdout.write(JSON.stringify(evidence) + "\n");
    if (process.env.HARNESS_EXISTING_EVIDENCE_FILE) {
        await writeFile(
            process.env.HARNESS_EXISTING_EVIDENCE_FILE,
            JSON.stringify(evidence, null, 2) + "\n",
            { mode: 0o600 }
        );
    }
    // Pending is not silently accepted as successful qualification.
    process.exitCode = failed || stats?.pending ? 1 : 0;
} catch (error) {
    process.stdout.write(
        JSON.stringify({
            event: "harness-existing-tests-load-failed",
            type: error instanceof Error ? error.name : "unknown"
        }) + "\n"
    );
    process.exitCode = 1;
}
