// #3848: the external endpoint reaches a gVisor Sandbox through
//   client -> L4 passthrough NLB (<lb-ip>:443) -> ingress-nginx (TLS) -> Agent Manager
//          -> KAS Sandbox Service :3080 -> DSH (HTTP + /api/remote.mux)
// with verified HTTPS and a WebSocket upgrade (wss). No port-forward.
// Usage: node external-chain.mjs [--out file]
import crypto from "node:crypto";
import {
    ORIGIN, HOST, MOUNT_PATH, NS, kubectl, magdaSession, openMux, request, rpc, reporter, currentSandbox, sleep
} from "./lib/endpoint.mjs";

const { report, check, finish } = reporter("external-chain");
const target = currentSandbox();
const pod = JSON.parse(kubectl("-n", NS, "get", "pod", target.sandbox, "-o", "json"));
report.sandbox = { ...target, runtimeClassName: pod.spec.runtimeClassName ?? "(default: runc)", node: pod.spec.nodeName, podIP: pod.status.podIP };
const session = magdaSession();

// --- plain HTTP on the NLB: ingress-nginx redirects to HTTPS ---------------
let r = await request("GET", MOUNT_PATH, { tls: false, port: 80 });
check("HTTP :80 through the NLB is redirected to HTTPS by ingress-nginx", [301, 308].includes(r.status) && r.headers.location?.startsWith(`https://${HOST}/`), { status: r.status, location: r.headers.location });

// --- TLS terminates at ingress-nginx (the NLB passes TCP through) -----------
r = await request("GET", MOUNT_PATH);
check("HTTPS: certificate for the sslip.io name verifies against the PoC CA", r.tls.authorized === true, { tlsProtocol: r.tls.protocol });
check("anonymous request reaches Agent Manager and is rejected before DSH", r.status === 401 && /Magda authentication required/.test(r.body), { status: r.status, body: r.body.slice(0, 60) });

r = await request("GET", MOUNT_PATH, { headers: { "x-magda-session": session } });
const setCookies = r.headers["set-cookie"] || [];
check("authenticated index is served by DSH in the Sandbox", r.status === 200 && /<html/i.test(r.body), { status: r.status, contentType: r.headers["content-type"], bytes: r.body.length });
check("no DSH token or DSH cookie reaches the client", !setCookies.some((c) => /^dsh-auth-/.test(c)) && !/[?&]token=/.test(r.body), { setCookieNames: setCookies.map((c) => c.split("=")[0]) });

r = await request("GET", MOUNT_PATH, { headers: { "x-magda-session": session }, host: "evil.test" });
check("undeclared Host is not routed (ingress host rule)", r.status === 404, { status: r.status });

// --- WebSocket upgrade through the NLB + ingress-nginx ----------------------
r = await openMux({ session: null });
check("anonymous WebSocket upgrade is rejected before DSH", r.status === 401, { status: r.status });

const t0 = Date.now();
r = await openMux({ session });
check("wss /api/remote.mux upgrade succeeds end to end (101)", r.status === 101, { status: r.status, secWebSocketExtensions: r.headers["sec-websocket-extensions"] });
if (r.ws) {
    const gotPing = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 10000);
        r.ws.once("ping", () => {
            clearTimeout(timer);
            resolve(true);
        });
    });
    check("DSH heartbeat frames arrive over the socket (server -> client)", gotPing, { firstPingAfterMs: Date.now() - t0 });
    r.ws.close();
}

// Origin: with no magda-gateway in front, the gateway's handshake Origin check
// (#3843) is NOT exercised here; DSH's own fence is what rejects it.
r = await openMux({ session, origin: "https://evil.test" });
check("cross-site Origin WebSocket is rejected (by DSH's fence; gateway check not in this chain)", r.status === 403, { status: r.status, body: (r.body || "").trim().slice(0, 40) });
r = await request("POST", `${MOUNT_PATH}api/session/list`, {
    headers: { "x-magda-session": session, origin: "https://evil.test", "content-type": "application/json" },
    body: "{}"
});
check("cross-site Origin RPC is rejected by DSH", r.status === 403, { status: r.status });

// --- DSH RPC over HTTPS: create a session and send a prompt to the mock LLM --
const init = await rpc("workspace/initializeDefault", {});
const workspaceId = init?.workspace?.workspaceId;
check("DSH RPC: default Workspace initialized (PVC-backed)", !!workspaceId, { path: init?.workspace?.path });
const { sessionId } = await rpc("session/create", { request: { workspaceId } });
const accepted = await rpc("session/prompt", {
    request: { requestId: crypto.randomUUID(), sessionId, mode: "queue", content: [{ type: "text", text: "STREAM 2 gke-3848" }] }
});
check("DSH RPC: prompt accepted (mock LLM turn)", accepted.accepted === true, { sessionId });
let mockCalls = 0;
for (let i = 0; i < 20 && !mockCalls; i++) {
    await sleep(1000);
    mockCalls = kubectl("-n", NS, "logs", "deploy/mock-llm", "--since=2m").split("\n").filter((l) => l.includes("gke-3848")).length;
}
check("the gVisor Sandbox called the in-cluster mock LLM (DNS + Service egress)", mockCalls > 0, { mockLlmLogLines: mockCalls });

const amLog = kubectl("-n", NS, "logs", "deploy/agent-manager", "--since=5m").split("\n").filter((l) => l.includes('"ws-handshake"')).at(-1);
report.agentManagerLastHandshake = amLog ? JSON.parse(amLog) : undefined;
process.exit(finish() ? 1 : 0);
