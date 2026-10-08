// #3841 Experiment 3/4C: real Chrome through the full Minikube chain
//   Chrome -> ingress-nginx (TLS) -> magda-gateway -> Agent Manager PoC
//          -> Sandbox Service -> DSH (/api/remote.mux + HTTP RPC)
//
// Usage: node e2e-browser.mjs <alice|bob> [--disrupt] [--out result.json]
//   --disrupt also restarts the Agent Manager and the gateway mid-session.
// Prints a JSON report; exits non-zero when a check fails.
import { execSync } from "node:child_process";
import fs from "node:fs";
import { launch, loggedInContext, recordMux, summariseMux, MOUNT, sleep } from "./lib/browser.mjs";

const user = process.argv[2] || "alice";
const disrupt = process.argv.includes("--disrupt");
const outIdx = process.argv.indexOf("--out");
const out = outIdx > 0 ? process.argv[outIdx + 1] : undefined;
const kubectl = (args) => execSync(`kubectl ${args}`, { encoding: "utf8" }).trim();

const report = { user, startedAt: new Date().toISOString(), checks: [] };
function check(name, ok, detail = {}) {
    report.checks.push({ name, ok: !!ok, ...detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail)}`);
}

const browser = await launch();
const ctx = await loggedInContext(browser, `${user}@magda.test`);
const page = await ctx.newPage();
const pageErrors = [];
const rpc = [];
page.on("request", (r) => {
    const m = /\/api\/v0\/agent\/runtime(\/api\/[^?]*)/.exec(r.url());
    if (m && r.method() === "POST") rpc.push(m[1]);
});
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
const mux = recordMux(page);

async function send(text) {
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
}
const downItemsWith = (needle, from = 0) =>
    mux.down.slice(from).filter((m) => m.type === "item" && JSON.stringify(m.value ?? "").includes(needle)).length;
const waitFor = async (fn, timeoutMs, stepMs = 250) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        if (await fn()) return true;
        await sleep(stepMs);
    }
    return false;
};

// 1. boot: index, assets, one physical socket, several logical streams
const t0 = Date.now();
const res = await page.goto(MOUNT);
await page.getByRole("button", { name: "Continue" }).click({ timeout: 8000 }).catch(() => {});
await waitFor(() => mux.opened.size >= 3, 20000);
check("index + assets load, UI boots", res.status() === 200 && pageErrors.length === 0, {
    status: res.status(),
    pageErrors,
    bootMs: Date.now() - t0
});
check("one physical WebSocket carries several logical streams", mux.sockets.length === 1 && mux.opened.size >= 3, {
    socketUrl: mux.sockets[0]?.url,
    ...summariseMux(mux)
});
check(
    "no asset/WebSocket URL escapes the mount",
    mux.sockets.every((s) => s.url.startsWith(MOUNT.replace("https", "wss")))
);

// 2. server -> browser streaming
await page.getByRole("button", { name: "New session" }).first().click();
await page.getByText("Into the Unknown").waitFor({ timeout: 15000 });
let before = mux.down.length;
let start = Date.now();
await send("STREAM 15");
const streamed = await page.getByText("stream complete").first().waitFor({ timeout: 45000 }).then(() => true, () => false);
check("server->browser streaming over remote.mux (15 s turn)", streamed, {
    downlinkFrames: mux.down.length - before,
    seconds: Math.round((Date.now() - start) / 1000)
});

// 3. cancellation
await send("STREAM 120");
await sleep(6000); // ~12 ticks into the model stream
const cancelAt = Date.now();
await page.getByRole("button", { name: "Stop generating" }).click();
const stopped = await waitFor(async () => (await page.getByRole("button", { name: "Stop generating" }).count()) === 0, 15000);
await sleep(2000);
const cancelled = kubectl("-n magda-agent-poc logs -l app.kubernetes.io/name=mock-llm --timestamps --since=5m")
    .split("\n")
    .filter((l) => l.includes("cancelled by client") && Date.parse(l.split(" ")[0]) >= cancelAt - 1000);
check("cancellation reaches the model stream", stopped && cancelled.length > 0, {
    stopMs: Date.now() - cancelAt,
    mockLlm: cancelled.map((l) => l.replace(/^\S+ /, ""))
});

// 4. tool activity (agent bash inside the sandbox)
await send("BASH echo tool-ran-on-$(uname -r)");
const toolOk = await page.getByText(/tool-ran-on-\d/).first().waitFor({ timeout: 45000 }).then(() => true, () => false);
const toolText = toolOk ? await page.getByText(/tool-ran-on-\d/).first().innerText() : "";
check("agent tool call streams back", toolOk, { toolText: toolText.slice(0, 160) });

// 5. browser -> server input: interactive terminal. Keystrokes are unary HTTP
// RPCs (POST api/terminal/write); output streams on the mux (terminal/follow).
const upBefore = mux.up.filter((m) => m.type === "item").length;
const writesBefore = rpc.filter((p) => p === "/api/terminal/write").length;
await page.getByRole("button", { name: "Open right sidebar" }).click().catch(() => {});
await page.getByRole("button", { name: /New terminal/ }).first().click({ timeout: 10000 });
await sleep(2500);
await page.keyboard.type("echo uplink-$((6*7))\n");
const termOk = await waitFor(() => downItemsWith("uplink-42") > 0, 15000);
check("terminal: input via HTTP RPC, output via remote.mux", termOk, {
    terminalWriteRpcs: rpc.filter((p) => p === "/api/terminal/write").length - writesBefore,
    muxUplinkItems: mux.up.filter((m) => m.type === "item").length - upBefore,
    terminalEndpoints: [...new Set(mux.opened.values())].filter((e) => /terminal/i.test(e))
});

// 6. reconnect after the socket is interrupted
if (disrupt) {
    for (const [what, cmd] of [
        ["Agent Manager restart", "-n magda-agent-poc rollout restart deploy/agent-manager"],
        ["magda-gateway restart", "-n magda rollout restart deploy/gateway"]
    ]) {
        const tag = `resume-${Date.now()}`;
        const from = mux.down.length;
        await send(`STREAM 40 ${tag}`);
        await waitFor(async () => downItemsWith("tick-3", from) > 0, 20000);
        const live = mux.sockets.at(-1);
        const t = Date.now();
        kubectl(cmd);
        const dropped = await waitFor(() => live.closedAt !== undefined, 120000, 200);
        const reopened = await waitFor(() => {
            const s = mux.sockets.at(-1);
            return s !== live && s.openedAt > t && !s.closedAt;
        }, 120000, 200);
        const resumed = await page.getByText(`stream complete ${tag}`).first().waitFor({ timeout: 90000 }).then(() => true, () => false);
        check(`reconnect after ${what} mid-stream`, dropped && reopened && resumed, {
            socketDroppedAfterMs: dropped ? live.closedAt - t : undefined,
            newSocketAfterMs: reopened ? mux.sockets.at(-1).openedAt - t : undefined,
            failedReconnectAttempts: mux.sockets.filter((s) => s.openedAt > t && s.closedAt).length,
            turnCompletedAfterReconnect: resumed
        });
    }
}

// 7. refresh on the nested public URL
const sessionTitles = async () =>
    (await page.locator("[role=tree] [role=treeitem]").allInnerTexts())
        .map((t) => t.split("\n")[0].trim())
        .filter((t) => t && t !== "New Session" && t !== "Default workspace");
const sessionsBefore = await sessionTitles();
await page.reload();
await waitFor(() => mux.sockets.at(-1) && !mux.sockets.at(-1).closedAt && mux.opened.size > 0, 20000);
await waitFor(async () => (await sessionTitles()).length >= sessionsBefore.length, 15000);
const sessionsAfter = await sessionTitles();
check(
    "refresh on the public mount reconnects to the same sessions",
    sessionsBefore.length > 0 && sessionsBefore.every((t) => sessionsAfter.includes(t)),
    { url: page.url(), sessionsBefore: sessionsBefore.length, sessionsAfter: sessionsAfter.length }
);

report.mux = summariseMux(mux);
report.httpRpcCounts = rpc.reduce((a, p) => ((a[p] = (a[p] || 0) + 1), a), {});
report.finishedAt = new Date().toISOString();
await page.screenshot({ path: `/tmp/e2e-${user}.png` }).catch(() => {});
await browser.close();
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok).length;
console.log(`${report.checks.length - failed}/${report.checks.length} checks passed`);
process.exit(failed ? 1 : 0);
