#!/usr/bin/env node
/**
 * Run the real-facade matrix with the actual observer inside the existing pod.
 * Only source code goes over stdin. Secrets stay inside the pod. Only metadata
 * comes back; no temporary bundle, provider payload file or deployment change.
 * Run from anywhere: node magda-llm-services/poc/cluster-observed.cjs [namespace]
 * This makes real, billable provider requests. Requires operator access.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const ts = require("typescript");

const namespace = process.argv[2] || "magda-demo";
const cases = process.argv[3] || "";
if (cases && !/^[a-z0-9,-]+$/.test(cases)) {
    throw new Error("Case filter must be comma-separated case labels");
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(namespace)) {
    throw new Error("Invalid namespace");
}
const context = execFileSync("kubectl", ["config", "current-context"], {
    encoding: "utf8"
}).trim();
if (context !== "minikube") {
    throw new Error(
        "Refusing real provider tests outside the minikube context"
    );
}
const pod = execFileSync(
    "kubectl",
    [
        "--context",
        "minikube",
        "get",
        "pods",
        "-n",
        namespace,
        "-l",
        "service=llm-services",
        "--field-selector=status.phase=Running",
        "-o",
        "jsonpath={.items[0].metadata.name}"
    ],
    { encoding: "utf8" }
).trim();
if (!/^[a-z0-9][a-z0-9-]*$/.test(pod)) {
    throw new Error("No running llm-services pod found");
}
const observerSource = fs.readFileSync(
    path.join(__dirname, "usage-observer.ts"),
    "utf8"
);
const observer = ts.transpileModule(observerSource, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS
    }
}).outputText;
const caller = fs
    .readFileSync(path.join(__dirname, "cluster-facade.cjs"), "utf8")
    .replace(/^#![^\n]*\n/, "");
const source = `{
const module = {exports:{}};
const exports = module.exports;
${observer}
globalThis.__pocCreateUsageObserver = module.exports.createUsageObserver;
}\n${caller}`;
const child = spawn(
    "kubectl",
    [
        "--context",
        "minikube",
        "exec",
        "-i",
        "-n",
        namespace,
        pod,
        "--",
        "env",
        `POC_CASES=${cases}`,
        "node"
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
);
child.stdin.on("error", () => undefined);
child.stdin.end(source);
child.once("error", () => {
    console.error("Could not launch the metadata-only cluster experiment");
    process.exitCode = 1;
});
child.once("exit", (code) => {
    process.exitCode = code ?? 1;
});
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
