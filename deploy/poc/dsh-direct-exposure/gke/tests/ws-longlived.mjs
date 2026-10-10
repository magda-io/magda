// #3848: hold one idle /api/remote.mux socket through the real GKE chain
// (L4 NLB -> ingress-nginx -> Agent Manager -> KAS Service -> DSH) and report
// when / how it closed and how many DSH heartbeat pings arrived (the client
// answers pings with pongs, as a browser does). A socket still open at the end
// is probed with a client ping that must come back as a pong.
//   node ws-longlived.mjs <user-uuid> <seconds> [--reload-at <s>] [--label <text>] [--out file]
// --reload-at triggers an ingress-nginx configuration reload while the socket
// is open (it toggles proxy-body-size 16m/17m on the PoC Ingress).
import { NS, kubectl, magdaSession, openMux, currentSandbox } from "./lib/endpoint.mjs";
import fs from "node:fs";

const [userId, secondsArg = "300"] = process.argv.slice(2);
const opt = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
};
const seconds = Number(secondsArg);
const reloadAt = opt("--reload-at") ? Number(opt("--reload-at")) : undefined;
const ingressAnnotations = JSON.parse(kubectl("-n", NS, "get", "ingress", "agent-runtime", "-o", "jsonpath={.metadata.annotations}"));
const started = Date.now();
const r = await openMux({ session: magdaSession(userId) });
if (r.status !== 101) {
    console.log(JSON.stringify({ userId, handshake: r.status, body: r.body }));
    process.exit(1);
}
let firstPingAt, lastPingAt, reloadedAt;
r.ws.on("ping", () => {
    firstPingAt ??= Date.now();
    lastPingAt = Date.now();
});
if (reloadAt !== undefined) {
    setTimeout(() => {
        reloadedAt = Date.now();
        // Flip an annotation that changes the rendered nginx.conf (a metadata-only
        // change is just a "Sync" and does not reload nginx).
        const current = kubectl("-n", NS, "get", "ingress", "agent-runtime", "-o", "jsonpath={.metadata.annotations.nginx\\.ingress\\.kubernetes\\.io/proxy-body-size}");
        kubectl("-n", NS, "annotate", "--overwrite", "ingress", "agent-runtime", `nginx.ingress.kubernetes.io/proxy-body-size=${current === "17m" ? "16m" : "17m"}`);
    }, reloadAt * 1000).unref();
}
const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ outcome: "still-open", closeCode: undefined }), seconds * 1000);
    r.ws.on("close", (code) => {
        clearTimeout(timer);
        resolve({ outcome: "closed", closeCode: code ?? "tcp-close-without-close-frame" });
    });
});
// A socket that saw no traffic can look open even if a middlebox dropped its
// state silently, so finish with a client ping that must come back as a pong
// through the whole chain.
const probe =
    result.outcome === "still-open"
        ? await (async () => {
              const t = Date.now();
              const ok = await r.ws.ping(10000);
              return { endToEndPingPong: ok, roundTripMs: ok ? Date.now() - t : undefined };
          })()
        : undefined;
const report = {
    label: opt("--label"),
    userId,
    sandbox: (() => {
        try {
            return currentSandbox(userId).template;
        } catch {
            return undefined;
        }
    })(),
    ingressTimeouts: {
        proxyReadTimeout: ingressAnnotations["nginx.ingress.kubernetes.io/proxy-read-timeout"] ?? "(default 60)",
        proxySendTimeout: ingressAnnotations["nginx.ingress.kubernetes.io/proxy-send-timeout"] ?? "(default 60)"
    },
    startedAt: new Date(started).toISOString(),
    requestedSeconds: seconds,
    heldSeconds: Math.round((Date.now() - started) / 1000),
    ...result,
    probe,
    pings: r.ws.pings,
    firstPingAfterMs: firstPingAt ? firstPingAt - started : undefined,
    lastPingAfterS: lastPingAt ? Math.round((lastPingAt - started) / 1000) : undefined,
    reloadAfterS: reloadedAt ? Math.round((reloadedAt - started) / 1000) : undefined,
    closedSecondsAfterReload: reloadedAt && result.outcome === "closed" ? Math.round((Date.now() - reloadedAt) / 1000) : undefined
};
console.log(JSON.stringify(report));
if (opt("--out")) fs.writeFileSync(opt("--out"), JSON.stringify(report, null, 2) + "\n");
r.ws.close();
setTimeout(() => process.exit(0), 600);
