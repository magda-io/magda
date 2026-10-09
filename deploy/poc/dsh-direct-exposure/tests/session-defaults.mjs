// #3841 review task D: a new DSH session starts with permission preset
// `workspace-write`, sandbox mode `workspace-write` and approval policy `ask`.
// Guards against a silent upstream default change (the image also sets
// DSH_PERMISSION_MODE=workspace-write).
//
// Through the full chain (Magda login -> gateway -> Agent Manager -> DSH):
//   permissionPresets/catalog  -> defaultPreset
//   workspace/initializeDefault -> the default Workspace (as the UI does on load)
//   session/create             -> a new session in that Workspace
//   session/projections        -> permissions.currentValue
//   session/prompt             -> persist the session (blank sessions are not written)
// Then from the session journal on the PVC (seq 0..2 of the new session):
//   permission/preset, sandbox/mode, approval/policy.
//
// Usage: node session-defaults.mjs [--user alice] [--out file]
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
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
const EXPECTED = { preset: "workspace-write", sandbox: "workspace-write", approval: "ask" };
const kubectl = (...args) => execFileSync("kubectl", args, { encoding: "utf8" }).trim();
const report = { user, expected: EXPECTED, checks: [] };
function check(name, ok, detail = {}) {
    report.checks.push({ name, ok: !!ok, ...detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail)}`);
}

const cookie = await login(user);
// DSH unary RPC envelope (POST api/<service>/<method>), as the DSH web client sends it.
async function rpc(method, args) {
    const r = await request("POST", `${MOUNT_PATH}api/${method}`, {
        headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method, payload: { args } })
    });
    const body = JSON.parse(r.body);
    if (r.status !== 200 || !body.result?.ok) throw new Error(`${method}: HTTP ${r.status} ${r.body.slice(0, 300)}`);
    return body.result.value;
}

const catalog = await rpc("permissionPresets/catalog", {});
report.catalog = catalog;
check("default preset for new sessions is workspace-write", catalog.defaultPreset === EXPECTED.preset, { defaultPreset: catalog.defaultPreset, options: catalog.options.map((o) => o.value) });

// Create the session in the default Workspace, as the UI does. A session
// created without a workspace lands in the process cwd ("Ungrouped"), and DSH
// then treats first use as over: initializeDefault becomes ineligible and the
// UI has no workspace to start a draft in.
const init = await rpc("workspace/initializeDefault", {});
const workspaceId = init?.workspace?.workspaceId;
check("default Workspace initialized or reused", !!workspaceId, { path: init?.workspace?.path });
if (!workspaceId) process.exit(1);
const { sessionId } = await rpc("session/create", { request: { workspaceId } });
const projections = await rpc("session/projections", { request: { sessionId } });
check("new session's permissions projection is workspace-write", projections.values.permissions?.currentValue === EXPECTED.preset, { sessionId, permissions: projections.values.permissions });

const accepted = await rpc("session/prompt", {
    request: { requestId: crypto.randomUUID(), sessionId, mode: "queue", content: [{ type: "text", text: "STREAM 1 session-defaults" }] }
});
check("prompt accepted (persists the session)", accepted.accepted === true);

// Session journal: zstd frames of JSONL events, one or more frames per append.
const claim = JSON.parse(kubectl("-n", NS, "get", "sandboxclaim", "-l", `magda.io/agent-user=${USERS[user].id}`, "-o", "json")).items[0];
const sandbox = claim.status.sandbox.name;
report.sandbox = sandbox;
const reader = `
const fs=require("fs"),path=require("path"),z=require("zlib");
const root=path.join(process.env.DSH_HOME,"sessions");
const dir=fs.readdirSync(root).map(w=>path.join(root,w,process.argv[1])).find(d=>fs.existsSync(d));
if(!dir){console.log("[]");process.exit(0)}
const buf=fs.readFileSync(path.join(dir,"session.v4.jsonl.zstd"));
const magic=Buffer.from([0x28,0xb5,0x2f,0xfd]);const at=[];let i=-1;while((i=buf.indexOf(magic,i+1))>=0)at.push(i);at.push(buf.length);
let text="";for(let k=0;k+1<at.length;k++){try{text+=z.zstdDecompressSync(buf.subarray(at[k],at[k+1]))}catch{}}
console.log(JSON.stringify(text.split("\\n").filter(Boolean).map(l=>JSON.parse(l)).filter(e=>["permission/preset","sandbox/mode","approval/policy"].includes(e.type)).map(e=>({type:e.type,seq:e.seq,data:e.data}))));`;
let events = [];
for (let i = 0; i < 30 && events.length < 3; i++) {
    await sleep(1000);
    events = JSON.parse(kubectl("-n", NS, "exec", sandbox, "-c", "agent", "--", "node", "-e", reader, sessionId));
}
report.journal = events;
const first = (type) => events.find((e) => e.type === type)?.data;
check("journal: permission/preset = workspace-write", first("permission/preset")?.preset === EXPECTED.preset, first("permission/preset"));
check("journal: sandbox/mode = workspace-write", first("sandbox/mode")?.mode === EXPECTED.sandbox, first("sandbox/mode"));
check("journal: approval/policy = ask", first("approval/policy")?.policy === EXPECTED.approval, first("approval/policy"));
check("no later permission/sandbox/approval change in the session", events.length === 3, { events: events.length });

if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok).length;
console.log(`${report.checks.length - failed}/${report.checks.length} checks passed`);
process.exit(failed ? 1 : 0);
