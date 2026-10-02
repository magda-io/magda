// Proxy data-path load generator (runs in a runc Pod inside the cluster).
//
//   node proxy-load.mjs <relayHost:port> <dshToken>
//
// 1. Exchanges the DSH token for the session cookie (as a browser would).
// 2. Finds the largest static asset referenced by the index page.
// 3. For concurrency 1/10/50: hammers authenticated GET / and the asset for
//    15 s each, reporting req/s, MB/s and latency percentiles.
// 4. Holds 500 idle keep-alive connections for 20 s (per-connection relay cost).
// Prints one JSON object. Phase markers go to stderr with timestamps so the
// caller can align them with cgroup samples.
import http from "node:http";

const [target, token] = process.argv.slice(2);
const [host, port] = target.split(":");
const agent = new http.Agent({ keepAlive: true, maxSockets: 1000 });
const mark = (m) => console.error(`${Date.now() / 1000} ${m}`);

function get(path, headers = {}, ag = agent, keepBody = false) {
    return new Promise((resolve, reject) => {
        const t0 = process.hrtime.bigint();
        const req = http.get({ host, port, path, headers, agent: ag }, (res) => {
            let bytes = 0;
            const chunks = [];
            res.on("data", (c) => {
                bytes += c.length;
                if (keepBody) chunks.push(c);
            });
            res.on("end", () =>
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    bytes,
                    body: Buffer.concat(chunks).toString(),
                    ms: Number(process.hrtime.bigint() - t0) / 1e6
                })
            );
        });
        req.on("error", reject);
        req.setTimeout(30000, () => req.destroy(new Error("timeout")));
    });
}

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((a.length * p) / 100))];

async function load(path, cookie, conc, seconds) {
    const end = Date.now() + seconds * 1000;
    const lat = [];
    let bytes = 0;
    let errors = 0;
    await Promise.all(
        Array.from({ length: conc }, async () => {
            while (Date.now() < end) {
                try {
                    const r = await get(path, { cookie });
                    if (r.status !== 200) errors++;
                    lat.push(r.ms);
                    bytes += r.bytes;
                } catch {
                    errors++;
                }
            }
        })
    );
    lat.sort((a, b) => a - b);
    return {
        conc,
        reqs: lat.length,
        rps: Math.round(lat.length / seconds),
        mb_s: +(bytes / 1e6 / seconds).toFixed(1),
        p50_ms: +pct(lat, 50).toFixed(1),
        p95_ms: +pct(lat, 95).toFixed(1),
        p99_ms: +pct(lat, 99).toFixed(1),
        errors
    };
}

const auth = await get(`/?token=${token}`);
const cookie = (auth.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
const index = await get("/", { cookie }, agent, true);
// DSH references assets relatively ("./assets/x.js", "plugins/??a.js,b.js&amp;rev=").
const assets = [...index.body.matchAll(/(?:src|href)="([^"]+?\.(?:js|css)(?:&amp;[^"]*)?)"/g)].map(
    (m) => "/" + m[1].replace(/^\.?\//, "").replace(/&amp;/g, "&")
);
let asset = assets[0];
let assetBytes = 0;
for (const a of assets.slice(0, 20)) {
    const r = await get(a, { cookie });
    if (r.status === 200 && r.bytes > assetBytes) {
        asset = a;
        assetBytes = r.bytes;
    }
}
const out = { auth_status: auth.status, index_status: index.status, asset, assetBytes, http: [] };
for (const [path, label] of [
    ["/", "index"],
    [asset, "asset"]
]) {
    for (const conc of [1, 10, 50]) {
        mark(`start ${label} c${conc}`);
        out.http.push({ path: label, ...(await load(path, cookie, conc, 15)) });
        mark(`end ${label} c${conc}`);
    }
}

// Idle keep-alive connections held open through the relay.
mark("start idle500");
const idleAgent = new http.Agent({ keepAlive: true, maxSockets: 500, keepAliveMsecs: 1000 });
const idle = await Promise.allSettled(
    Array.from({ length: 500 }, () => get("/", { cookie }, idleAgent))
);
out.idle_conns_ok = idle.filter((r) => r.status === "fulfilled").length;
await new Promise((r) => setTimeout(r, 20000));
mark("end idle500");
idleAgent.destroy();
console.log(JSON.stringify(out));
