// #3841 review task B: X-Magda-Session terminates at Agent Manager. Checks the
// header filter the PoC proxy applies to every request it forwards to DSH
// (HTTP and the WebSocket handshake use the same upstreamHeaders()).
// Usage: node am-upstream-headers.mjs [--out file]   (no cluster needed)
import assert from "node:assert/strict";
import fs from "node:fs";

for (const mode of ["managed-cookie", "none", "passthrough"]) {
    process.env.JWT_SECRET = "unit-test-secret";
    process.env.EXTERNAL_AUTHORITY = "magda.test:18443";
    process.env.AUTH_MODE = mode;
    // a fresh module instance per AUTH_MODE (cfg is read at import time)
    const am = await import(`../agent-manager/server.mjs?mode=${mode}`);
    const req = {
        headers: {
            host: "agent-manager.magda-agent-poc.svc.cluster.local",
            "x-magda-session": "eyJhbGciOiJIUzI1NiJ9.e30.sig",
            "x-magda-tenant-id": "0",
            "x-magda-api-key": "key",
            "x-magda-api-key-id": "key-id",
            authorization: "Bearer magda",
            "proxy-authorization": "Basic x",
            cookie: "connect.sid=s%3Amagda-session",
            origin: "https://magda.test:18443",
            "sec-fetch-site": "same-origin",
            upgrade: "websocket",
            connection: "Upgrade",
            "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
            "sec-websocket-version": "13"
        }
    };
    const dshCookie = "dsh-auth-abc=managed";
    const out = am.upstreamHeaders(req, dshCookie);
    for (const name of ["x-magda-session", "x-magda-tenant-id", "x-magda-api-key", "x-magda-api-key-id", "authorization", "proxy-authorization"]) {
        assert.equal(out[name], undefined, `${mode}: ${name} must not reach DSH`);
    }
    assert.ok(!JSON.stringify(out).includes("eyJhbGciOiJIUzI1NiJ9"), `${mode}: no Magda JWT anywhere upstream`);
    // passthrough is the D11 diagnostic mode: it forwards the browser's Cookie
    // header on purpose (magda-gateway strips it before Agent Manager anyway).
    if (mode !== "passthrough") {
        assert.ok(!JSON.stringify(out).includes("connect.sid"), `${mode}: no browser cookie upstream`);
    }
    assert.equal(out.host, "magda.test:18443", `${mode}: Host pinned to the external authority`);
    assert.equal(out.origin, "https://magda.test:18443", `${mode}: Origin kept for DSH's fence`);
    assert.equal(out["sec-fetch-site"], "same-origin");
    assert.equal(out.upgrade, "websocket");
    // Only the DSH cookie Agent Manager holds itself (managed-cookie) reaches DSH.
    if (mode === "managed-cookie") assert.equal(out.cookie, dshCookie);
    if (mode === "none") assert.equal(out.cookie, undefined);
    console.log(`PASS ${mode}: upstream headers ${JSON.stringify(Object.keys(out).sort())}`);
}
const outIdx = process.argv.indexOf("--out");
if (outIdx > 0) {
    fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify({ test: "am-upstream-headers", result: "pass", modes: ["managed-cookie", "none", "passthrough"] }, null, 2));
}
