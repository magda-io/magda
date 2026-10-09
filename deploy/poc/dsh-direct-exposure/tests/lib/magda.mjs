// HTTP helpers that talk to the minikube ingress (127.0.0.1:18443) as
// https://magda.test:18443 without DNS changes: TLS SNI + Host header.
import https from "node:https";
import { connect } from "./ws.mjs";

export const EXTERNAL_HOST = process.env.MAGDA_HOST || "magda.test";
export const EXTERNAL_PORT = Number(process.env.MAGDA_PORT || 18443);
export const AUTHORITY = `${EXTERNAL_HOST}:${EXTERNAL_PORT}`;
export const ORIGIN = `https://${AUTHORITY}`;
export const MOUNT_PATH = "/api/v0/agent/runtime/";
export const PASSWORD = process.env.POC_PASSWORD || "poc-password-3841";
export const USERS = {
    alice: { email: "alice@magda.test", id: "00000000-0000-4000-8000-00000000a11c" },
    bob: { email: "bob@magda.test", id: "00000000-0000-4000-8000-000000000b0b" }
};

export function request(method, path, { headers = {}, body, host = AUTHORITY } = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                host: "127.0.0.1",
                port: EXTERNAL_PORT,
                servername: EXTERNAL_HOST,
                rejectUnauthorized: false,
                method,
                path,
                headers: { host, ...headers }
            },
            (res) => {
                const chunks = [];
                res.on("data", (d) => chunks.push(d));
                res.on("end", () =>
                    resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() })
                );
            }
        );
        req.on("error", reject);
        req.end(body);
    });
}

/** Magda password login; returns the `connect.sid=...` cookie pair. */
export async function login(user) {
    const res = await request("POST", "/auth/login/plugin/internal", {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: USERS[user].email, password: PASSWORD }).toString()
    });
    const cookie = (res.headers["set-cookie"] || []).map((c) => c.split(";")[0]).find((c) => c.startsWith("connect.sid="));
    if (!cookie) throw new Error(`login failed for ${user}: ${res.status}`);
    return cookie;
}

/** Open the DSH Remote mux through the ingress. */
export function openMux({ cookie, host = AUTHORITY, origin = ORIGIN, path = `${MOUNT_PATH}api/remote.mux`, extra = {} } = {}) {
    const headers = { Host: host, ...extra };
    if (origin) headers.Origin = origin;
    if (cookie) headers.Cookie = cookie;
    return connect({
        connectHost: "127.0.0.1",
        connectPort: EXTERNAL_PORT,
        tls: true,
        servername: EXTERNAL_HOST,
        path,
        headers
    });
}
