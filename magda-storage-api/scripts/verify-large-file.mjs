#!/usr/bin/env node
/**
 * End-to-end verification driver for large-file storage support.
 *
 * Exercises the multipart upload flow, Range download (resume), and abort
 * against a running Magda (through the gateway or directly against storage-api).
 *
 * Auth (choose one; API key is the real external path through the gateway):
 *   API_KEY_ID + API_KEY   A Magda API key id & key (sent as X-Magda-API-Key-Id /
 *                          X-Magda-API-Key headers). Preferred for e2e via gateway.
 *   JWT                    An internal session JWT (X-Magda-Session). This is an
 *                          internal auth method — use only to bootstrap.
 *
 * Env vars:
 *   BASE_URL   Base storage API URL, e.g. http://localhost:18080/api/v0/storage
 *              (through gateway) or http://localhost:6121/v0 (direct).
 *   BUCKET     Target bucket (default: magda-datasets).
 *   SIZE_MB    Test file size in MB (default: 500).
 *   KEY        Optional object key to use (default: verify/large-file/test-<size>mb-<n>.bin).
 *              Use a fresh key per run — a key with a leftover incomplete upload can 400 on complete.
 *
 * Usage:
 *   BASE_URL=http://localhost:18080/api/v0/storage \
 *     API_KEY_ID=... API_KEY=... node scripts/verify-large-file.mjs
 */
import crypto from "crypto";

const BASE_URL = process.env.BASE_URL;
const API_KEY_ID = process.env.API_KEY_ID;
const API_KEY = process.env.API_KEY;
const JWT = process.env.JWT;
const BUCKET = process.env.BUCKET || "magda-datasets";
const SIZE_MB = parseInt(process.env.SIZE_MB || "500", 10);

const authHeaders =
    API_KEY_ID && API_KEY
        ? { "X-Magda-API-Key-Id": API_KEY_ID, "X-Magda-API-Key": API_KEY }
        : JWT
        ? { "X-Magda-Session": JWT }
        : null;

if (!BASE_URL || !authHeaders) {
    console.error(
        "BASE_URL and (API_KEY_ID + API_KEY, or JWT) env vars are required."
    );
    process.exit(1);
}

const key = process.env.KEY || `verify/large-file/test-${SIZE_MB}mb.bin`;

function assert(cond, msg) {
    if (!cond) {
        console.error("FAIL:", msg);
        process.exit(1);
    }
    console.log("ok:", msg);
}

async function main() {
    // 1. initiate
    let res = await fetch(`${BASE_URL}/multipart/initiate/${BUCKET}/${key}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/octet-stream" }
    });
    assert(res.ok, `initiate returned ${res.status}`);
    const { uploadId, recommendedPartSizeBytes } = await res.json();
    const partSize = recommendedPartSizeBytes || 16 * 1024 * 1024;

    // 2. upload parts (generate deterministic content, track a hash)
    const totalBytes = SIZE_MB * 1024 * 1024;
    const hash = crypto.createHash("sha256");
    const parts = [];
    let uploaded = 0;
    let partNumber = 1;
    while (uploaded < totalBytes) {
        const thisSize = Math.min(partSize, totalBytes - uploaded);
        const chunk = crypto.randomBytes(thisSize);
        hash.update(chunk);
        res = await fetch(
            `${BASE_URL}/multipart/part/${BUCKET}/${key}?uploadId=${encodeURIComponent(
                uploadId
            )}&partNumber=${partNumber}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/octet-stream" },
                body: chunk
            }
        );
        assert(res.ok, `upload part ${partNumber} returned ${res.status}`);
        const { etag } = await res.json();
        parts.push({ partNumber, etag });
        uploaded += thisSize;
        partNumber++;
    }
    const expectedHash = hash.digest("hex");
    console.log(`uploaded ${parts.length} parts, ${uploaded} bytes`);

    // 3. complete
    res = await fetch(
        `${BASE_URL}/multipart/complete/${BUCKET}/${key}?uploadId=${encodeURIComponent(
            uploadId
        )}`,
        {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ parts })
        }
    );
    assert(
        res.ok,
        `complete returned ${res.status} ${res.ok ? "" : await res.text()}`
    );

    // 4. full download + hash match
    res = await fetch(`${BASE_URL}/${BUCKET}/${key}`, { headers: authHeaders });
    assert(res.ok, `full download returned ${res.status}`);
    assert(
        res.headers.get("accept-ranges") === "bytes",
        "download advertises Accept-Ranges: bytes"
    );
    const dlBuf = Buffer.from(await res.arrayBuffer());
    assert(
        dlBuf.length === totalBytes,
        `downloaded size ${dlBuf.length} === ${totalBytes}`
    );
    const dlHash = crypto.createHash("sha256").update(dlBuf).digest("hex");
    assert(dlHash === expectedHash, "downloaded content hash matches upload");

    // 5. range download (resume simulation) — fetch two halves and reassemble
    const mid = Math.floor(totalBytes / 2);
    const r1 = await fetch(`${BASE_URL}/${BUCKET}/${key}`, {
        headers: { ...authHeaders, Range: `bytes=0-${mid - 1}` }
    });
    assert(
        r1.status === 206,
        `first range returned ${r1.status} (expected 206)`
    );
    // drain each range body before issuing the next request so the HTTP
    // connection isn't left with an unconsumed body (which resets the pool)
    const b1 = Buffer.from(await r1.arrayBuffer());
    const r2 = await fetch(`${BASE_URL}/${BUCKET}/${key}`, {
        headers: { ...authHeaders, Range: `bytes=${mid}-` }
    });
    assert(
        r2.status === 206,
        `second range returned ${r2.status} (expected 206)`
    );
    const b2 = Buffer.from(await r2.arrayBuffer());
    const reassembled = Buffer.concat([b1, b2]);
    const reHash = crypto
        .createHash("sha256")
        .update(reassembled)
        .digest("hex");
    assert(reHash === expectedHash, "reassembled ranged download hash matches");

    // 6. abort flow
    res = await fetch(
        `${BASE_URL}/multipart/initiate/${BUCKET}/verify/large-file/abort-me.bin`,
        {
            method: "POST",
            headers: {
                ...authHeaders,
                "Content-Type": "application/octet-stream"
            }
        }
    );
    assert(res.ok, `initiate (abort test) returned ${res.status}`);
    const abortSession = await res.json();
    res = await fetch(
        `${BASE_URL}/multipart/part/${BUCKET}/verify/large-file/abort-me.bin?uploadId=${encodeURIComponent(
            abortSession.uploadId
        )}&partNumber=1`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: crypto.randomBytes(5 * 1024 * 1024)
        }
    );
    assert(res.ok, `abort-test part upload returned ${res.status}`);
    res = await fetch(
        `${BASE_URL}/multipart/abort/${BUCKET}/verify/large-file/abort-me.bin?uploadId=${encodeURIComponent(
            abortSession.uploadId
        )}`,
        { method: "DELETE" }
    );
    assert(res.ok, `abort returned ${res.status}`);

    // 7. cleanup the completed object
    await fetch(`${BASE_URL}/${BUCKET}/${key}`, {
        method: "DELETE",
        headers: authHeaders
    });

    console.log("\nALL CHECKS PASSED");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
