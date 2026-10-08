// Shared Playwright helpers for the #3841 browser tests. The browser on the
// host reaches the real minikube ingress on 127.0.0.1:18443 as
// https://magda.test:18443 (Chrome host-resolver rule, no /etc/hosts edit and
// no kubectl port-forward).
import { chromium } from "playwright-core";

export const ORIGIN = process.env.MAGDA_ORIGIN || "https://magda.test:18443";
export const MOUNT = `${ORIGIN}/api/v0/agent/runtime/`;
export const PASSWORD = process.env.POC_PASSWORD || "poc-password-3841";

export async function launch() {
    return chromium.launch({
        channel: process.env.PW_CHANNEL || "chrome",
        headless: process.env.HEADFUL ? false : true,
        args: ["--host-resolver-rules=MAP magda.test 127.0.0.1"]
    });
}

/** New context logged in to Magda with the internal auth plugin (login runs in the page). */
export async function loggedInContext(browser, email) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    if (email) {
        const page = await context.newPage();
        await page.goto(`${ORIGIN}/api/v0/auth/users/whoami`);
        const ok = await page.evaluate(
            async ([username, password]) => {
                const res = await fetch("/auth/login/plugin/internal", {
                    method: "POST",
                    body: new URLSearchParams({ username, password }),
                    redirect: "manual"
                });
                await res.text();
                const who = await (await fetch("/api/v0/auth/users/whoami")).json();
                return who.email === username;
            },
            [email, PASSWORD]
        );
        await page.close();
        if (!ok) throw new Error(`login failed for ${email}`);
    }
    return context;
}

/**
 * Record DSH Remote mux traffic of a page: one physical socket per
 * `/api/remote.mux` URL, logical streams by streamId.
 */
export function recordMux(page) {
    const rec = { sockets: [], opened: new Map(), up: [], down: [], closed: [] };
    page.on("websocket", (ws) => {
        const sock = { url: ws.url(), openedAt: Date.now(), closedAt: undefined };
        rec.sockets.push(sock);
        ws.on("close", () => {
            sock.closedAt = Date.now();
            rec.closed.push(sock);
        });
        ws.on("framesent", ({ payload }) => {
            try {
                const m = JSON.parse(payload);
                rec.up.push(m);
                if (m.type === "open") rec.opened.set(m.streamId, m.endpoint);
            } catch {}
        });
        ws.on("framereceived", ({ payload }) => {
            try {
                rec.down.push(JSON.parse(payload));
            } catch {}
        });
    });
    return rec;
}

export function summariseMux(rec) {
    const count = (list, type) => list.filter((m) => m.type === type).length;
    return {
        physicalSockets: rec.sockets.length,
        socketsClosed: rec.closed.length,
        logicalStreamsOpened: rec.opened.size,
        endpoints: [...new Set(rec.opened.values())].sort(),
        uplink: { open: count(rec.up, "open"), item: count(rec.up, "item"), end: count(rec.up, "end"), cancel: count(rec.up, "cancel") },
        downlink: { item: count(rec.down, "item"), end: count(rec.down, "end"), error: count(rec.down, "error") }
    };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
