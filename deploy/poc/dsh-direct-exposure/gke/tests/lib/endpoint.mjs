// #3848: talk to the real GKE external endpoint
//   https://<lb-ip>.sslip.io -> L4 NLB -> ingress-nginx -> Agent Manager -> KAS Service -> DSH
// TLS is verified against the PoC CA (gke/.tls/ca.crt) with the sslip.io name
// as SNI/Host. No kubectl port-forward anywhere on the data path.
//
// Stand-in for magda-gateway: there is no Magda auth stack, so the client
// mints the X-Magda-Session JWT (HS256, the namespace's jwt-secret) that the
// gateway would attach after Magda session auth. Agent Manager verifies it.
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "../../../tests/lib/ws.mjs";

const GKE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = (name, dflt) => process.env[name] || dflt;
export const PROJECT = env("PROJECT", "ai4m-p11-dev-a8f7");
export const ZONE = env("ZONE", "australia-southeast1-a");
export const CLUSTER = env("CLUSTER", "ai4m-p11-dev");
export const KUBE_CONTEXT = env("KUBE_CONTEXT", `gke_${PROJECT}_${ZONE}_${CLUSTER}`);
export const NS = env("NS", "magda-gke-3848");
export const INGRESS_NS = env("INGRESS_NS", "ingress-nginx-3848");
export const TEST_USER_ID = env("TEST_USER_ID", "00000000-0000-4000-8000-00000000a11c");

export const kubectl = (...args) =>
    execFileSync("kubectl", ["--context", KUBE_CONTEXT, ...args], { encoding: "utf8" }).trim();

export const LB_IP =
    process.env.LB_IP ||
    kubectl("-n", INGRESS_NS, "get", "svc", "ingress-nginx-3848-controller", "-o", "jsonpath={.status.loadBalancer.ingress[0].ip}");
export const HOST = process.env.EXTERNAL_HOST || `${LB_IP.replace(/\./g, "-")}.sslip.io`;
export const ORIGIN = `https://${HOST}`;
export const MOUNT_PATH = "/api/v0/agent/runtime/";
export const CA = fs.readFileSync(path.join(GKE_DIR, ".tls/ca.crt"));
const JWT_SECRET = fs.readFileSync(path.join(GKE_DIR, ".tls/jwt-secret"), "utf8").trim();

const b64url = (b) => Buffer.from(b).toString("base64url");
/** What magda-gateway would attach for an authenticated user (stand-in). */
export function magdaSession(userId = TEST_USER_ID, ttlSeconds = 3600) {
    const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const p = b64url(JSON.stringify({ userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
    const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url");
    return `${h}.${p}.${sig}`;
}

/** HTTPS request to the LB IP (verified TLS; SNI + Host = the sslip.io name). */
export function request(method, urlPath, { headers = {}, body, host = HOST, port = 443, tls = true } = {}) {
    const mod = tls ? https : http;
    return new Promise((resolve, reject) => {
        const req = mod.request(
            {
                host: LB_IP,
                port,
                servername: tls ? HOST : undefined,
                ca: CA,
                method,
                path: urlPath,
                headers: { host, ...headers }
            },
            (res) => {
                const tlsInfo = tls ? { protocol: res.socket.getProtocol?.(), authorized: res.socket.authorized } : undefined;
                const chunks = [];
                res.on("data", (d) => chunks.push(d));
                res.on("end", () =>
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString(),
                        tls: tlsInfo
                    })
                );
            }
        );
        req.on("error", reject);
        req.end(body);
    });
}
/** Open DSH's /api/remote.mux through the external endpoint (wss). */
export function openMux({ session = magdaSession(), host = HOST, origin = ORIGIN, path: p = `${MOUNT_PATH}api/remote.mux`, extra = {} } = {}) {
    const headers = { Host: host, ...extra };
    if (origin) headers.Origin = origin;
    if (session) headers["X-Magda-Session"] = session;
    return connect({ connectHost: LB_IP, connectPort: 443, tls: true, servername: HOST, path: p, headers });
}

/** DSH unary RPC (POST api/<method>) as the DSH web client sends it. */
export async function rpc(method, args, session = magdaSession()) {
    const r = await request("POST", `${MOUNT_PATH}api/${method}`, {
        headers: { "x-magda-session": session, origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method, payload: { args } })
    });
    let parsed;
    try {
        parsed = JSON.parse(r.body);
    } catch {}
    if (r.status !== 200 || !parsed?.result?.ok) throw new Error(`${method}: HTTP ${r.status} ${r.body.slice(0, 300)}`);
    return parsed.result.value;
}

export function reporter(name) {
    const report = { test: name, endpoint: ORIGIN, lbIp: LB_IP, startedAt: new Date().toISOString(), checks: [] };
    const check = (label, ok, detail = {}) => {
        report.checks.push({ name: label, ok: !!ok, ...detail });
        console.log(`${ok ? "PASS" : "FAIL"} ${label} ${JSON.stringify(detail)}`);
    };
    const finish = () => {
        const i = process.argv.indexOf("--out");
        if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(report, null, 2) + "\n");
        const failed = report.checks.filter((c) => !c.ok).length;
        console.log(`${report.checks.length - failed}/${report.checks.length} checks passed`);
        return failed;
    };
    return { report, check, finish };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function currentSandbox(userId = TEST_USER_ID) {
    const claim = JSON.parse(kubectl("-n", NS, "get", "sandboxclaim", "-l", `magda.io/agent-user=${userId}`, "-o", "json")).items[0];
    return { claim: claim.metadata.name, template: claim.spec.warmPoolRef.name, sandbox: claim.status.sandbox.name };
}
