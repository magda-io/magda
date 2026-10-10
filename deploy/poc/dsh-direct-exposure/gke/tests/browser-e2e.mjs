// #3848: real Chrome through the GKE chain
//   Chrome -> https://<lb-ip>.sslip.io (L4 NLB) -> ingress-nginx (TLS) -> Agent Manager
//          -> KAS Sandbox Service -> DSH in a gVisor Pod (HTTP + wss /api/remote.mux)
// Stand-in for magda-gateway: the browser context sends the X-Magda-Session
// header (Playwright extraHTTPHeaders, also applied to the WebSocket handshake).
// TLS: the PoC CA is not in Chrome's store, so certificate errors are ignored
// here; tests/external-chain.mjs verifies the chain against the CA.
// Usage: node browser-e2e.mjs [--out file]   (needs `npm install` in ../../tests)
import { dismissPreviewNotice, launch, recordMux, summariseMux, sleep } from "../../tests/lib/browser.mjs";
import { ORIGIN, MOUNT_PATH, NS, kubectl, magdaSession, reporter, currentSandbox } from "./lib/endpoint.mjs";

const { report, check, finish } = reporter("browser-e2e");
const MOUNT = `${ORIGIN}${MOUNT_PATH}`;
const target = currentSandbox();
report.sandbox = { ...target, runtimeClassName: kubectl("-n", NS, "get", "pod", target.sandbox, "-o", "jsonpath={.spec.runtimeClassName}") };

const browser = await launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, extraHTTPHeaders: { "X-Magda-Session": magdaSession() } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
const mux = recordMux(page);
const waitFor = async (fn, timeoutMs, stepMs = 250) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        if (await fn()) return true;
        await sleep(stepMs);
    }
    return false;
};
async function send(text) {
    await dismissPreviewNotice(page);
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
}
const downItemsWith = (needle, from = 0) =>
    mux.down.slice(from).filter((m) => m.type === "item" && JSON.stringify(m.value ?? "").includes(needle)).length;

const t0 = Date.now();
const res = await page.goto(MOUNT);
await page.getByRole("button", { name: "Continue" }).click({ timeout: 8000 }).catch(() => {});
await waitFor(() => mux.opened.size >= 3, 30000);
check("index + assets load and the DSH UI boots in Chrome", res.status() === 200 && pageErrors.length === 0, { status: res.status(), bootMs: Date.now() - t0, pageErrors });
check("one physical wss socket carries several logical streams", mux.sockets.length >= 1 && mux.opened.size >= 3, {
    socketUrl: mux.sockets[0]?.url,
    ...summariseMux(mux)
});
check("the socket is wss on the external origin and mount", mux.sockets.every((s) => s.url.startsWith(MOUNT.replace("https", "wss"))));

const tag = `gke-${Date.now()}`;
const before = mux.down.length;
await send(`STREAM 15 ${tag}`);
const streamed = await waitFor(() => downItemsWith(tag, before) >= 5, 60000);
check("server -> browser streaming over remote.mux (mock LLM, 15 s turn)", streamed, {
    downlinkFramesDuringTurn: mux.down.length - before,
    itemsWithTag: downItemsWith(tag, before)
});
await sleep(16000);
check("socket stayed open through the turn", mux.closed.length === 0, { socketsClosed: mux.closed.length });

const amLines = kubectl("-n", NS, "logs", "deploy/agent-manager", "--since=3m").split("\n").filter((l) => l.includes('"ws-handshake"'));
const lastHs = amLines.length ? JSON.parse(amLines.at(-1)) : {};
report.agentManagerHandshake = lastHs;
check("browser handshake reached Agent Manager with the external Host/Origin and X-Forwarded-Proto https", lastHs.origin === ORIGIN && lastHs.hasMagdaSession && lastHs.xForwardedProto === "https", lastHs);
await browser.close();
process.exit(finish() ? 1 : 0);
