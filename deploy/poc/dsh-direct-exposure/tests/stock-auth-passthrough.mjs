// #3841 Experiment 5A: can the *browser* hold the stock DSH cookie behind
// magda-gateway? Requires Agent Manager AUTH_MODE=passthrough (it forwards the
// browser's ?token= exchange and rewrites Set-Cookie Path/Secure).
import { execSync } from "node:child_process";
import { login, request, MOUNT_PATH, USERS } from "./lib/magda.mjs";
const NS = "magda-agent-poc";
const kubectl = (a) => execSync(`kubectl ${a}`, { encoding: "utf8" }).trim();
const claim = JSON.parse(kubectl(`-n ${NS} get sandboxclaim -l magda.io/agent-user=${USERS.alice.id} -o json`)).items[0];
const sandbox = claim.status.sandbox.name;
const token = /token=([A-Za-z0-9_-]+)/.exec(kubectl(`-n ${NS} logs ${sandbox}`).split("\n").filter((l) => l.startsWith("dsh web:")).pop())[1];
const magda = await login("alice");
const x = await request("GET", `${MOUNT_PATH}?token=${token}`, { headers: { cookie: magda } });
const dshCookie = (x.headers["set-cookie"] || []).find((c) => c.startsWith("dsh-auth-"));
console.log(JSON.stringify({ step: "browser redeems token via the Magda route", status: x.status, location: x.headers.location, setCookie: dshCookie?.replace(/=v1\.[^;]+/, "=<value>") }));
const both = `${magda}; ${dshCookie.split(";")[0]}`;
const idx = await request("GET", MOUNT_PATH, { headers: { cookie: both } });
console.log(JSON.stringify({ step: "browser sends Magda + DSH cookies", status: idx.status, body: idx.body.slice(0, 70) }));
const am = kubectl(`-n ${NS} logs deploy/agent-manager --since=30s`).split("\n").filter((l) => l.includes('"http"')).slice(-2);
console.log(am.join("\n"));
