// #3841 review task A: a claim adopts a warm Sandbox whose DSH started (and
// wrote its launch token) before the user existed.
//
//   1. scale one SandboxWarmPool to 1 and wait for the warm Sandbox, PVC and a
//      Ready Pod (DSH serving);
//   2. record Sandbox/PVC/Pod UID/restartCount, the redacted `dsh web:` line,
//      /data/.created-at and the token file's hash + mtime (never the token);
//   3. claim it for the user (scripts/claim.sh) and verify adoption: same
//      Sandbox/Pod/PVC, DSH not restarted, Agent Manager's stock token exchange
//      uses the pre-claim token (one dsh-cookie-acquired), the browser works
//      (e2e-browser.mjs), and the pool replenishes with a different Sandbox/PVC.
//
// Usage: node warmpool-adoption.mjs [--user alice] [--pool dsh-gvisor-stock]
//        [--keep-pool] [--out file]
// Needs Agent Manager AUTH_MODE=managed-cookie and a *-stock pool.
import { execFileSync, execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { login, request, MOUNT_PATH, ORIGIN, USERS } from "./lib/magda.mjs";
import { sleep } from "./lib/browser.mjs";

const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : dflt;
};
const user = arg("--user", "alice");
const pool = arg("--pool", "dsh-gvisor-stock");
const out = arg("--out");
const keepPool = process.argv.includes("--keep-pool");
const NS = "magda-agent-poc";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = "/run/magda-agent/dsh-launch-token";
const kubectl = (args) => execSync(`kubectl ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const json = (args) => JSON.parse(kubectl(`${args} -o json`));
const exec = (pod, script) =>
    execFileSync("kubectl", ["-n", NS, "exec", pod, "-c", "agent", "--", "sh", "-c", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const report = { user, pool, startedAt: new Date().toISOString(), checks: [] };
function check(name, ok, detail = {}) {
    report.checks.push({ name, ok: !!ok, ...detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail)}`);
}
async function waitFor(fn, timeoutMs, stepMs = 1000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        try {
            const v = await fn();
            if (v) return v;
        } catch {}
        await sleep(stepMs);
    }
    return undefined;
}

const authMode = kubectl(`-n ${NS} get deploy agent-manager -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="AUTH_MODE")].value}'`);
report.agentManagerAuthMode = authMode;
if (authMode !== "managed-cookie" || !pool.endsWith("-stock")) {
    throw new Error("needs AUTH_MODE=managed-cookie and a *-stock pool");
}

// Sandboxes currently owned by the pool (warm, not yet adopted).
const warmSandboxes = () =>
    json(`-n ${NS} get sandboxes`).items.filter((s) =>
        (s.metadata.ownerReferences || []).some((o) => o.kind === "SandboxWarmPool" && o.name === pool)
    );
const podReady = (pod) =>
    (pod.status?.conditions || []).some((c) => c.type === "Ready" && c.status === "True");
const pvcOf = (pod) => pod.spec.volumes.find((v) => v.persistentVolumeClaim)?.persistentVolumeClaim.claimName;
function snapshot(sandboxName) {
    const sandbox = json(`-n ${NS} get sandbox ${sandboxName}`);
    // Agent Sandbox v1.0.4 names the Pod after the Sandbox; confirm via the
    // Pod's controller ownerReference rather than assuming it.
    const pods = json(`-n ${NS} get pods`).items.filter((p) =>
        (p.metadata.ownerReferences || []).some((o) => o.kind === "Sandbox" && o.uid === sandbox.metadata.uid)
    );
    const pod = pods[0];
    const logs = kubectl(`-n ${NS} logs ${pod.metadata.name} -c agent`);
    const startup = logs.split("\n").filter((l) => l.startsWith("dsh web: "));
    return {
        sandbox: sandboxName,
        sandboxUid: sandbox.metadata.uid,
        sandboxCreatedAt: sandbox.metadata.creationTimestamp,
        podsOwnedBySandbox: pods.map((p) => p.metadata.name),
        pod: pod.metadata.name,
        podUid: pod.metadata.uid,
        podReady: podReady(pod),
        restartCount: pod.status.containerStatuses[0].restartCount,
        pvc: pvcOf(pod),
        pvcUid: json(`-n ${NS} get pvc ${pvcOf(pod)}`).metadata.uid,
        startupLinePresent: startup.length > 0,
        startupLineRedacted: startup.length > 0 && startup.every((l) => /token=<redacted>/.test(l)),
        rawTokenInLog: /token=[A-Za-z0-9_-]{16,}/.test(logs),
        volumeCreatedAt: exec(pod.metadata.name, "cat /data/.created-at"),
        tokenFileSha256: exec(pod.metadata.name, `sha256sum ${TOKEN_FILE} | cut -c1-12`),
        tokenFileMtime: new Date(Number(exec(pod.metadata.name, `stat -c %Y ${TOKEN_FILE}`)) * 1000).toISOString()
    };
}

// 0. start clean: no claim for this user, pool at 0, no leftover warm sandbox
kubectl(`-n ${NS} delete sandboxclaim -l magda.io/agent-user=${USERS[user].id} --wait=true`);
kubectl(`-n ${NS} patch sandboxwarmpool ${pool} --type=merge -p '{"spec":{"replicas":0}}'`);
await waitFor(() => warmSandboxes().length === 0, 120000);

// 1. one warm replica
const scaledAt = Date.now();
kubectl(`-n ${NS} patch sandboxwarmpool ${pool} --type=merge -p '{"spec":{"replicas":1}}'`);
const warmName = await waitFor(() => {
    const [s] = warmSandboxes();
    if (!s) return undefined;
    const snap = snapshot(s.metadata.name);
    return snap.podReady && snap.startupLinePresent ? s.metadata.name : undefined;
}, 300000, 2000);
check("warm Sandbox, PVC and Ready Pod exist before any claim", !!warmName, { warmSandbox: warmName, secondsToWarm: Math.round((Date.now() - scaledAt) / 1000) });
if (!warmName) process.exit(1);
const before = snapshot(warmName);
report.warm = before;
check("warm Pod is named after the Sandbox and is its only Pod", before.pod === warmName && before.podsOwnedBySandbox.length === 1, { pod: before.pod, podsOwnedBySandbox: before.podsOwnedBySandbox });
check("startup line logged with the token redacted; no raw token in the Pod log", before.startupLineRedacted && !before.rawTokenInLog);

// let the warm Sandbox sit idle so "token written before the claim" is unambiguous
await sleep(10000);
const amLines = () => kubectl(`-n ${NS} logs deploy/agent-manager --since=1h`).split("\n");
const exchangesFor = (sandbox) => amLines().filter((l) => l.includes('"dsh-cookie-acquired"') && l.includes(`"sandbox":"${sandbox}"`)).length;
const exchangesBefore = exchangesFor(warmName);

// 2. claim
const claimName = `${user}-warm-${Date.now().toString(36)}`;
const t0 = Date.now();
const claimOut = execFileSync(path.join(HERE, "../scripts/claim.sh"), [USERS[user].id, pool, claimName], { encoding: "utf8" }).trim();
const claimSeconds = (Date.now() - t0) / 1000;
const claim = json(`-n ${NS} get sandboxclaim ${claimName}`);
const adopted = claim.status.sandbox.name;
report.claim = { name: claimName, createdAt: claim.metadata.creationTimestamp, sandbox: adopted, claimShSeconds: claimSeconds, claimSh: claimOut };
check("claim adopts the pre-existing warm Sandbox (not a Sandbox named after the claim)", adopted === warmName && adopted !== claimName, { claim: claimName, adopted, warm: warmName, claimShSeconds: claimSeconds });

const after = snapshot(adopted);
report.adopted = after;
check("same Sandbox UID, Pod and PVC after adoption", after.sandboxUid === before.sandboxUid && after.pod === before.pod && after.pvc === before.pvc && after.pvcUid === before.pvcUid && after.volumeCreatedAt === before.volumeCreatedAt, { pod: after.pod, pvc: after.pvc, volumeCreatedAt: after.volumeCreatedAt });
check("DSH not restarted: Pod UID and restartCount unchanged", after.podUid === before.podUid && after.restartCount === before.restartCount, { restartCount: after.restartCount });
check("launch-token file unchanged and written before the claim existed", after.tokenFileSha256 === before.tokenFileSha256 && after.tokenFileMtime < claim.metadata.creationTimestamp, { tokenFileMtime: after.tokenFileMtime, claimCreatedAt: claim.metadata.creationTimestamp });

// 3. Agent Manager routes the user to the adopted Sandbox and redeems the
// pre-claim token (read via pods/exec) exactly once.
await sleep(1000);
const cookie = await login(user);
const index = await request("GET", MOUNT_PATH, { headers: { cookie } });
const rpc = await request("POST", `${MOUNT_PATH}api/session/list`, { headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, body: "{}" });
const routed = amLines().some((l) => l.includes('"event":"http"') && l.includes(`"sandbox":"${adopted}"`));
check("Agent Manager routes the user to the adopted Sandbox; index and RPC work", index.status === 200 && rpc.status === 200 && routed, { index: index.status, rpc: rpc.status, routed });
const exchanges = exchangesFor(adopted) - exchangesBefore;
check("stock token exchange with the token printed before the claim: one dsh-cookie-acquired", exchanges === 1, { dshCookieAcquired: exchanges, launchTokenWrittenAt: after.tokenFileMtime });

// 4. real browser through the full chain
const e2eOut = out ? out.replace(/\.json$/, "") + "-e2e.json" : undefined;
const e2e = spawnSync("node", [path.join(HERE, "e2e-browser.mjs"), user, ...(e2eOut ? ["--out", e2eOut] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
process.stdout.write(e2e.stdout);
const e2eSummary = e2e.stdout.trim().split("\n").filter((l) => /^(PASS|FAIL)/.test(l)).map((l) => l.slice(0, 4));
check("browser E2E on the adopted Sandbox (e2e-browser.mjs)", e2e.status === 0, { passed: e2eSummary.filter((x) => x === "PASS").length, total: e2eSummary.length, report: e2eOut && path.basename(e2eOut) });
check("still exactly one token exchange for the adopted Sandbox after the browser run", exchangesFor(adopted) - exchangesBefore === 1, { dshCookieAcquired: exchangesFor(adopted) - exchangesBefore });

// 5. the pool replenishes with a new Sandbox and PVC
const replacement = await waitFor(() => {
    const [s] = warmSandboxes().filter((x) => x.metadata.name !== adopted);
    if (!s) return undefined;
    const snap = snapshot(s.metadata.name);
    return snap.podReady ? snap : undefined;
}, 300000, 2000);
report.replenished = replacement;
check("pool replenishes to 1 with a different Sandbox and PVC", !!replacement && replacement.sandbox !== adopted && replacement.pvc !== after.pvc && replacement.pvcUid !== after.pvcUid && warmSandboxes().length === 1, { replacement: replacement?.sandbox, pvc: replacement?.pvc });
check("adopted Sandbox is no longer owned by the pool", !warmSandboxes().some((s) => s.metadata.name === adopted));

if (!keepPool) kubectl(`-n ${NS} patch sandboxwarmpool ${pool} --type=merge -p '{"spec":{"replicas":0}}'`);
report.poolRestoredToZero = !keepPool;
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok).length;
console.log(`${report.checks.length - failed}/${report.checks.length} checks passed`);
process.exit(failed ? 1 : 0);
