// #3841 Experiment 5 security checks through the full Minikube chain and at
// the Sandbox Service. Run once per DSH auth variant:
//   node security.mjs stock   # Agent Manager AUTH_MODE=managed-cookie, stock DSH
//   node security.mjs nba     # Agent Manager AUTH_MODE=none, DSH --no-browser-auth
// Options: --user <alice|bob> (default alice) --out <file>. The user's claim
// must use the matching dsh-*-<variant> template.
import { execSync } from "node:child_process";
import fs from "node:fs";
import { login, openMux, request, MOUNT_PATH, ORIGIN, AUTHORITY, USERS } from "./lib/magda.mjs";

const variant = process.argv[2] || "stock";
const outIdx = process.argv.indexOf("--out");
const out = outIdx > 0 ? process.argv[outIdx + 1] : undefined;
const userIdx = process.argv.indexOf("--user");
const user = userIdx > 0 ? process.argv[userIdx + 1] : "alice";
const NS = "magda-agent-poc";
const kubectl = (args) => execSync(`kubectl ${args}`, { encoding: "utf8" }).trim();
const report = { variant, user, checks: [] };
function check(name, ok, detail = {}) {
    report.checks.push({ name, ok: !!ok, ...detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail)}`);
}

const claim = JSON.parse(kubectl(`-n ${NS} get sandboxclaim -l magda.io/agent-user=${USERS[user].id} -o json`)).items[0];
const sandbox = claim.status.sandbox.name;
const svc = `${sandbox}.${NS}.svc.cluster.local`;
report.sandbox = sandbox;
report.template = claim.spec.warmPoolRef.name;
const amMode = kubectl(`-n ${NS} get deploy agent-manager -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="AUTH_MODE")].value}'`);
report.agentManagerAuthMode = amMode;

const cookie = await login(user);

// --- Magda authentication is the outer boundary ---------------------------
let r = await request("GET", MOUNT_PATH);
check("anonymous HTTP to the agent route is rejected by Magda before DSH", r.status === 401, { status: r.status, body: r.body.slice(0, 60) });
r = await openMux({});
check("anonymous WebSocket upgrade is rejected before upgrade", r.status === 401, { status: r.status, body: (r.body || "").trim().slice(0, 60) });
r = await openMux({ cookie: "connect.sid=s%3Aforged.signature" });
check("forged Magda session cookie is rejected", r.status === 401, { status: r.status });

// --- authenticated, trusted authority ------------------------------------
r = await request("GET", MOUNT_PATH, { headers: { cookie } });
const setCookies = r.headers["set-cookie"] || [];
check("authenticated index loads", r.status === 200, { status: r.status });
check(
    "no DSH token or DSH cookie reaches the browser",
    !setCookies.some((c) => /^dsh-auth-/.test(c)) && !/[?&]token=/.test(r.body),
    { setCookieNames: setCookies.map((c) => c.split("=")[0]) }
);
// --- CSP relaxation is scoped to the agent mount (review task E) -----------
// The gateway's helmetPerPath entry for /api/v0/agent/runtime relaxes
// script-src for DSH's UI; every other Magda path keeps the strict default.
const scriptSrc = (res) =>
    /(?:^|;)\s*script-src\s+([^;]*)/.exec(res.headers["content-security-policy"] || "")?.[1].trim();
const cspAgent = scriptSrc(r);
const cspWhoami = scriptSrc(await request("GET", "/api/v0/auth/users/whoami", { headers: { cookie } }));
const cspSibling = scriptSrc(await request("GET", "/api/v0/agent/runtime-sibling/", { headers: { cookie } }));
report.csp = { agentMount: cspAgent, whoami: cspWhoami, siblingPath: cspSibling };
check(
    "agent mount carries the relaxed CSP (script-src 'unsafe-inline' 'unsafe-eval')",
    /'unsafe-inline'/.test(cspAgent) && /'unsafe-eval'/.test(cspAgent),
    { scriptSrc: cspAgent }
);
check(
    "other Magda paths keep the strict CSP (script-src 'self', no unsafe-*)",
    cspWhoami === "'self'" && cspSibling === "'self'",
    { whoami: cspWhoami, siblingPath: cspSibling }
);

r = await openMux({ cookie });
check("authenticated same-origin WebSocket upgrade succeeds", r.status === 101, { status: r.status });
r.ws?.close();
r = await request("POST", `${MOUNT_PATH}api/session/list`, {
    headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
    body: "{}"
});
check("authenticated same-origin RPC succeeds", r.status === 200, { status: r.status });

// --- Origin checks through the proxy ---------------------------------------
// WebSocket: magda-gateway's default Origin validation (#3843, allowlist derived from
// global.externalUrl) rejects the handshake before it reaches Agent Manager / DSH.
// HTTP: the gateway doesn't check Origin; DSH's Host/Origin fence rejects it.
const amHandshakesWithEvilOrigin = () =>
    kubectl(`-n ${NS} logs deploy/agent-manager --since=10m`)
        .split("\n")
        .filter((l) => l.includes('"ws-handshake"') && l.includes("https://evil.test")).length;
const evilBefore = amHandshakesWithEvilOrigin();
r = await openMux({ cookie, origin: "https://evil.test" });
check("cross-site Origin WebSocket is rejected by the gateway before Agent Manager / DSH", r.status === 403 && amHandshakesWithEvilOrigin() === evilBefore, {
    status: r.status,
    body: (r.body || "").trim().slice(0, 40),
    reachedAgentManager: amHandshakesWithEvilOrigin() !== evilBefore
});
r = await request("POST", `${MOUNT_PATH}api/session/list`, {
    headers: { cookie, origin: "https://evil.test", "content-type": "application/json" },
    body: "{}"
});
check("cross-site Origin RPC is rejected by DSH", r.status === 403, { status: r.status });
r = await request("POST", `${MOUNT_PATH}api/session/list`, {
    headers: { cookie, "sec-fetch-site": "cross-site", "content-type": "application/json" },
    body: "{}"
});
check("Sec-Fetch-Site: cross-site RPC is rejected by DSH", r.status === 403, { status: r.status });

// --- undeclared Host --------------------------------------------------------
r = await request("GET", MOUNT_PATH, { headers: { cookie }, host: "evil.test:18443" });
check("undeclared external Host does not reach Magda (ingress host rule)", r.status === 404, { status: r.status });

// --- DSH fence at the Sandbox Service (as the allowed Agent Manager peer) ---
function fromAgentManager(script) {
    return JSON.parse(
        kubectl(`-n ${NS} exec deploy/agent-manager -- node -e '${script.replace(/'/g, "'\\''")}'`)
    );
}
const probe = fromAgentManager(`
const http=require("http");
const go=(host,path,method,extra={})=>new Promise(r=>{const q=http.request({host:"${svc}",port:3080,path,method,headers:{host,...extra}},s=>{s.resume();r(s.statusCode)});q.on("error",e=>r(String(e.code)));q.end(method==="POST"?"{}":undefined)});
const ws=(host,origin)=>new Promise(r=>{const q=http.request({host:"${svc}",port:3080,path:"/api/remote.mux",headers:{host,origin,connection:"Upgrade",upgrade:"websocket","sec-websocket-version":"13","sec-websocket-key":"dGhlIHNhbXBsZSBub25jZQ=="}});q.on("upgrade",(s,sock)=>{sock.destroy();r(101)});q.on("response",s=>{s.resume();r(s.statusCode)});q.on("error",e=>r(String(e.code)));q.end()});
(async()=>{const o={};
o.indexDeclared=await go("${AUTHORITY}","/","GET");
o.indexUndeclared=await go("evil.test","/","GET");
o.apiDeclared=await go("${AUTHORITY}","/api/session/list","POST",{"content-type":"application/json"});
o.apiUndeclared=await go("evil.test","/api/session/list","POST",{"content-type":"application/json"});
o.apiLoopbackHost=await go("127.0.0.1:3080","/api/session/list","POST",{"content-type":"application/json"});
o.wsDeclared=await ws("${AUTHORITY}","${ORIGIN}");
o.wsUndeclaredHost=await ws("evil.test","https://evil.test");
o.wsForeignOrigin=await ws("${AUTHORITY}","https://evil.test");
console.log(JSON.stringify(o))})()`);
report.serviceLevel = probe;
if (variant === "nba") {
    check("Service: declared Host index served without any token/cookie", probe.indexDeclared === 200, probe);
    check("Service: undeclared Host index -> 403", probe.indexUndeclared === 403);
    check("Service: undeclared Host /api -> 403", probe.apiUndeclared === 403);
    check("Service: undeclared Host WebSocket -> 403", probe.wsUndeclaredHost === 403);
    check("Service: foreign Origin WebSocket -> 403", probe.wsForeignOrigin === 403);
    check(
        "Service: a peer that can reach the port and sends Host: 127.0.0.1 is fully admitted (fence is not access control)",
        probe.apiLoopbackHost === 200,
        { apiLoopbackHost: probe.apiLoopbackHost }
    );
    const files = kubectl(`-n ${NS} exec ${sandbox} -- sh -c 'ls -a $DSH_HOME'`);
    check("no DSH browser-session credential file is created", !files.includes(".credentials.yaml"), { dshHome: files.split("\n") });
    const logs = kubectl(`-n ${NS} logs ${sandbox}`);
    check("printed URL carries no launch token", !/token=/.test(logs) && /browser authentication is off/.test(logs));
} else {
    check("Service: without the DSH cookie every route needs authentication", probe.indexDeclared === 401 && probe.apiDeclared === 401 && probe.wsDeclared === 401, probe);
    check("Service: undeclared Host /api -> 403 (fence before auth)", probe.apiUndeclared === 403 && probe.wsUndeclaredHost === 403);
    const files = kubectl(`-n ${NS} exec ${sandbox} -- sh -c 'ls -a $DSH_HOME'`);
    check("stock DSH keeps its cookie-signing secret on the PVC", files.includes(".credentials.yaml"));
    const logs = kubectl(`-n ${NS} logs ${sandbox}`);
    check(
        "launch token is redacted from the Pod log (hand-off via file + pods/exec)",
        /token=<redacted>/.test(logs) && !/token=(?!<redacted>)[A-Za-z0-9_-]{8,}/.test(logs)
    );
}

if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok).length;
console.log(`${report.checks.length - failed}/${report.checks.length} checks passed`);
process.exit(failed ? 1 : 0);
