#!/usr/bin/env node
/**
 * End-to-end verification of the mgd CLI against a real MAGDA deployment.
 * Usage:
 *   MGD_E2E_BASE_URL=https://... MGD_E2E_API_KEY_ID=... MGD_E2E_API_KEY=... \
 *     node scripts/verify-mgd.mjs
 * Creates a throwaway dataset, exercises upload/download/replace/update,
 * then deletes what it created via raw API calls.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const required = ["MGD_E2E_BASE_URL", "MGD_E2E_API_KEY_ID", "MGD_E2E_API_KEY"];
for (const k of required) {
    if (!process.env[k]) {
        console.error(`Missing env var ${k}`);
        process.exit(2);
    }
}

const env = {
    ...process.env,
    MGD_BASE_URL: process.env.MGD_E2E_BASE_URL,
    MGD_API_KEY_ID: process.env.MGD_E2E_API_KEY_ID,
    MGD_API_KEY: process.env.MGD_E2E_API_KEY
};
const BIN = path.resolve(import.meta.dirname, "../bin/mgd.js");

function mgd(...args) {
    return execFileSync("node", [BIN, ...args], {
        env,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 64
    });
}

const failures = [];
function check(name, fn) {
    try {
        fn();
        console.log(`ok   - ${name}`);
    } catch (e) {
        failures.push(name);
        console.error(`FAIL - ${name}: ${e.message}`);
    }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mgd-e2e-"));
let datasetId = "";
let distId = "";

check("auth status", () => {
    const s = JSON.parse(mgd("auth", "status", "--json"));
    if (!s.authenticated) throw new Error("not authenticated");
});

check("search datasets", () => {
    mgd("search", "datasets", "data", "--limit", "1", "--jsonl");
});

check("dataset create", () => {
    datasetId = mgd(
        "dataset",
        "create",
        "--title",
        `mgd e2e ${new Date().toISOString()}`,
        "--desc",
        "temporary e2e verification dataset"
    ).trim();
    if (!/^magda-ds-/.test(datasetId)) throw new Error(`bad id: ${datasetId}`);
});

check("add-file small", () => {
    const f = path.join(tmp, "small.csv");
    fs.writeFileSync(f, "a,b\n1,2\n");
    distId = mgd("dataset", "add-file", datasetId, f).trim();
    if (!/^magda-dist-/.test(distId)) throw new Error(`bad id: ${distId}`);
});

check("add-file large (multipart)", () => {
    const f = path.join(tmp, "large.bin");
    fs.writeFileSync(f, crypto.randomBytes(20 * 1024 * 1024)); // 20MB > 16MB
    const out = JSON.parse(mgd("dataset", "add-file", datasetId, f, "--json"));
    const dl = path.join(tmp, "large-out.bin");
    mgd("dist", "download", out.distributionId, "-o", dl);
    const a = crypto
        .createHash("sha256")
        .update(fs.readFileSync(f))
        .digest("hex");
    const b = crypto
        .createHash("sha256")
        .update(fs.readFileSync(dl))
        .digest("hex");
    if (a !== b) throw new Error("checksum mismatch after round-trip");
});

check("replace-file bumps version", () => {
    const f = path.join(tmp, "replacement.csv");
    fs.writeFileSync(f, "x,y\n3,4\n");
    const out = JSON.parse(mgd("dist", "replace-file", distId, f, "--json"));
    if (out.versionNumber < 1) throw new Error("version not bumped");
});

check("dataset update + custom aspect", () => {
    mgd("dataset", "update", datasetId, "--desc", "updated by e2e");
    mgd(
        "aspect",
        "create",
        "mgd-e2e-aspect",
        "--name",
        "mgd e2e",
        "--schema",
        '{"type":"object"}'
    );
    mgd("dataset", "aspect", "set", datasetId, "mgd-e2e-aspect", '{"ok":true}');
});

check("cleanup", () => {
    const record = JSON.parse(mgd("dataset", "get", datasetId, "--json"));
    const dists =
        record.aspects?.["dataset-distributions"]?.distributions ?? [];
    for (const d of dists) {
        const id = typeof d === "string" ? d : d.id;
        mgd("api", "request", "DELETE", `/v0/registry/records/${id}`);
    }
    mgd("api", "request", "DELETE", `/v0/registry/records/${datasetId}`);
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
    console.error(`\n${failures.length} FAILURES: ${failures.join(", ")}`);
    process.exit(1);
}
console.log("\nALL CHECKS PASSED");
