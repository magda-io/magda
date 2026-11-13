// LibreOffice Kit CLI entry that DSH's Office skills give the agent
// (skill-office `cli`, run as `<node> <cli> ...`).
//
// Each Kit render, conversion or recalculation peaks at about 1.2 GiB, and the
// agent can start several as parallel tool calls. This wrapper runs the
// installed Kit CLI unchanged, but under an exclusive flock(1) on one lock file
// in the agent-writable working tree, so agent Kit commands in a Workspace run
// one at a time. The kernel releases the lock when the command exits or is
// killed. `capabilities` is cheap and never waits.
//
// Environment:
//   MAGDA_LIBREOFFICE_KIT_LOCK                  lock file path
//   MAGDA_LIBREOFFICE_KIT_LOCK_TIMEOUT_SECONDS  longest wait (default 900)
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const KIT_CLI =
    "/usr/local/lib/magda-agent/dsh/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js";
const FLOCK = "/usr/bin/flock";
// flock(1) exit status for a lock conflict or timeout (EX_TEMPFAIL).
const BUSY = 75;
const args = process.argv.slice(2);
const lock =
    process.env.MAGDA_LIBREOFFICE_KIT_LOCK ||
    path.join(
        process.env.MAGDA_PYTHON_TMPDIR || os.tmpdir(),
        "libreoffice-kit.lock"
    );
const timeout = Number(
    process.env.MAGDA_LIBREOFFICE_KIT_LOCK_TIMEOUT_SECONDS || 900
);

function run(command, commandArgs) {
    return new Promise((resolve) => {
        const child = spawn(command, commandArgs, { stdio: "inherit" });
        const forward = (signal) => child.kill(signal);
        const signals = ["SIGTERM", "SIGINT", "SIGHUP", "SIGQUIT"];
        for (const signal of signals) process.on(signal, forward);
        child.on("error", (error) => {
            console.error(`magda: cannot run ${command}: ${error.message}`);
            resolve({ code: 127 });
        });
        child.on("close", (code, signal) => {
            for (const name of signals) process.off(name, forward);
            resolve({ code, signal });
        });
    });
}

function exit({ code, signal }) {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
}

if (args[0] === "capabilities")
    exit(await run(process.execPath, [KIT_CLI, ...args]));

const kit = [process.execPath, KIT_CLI, ...args];
try {
    mkdirSync(path.dirname(lock), { recursive: true });
} catch (error) {
    console.error(
        `magda: cannot create ${path.dirname(lock)}: ${error.message}`
    );
    process.exit(1);
}
// Probe without waiting (running `true`, never the Kit), so a wait can be
// reported; then run the Kit exactly once under a bounded wait for the lock.
const probe = await run(FLOCK, [
    "--nonblock",
    "--conflict-exit-code",
    String(BUSY),
    lock,
    "/bin/true"
]);
if (probe.code === BUSY)
    console.error(
        "magda: waiting for another LibreOffice Kit command in this Workspace to finish (one runs at a time)"
    );
// The Kit CLI exits 0 or 1, so BUSY here means flock timed out before running it.
const result = await run(FLOCK, [
    "--timeout",
    String(timeout),
    "--conflict-exit-code",
    String(BUSY),
    lock,
    ...kit
]);
if (result.code === BUSY && !result.signal)
    process.stdout.write(
        `${JSON.stringify({
            code: "busy",
            error: `Another LibreOffice Kit command in this Workspace was still running after ${timeout} s. Run Kit commands one at a time and retry later.`
        })}\n`
    );
exit(result);
