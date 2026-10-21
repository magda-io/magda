// #3841 Experiment 5A: stock DSH launch-token / cookie behaviour at the
// Sandbox Service, executed from the Agent Manager Pod (the only allowed peer).
// Reproduces the Discussion #8528 authority question with the exact DSH build.
// Usage: node stock-auth-token.mjs [--out file]
import { execSync } from "node:child_process";
import fs from "node:fs";
import { AUTHORITY, USERS } from "./lib/magda.mjs";

const NS = "magda-agent-poc";
const kubectl = (args) => execSync(`kubectl ${args}`, { encoding: "utf8" }).trim();
const claim = JSON.parse(kubectl(`-n ${NS} get sandboxclaim -l magda.io/agent-user=${USERS.alice.id} -o json`)).items[0];
const sandbox = claim.status.sandbox.name;
const svc = `${sandbox}.${NS}.svc.cluster.local`;
// The launch token is redacted from the Pod log; read the hand-off file
// (image/dsh-launch.mjs) the way Agent Manager does, via exec.
const token = kubectl(`-n ${NS} exec ${sandbox} -c agent -- cat /run/magda-agent/dsh-launch-token`);

// Each case: exchange the token with (exchangeHost, path), then use the
// resulting cookie with useHost on GET / and POST /api/session/list.
const script = `
const http=require("http");
const req=(host,path,method,cookie)=>new Promise(r=>{const h={host};if(cookie)h.cookie=cookie;if(method==="POST")h["content-type"]="application/json";
 const q=http.request({host:"${svc}",port:3080,path,method,headers:h},s=>{s.resume();r({status:s.statusCode,setCookie:(s.headers["set-cookie"]||[])[0]})});q.on("error",e=>r({status:e.code}));q.end(method==="POST"?"{}":undefined)});
const cases=[
 ["declared authority, prefix stripped", "${AUTHORITY}", "/?token=${token}", "${AUTHORITY}"],
 ["prefix NOT stripped by the proxy", "${AUTHORITY}", "/api/v0/agent/runtime/?token=${token}", "${AUTHORITY}"],
 ["exchange at Pod/LAN authority, use at external authority", "${svc}:3080", "/?token=${token}", "${AUTHORITY}"],
 ["exchange at undeclared authority, use there", "evil.test", "/?token=${token}", "evil.test"],
 ["Host rewritten to the upstream (changeOrigin) on every hop", "${svc}", "/?token=${token}", "${svc}"],
];
(async()=>{const out=[];for(const [name,xh,path,uh] of cases){const x=await req(xh,path,"GET");
 const cookie=x.setCookie?x.setCookie.split(";")[0]:undefined;
 const idx=await req(uh,"/","GET",cookie); const api=await req(uh,"/api/session/list","POST",cookie);
 out.push({case:name,exchange:x.status,cookieAttrs:x.setCookie?x.setCookie.split(";").slice(1).map(s=>s.trim()).filter(a=>!/^(Expires|Max-Age)/.test(a)):undefined,index:idx.status,api:api.status});}
 console.log(JSON.stringify(out))})()`;
const results = JSON.parse(kubectl(`-n ${NS} exec deploy/agent-manager -- node -e '${script.replace(/'/g, "'\\''")}'`));
for (const r of results) console.log(JSON.stringify(r));
const outIdx = process.argv.indexOf("--out");
if (outIdx > 0) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify({ sandbox, dsh: "0.2.1-alpha.1", results }, null, 2));
