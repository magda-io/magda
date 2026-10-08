// #3841 Experiment 4B: hold one idle /api/remote.mux socket through the
// ingress for <seconds> and report when / how it closed and how many DSH
// heartbeat pings arrived. The client answers pings with pongs.
// Usage: node ws-longlived.mjs <alice|bob> <seconds>
import { login, openMux } from "./lib/magda.mjs";

const [user = "alice", secondsArg = "300"] = process.argv.slice(2);
const seconds = Number(secondsArg);
const cookie = await login(user);
const started = Date.now();
const r = await openMux({ cookie });
if (r.status !== 101) {
    console.log(JSON.stringify({ user, handshake: r.status, body: r.body }));
    process.exit(1);
}
let firstPingAt;
r.ws.on("ping", () => (firstPingAt ??= Date.now()));
const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ outcome: "still-open", closeCode: undefined }), seconds * 1000);
    r.ws.on("close", (code) => {
        clearTimeout(timer);
        resolve({ outcome: "closed", closeCode: code ?? "tcp-close-without-close-frame" });
    });
});
console.log(
    JSON.stringify({
        user,
        heldSeconds: Math.round((Date.now() - started) / 1000),
        ...result,
        pings: r.ws.pings,
        firstPingAfterMs: firstPingAt ? firstPingAt - started : undefined
    })
);
r.ws.close();
setTimeout(() => process.exit(0), 600);
