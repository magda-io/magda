// #3841 review task C: the stock-DSH launch token reaches Agent Manager via a
// file + pods/exec instead of the Pod log.
//
//   - the Pod log has the startup line with the token redacted, never a token;
//   - Agent Manager's ServiceAccount cannot read pods/log, can create pods/exec;
//   - the token file is 0600, owned by the agent user, on a memory-backed mount;
//   - a forced re-exchange after a DSH restart works: delete DSH's cookie-signing
//     secret (so the cookie Agent Manager holds becomes invalid), restart DSH,
//     check the file was rewritten, and that the next request through the full
//     chain succeeds after one 401 -> re-read token via exec -> re-exchange.
//
// Usage: node token-handoff.mjs [--user alice] [--out file]
// Needs Agent Manager AUTH_MODE=managed-cookie and a *-stock claim for the user.
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import { login, request, MOUNT_PATH, ORIGIN, USERS } from "./lib/magda.mjs";
import { sleep } from "./lib/browser.mjs";

const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : dflt;
};
const user = arg("--user", "alice");
const out = arg("--out");
const NS = "magda-agent-poc";
const SA = `system:serviceaccount:${NS}:agent-manager`;
const TOKEN_FILE = "/run/magda-agent/dsh-launch-token";
const kubectl = (args) => execSync(`kubectl ${args}`, { encoding: "utf8" }).trim();
const canI = (verb, subresource) => {
    try {
        return execSync(`kubectl auth can-i ${verb} pods --subresource=${subresource} -n ${NS} --as=${SA}`, { encoding: "utf8" }).trim();
    } catch (e) {
        return String(e.stdout).trim();
    }
};
const report = { user, checks: [] };
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

const claim = JSON.parse(kubectl(`-n ${NS} get sandboxclaim -l magda.io/agent-user=${USERS[user].id} -o json`)).items[0];
const sandbox = claim.status.sandbox.name;
report.sandbox = sandbox;
report.template = claim.spec.warmPoolRef.name;
const exec = (script) =>
    execFileSync("kubectl", ["-n", NS, "exec", sandbox, "-c", "agent", "--", "sh", "-c", script], { encoding: "utf8" }).trim();
const tokenHash = () => exec(`sha256sum ${TOKEN_FILE} | cut -c1-12`);
const restartCount = () => Number(kubectl(`-n ${NS} get pod ${sandbox} -o jsonpath='{.status.containerStatuses[0].restartCount}'`));
const amLines = () => kubectl(`-n ${NS} logs deploy/agent-manager --since=1h`).split("\n");
const exchanges = (refresh) =>
    amLines().filter((l) => l.includes('"dsh-cookie-acquired"') && l.includes(`"sandbox":"${sandbox}"`) && l.includes(`"refresh":${refresh}`)).length;
function podLog(previous = false) {
    const logs = kubectl(`-n ${NS} logs ${sandbox} -c agent${previous ? " --previous" : ""}`);
    return {
        startupLines: logs.split("\n").filter((l) => l.startsWith("dsh web: ")).length,
        redacted: /token=<redacted>/.test(logs),
        rawToken: /token=(?!<redacted>)[A-Za-z0-9_-]{8,}/.test(logs)
    };
}
async function throughChain(cookie) {
    const index = await request("GET", MOUNT_PATH, { headers: { cookie } });
    const rpc = await request("POST", `${MOUNT_PATH}api/session/list`, { headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, body: "{}" });
    return { index: index.status, rpc: rpc.status };
}

// --- no token in the log; RBAC ---------------------------------------------
let log = podLog();
check("Pod log: startup line present, token redacted, no raw token", log.startupLines > 0 && log.redacted && !log.rawToken, log);
const rbac = { getPodsLog: canI("get", "log"), getPodsExec: canI("get", "exec"), createPodsExec: canI("create", "exec") };
check("Agent Manager cannot read pods/log; can exec (get + create pods/exec)", rbac.getPodsLog === "no" && rbac.getPodsExec === "yes" && rbac.createPodsExec === "yes", rbac);

// --- the file ------------------------------------------------------------------
const stat = exec(`stat -c '%a %U %s' ${TOKEN_FILE}`);
// gVisor shows the emptyDir as a gofer mount (9p) inside the sandbox, so check
// the backing mount on the node as well.
const mount = exec("grep ' /run/magda-agent ' /proc/mounts | cut -d' ' -f3");
const podUid = kubectl(`-n ${NS} get pod ${sandbox} -o jsonpath='{.metadata.uid}'`);
const nodeMount = execSync(
    `minikube -p ${process.env.PROFILE || "magda-agent-poc"} ssh -- findmnt -no FSTYPE /var/lib/kubelet/pods/${podUid}/volumes/kubernetes.io~empty-dir/run`,
    { encoding: "utf8" }
).trim();
const onPvc = exec("find /data -name 'dsh-launch-token*' | wc -l");
report.file = { stat, mountFsTypeInContainer: mount, emptyDirFsTypeOnNode: nodeMount, copiesOnPvc: Number(onPvc) };
check("token file: mode 0600, owner agent, non-empty", /^600 agent [1-9]/.test(stat), { stat });
check("token file is on a memory-backed emptyDir (tmpfs on the node), not the PVC", nodeMount === "tmpfs" && onPvc === "0", { inContainer: mount, onNode: nodeMount });

// --- normal path ------------------------------------------------------------------
const cookie = await login(user);
let r = await throughChain(cookie);
check("full chain works with the exec-read token", r.index === 200 && r.rpc === 200, r);

// --- forced re-exchange after a DSH restart -------------------------------------
const hashBefore = tokenHash();
const restartsBefore = restartCount();
const refreshBefore = exchanges(true);
const cookieErrors = () => amLines().filter((l) => l.includes('"dsh-cookie-error"') && l.includes(`"sandbox":"${sandbox}"`)).length;
const cookieErrorsBefore = cookieErrors();
exec('rm -f "$DSH_HOME/.credentials.yaml"');
kubectl(`-n ${NS} exec ${sandbox} -c agent -- kill -TERM 1`);
const restarted = await waitFor(() => restartCount() > restartsBefore && kubectl(`-n ${NS} get pod ${sandbox} -o jsonpath='{.status.containerStatuses[0].ready}'`) === "true", 120000);
const hashAfter = await waitFor(() => {
    const h = tokenHash();
    return h && h !== hashBefore ? h : undefined;
}, 60000);
check("DSH restart: container restarted and the token file was rewritten with a new token", !!restarted && !!hashAfter, { restartCount: restartCount(), tokenChanged: !!hashAfter });
log = podLog();
const previous = podLog(true);
check("Pod log after restart (current and previous container): no raw token", !log.rawToken && !previous.rawToken && log.redacted, { current: log, previous });
const credentialsRecreated = exec('test -f "$DSH_HOME/.credentials.yaml" && echo yes || echo no');
r = await throughChain(cookie);
await sleep(1000);
const refreshed = exchanges(true) - refreshBefore;
const rejected = cookieErrors() - cookieErrorsBefore;
check("after the restart with a new signing secret: one 401 -> exec re-read -> re-exchange, chain works", r.index === 200 && r.rpc === 200 && refreshed === 1, { ...r, refreshExchanges: refreshed, credentialsRecreated, cookieErrors: rejected });

if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok).length;
console.log(`${report.checks.length - failed}/${report.checks.length} checks passed`);
process.exit(failed ? 1 : 0);
