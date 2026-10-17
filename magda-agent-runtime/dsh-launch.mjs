// Launch-token hand-off for stock DSH (#3841 review, task C).
//
//   tini -> magda-agent-entrypoint -> node dsh-launch.mjs dsh web ... -> DSH
//
// DSH prints its one-time browser launch token only on stdout, in the startup
// line `dsh web: <publicUrl>?token=… (LAN: http://<podIP>:3080/?token=…)`.
// This wrapper:
//   - spawns the command and copies its stdout/stderr line by line with every
//     `token=` value redacted, so the token never reaches `kubectl logs` or log
//     aggregation;
//   - writes the token to DSH_LAUNCH_TOKEN_FILE (default
//     /run/magda-agent/dsh-launch-token, an in-memory emptyDir), mode 0600,
//     atomically (temp file + rename). Agent Manager reads it via pods/exec;
//   - removes a stale file first: the emptyDir outlives a container restart,
//     the token does not;
//   - forwards SIGTERM/SIGINT/SIGHUP/SIGQUIT to DSH and exits with its code.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const TOKEN_FILE =
    process.env.DSH_LAUNCH_TOKEN_FILE || "/run/magda-agent/dsh-launch-token";
const TOKEN = /[?&]token=([A-Za-z0-9_-]+)/g;
// Redact any `token=` value, not only the URL query form the token is read from.
const REDACT = /(\btoken=)[A-Za-z0-9_-]+/g;
const [command, ...args] = process.argv.slice(2);
if (!command) {
    console.error("usage: dsh-launch.mjs <command> [args...]");
    process.exit(64);
}

fs.rmSync(TOKEN_FILE, { force: true });
let lastToken;
function writeToken(token) {
    if (token === lastToken) return;
    const tmp = path.join(
        path.dirname(TOKEN_FILE),
        `.${path.basename(TOKEN_FILE)}.${process.pid}`
    );
    fs.writeFileSync(tmp, token, { mode: 0o600 });
    fs.renameSync(tmp, TOKEN_FILE);
    lastToken = token;
    console.log(`magda-agent: DSH launch token written to ${TOKEN_FILE}`);
}

const child = spawn(command, args, { stdio: ["inherit", "pipe", "pipe"] });

function relay(input, output) {
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    lines.on("line", (line) => {
        for (const m of line.matchAll(TOKEN)) {
            try {
                writeToken(m[1]);
            } catch (e) {
                console.error(
                    `magda-agent: cannot write ${TOKEN_FILE}: ${e.message}`
                );
            }
        }
        output.write(`${line.replace(REDACT, "$1<redacted>")}\n`);
    });
}
relay(child.stdout, process.stdout);
relay(child.stderr, process.stderr);

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP", "SIGQUIT"]) {
    process.on(signal, () => child.kill(signal));
}
child.on("error", (e) => {
    console.error(`magda-agent: cannot start ${command}: ${e.message}`);
    process.exit(127);
});
// "close" fires after the child's stdio is drained, so no output is lost.
child.on("close", (code, signal) =>
    process.exit(code ?? 128 + (os.constants.signals[signal] ?? 0))
);
