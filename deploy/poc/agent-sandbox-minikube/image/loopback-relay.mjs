// Raw TCP relay: <pod IP>:RELAY_PORT -> 127.0.0.1:DSH_WEB_PORT.
//
// DSH only binds loopback (`--host 0.0.0.0` is rejected by design), and under
// gVisor the sandbox loopback lives in gVisor's own netstack, so neither
// `kubectl port-forward` nor any other Pod can reach it. Relaying raw bytes
// keeps HTTP Host/Origin headers and WebSocket upgrades intact, so DSH's token
// cookie and browser-trust fence still apply. Anything that can reach the
// relay port reaches DSH, so the relay must be fenced by NetworkPolicy to the
// trusted proxy (Agent Manager / PoC access relay) only.
//
// The same script also runs as the PoC access relay (a runc Pod that
// `kubectl port-forward` can reach) with TARGET_HOST/TARGET_PORT pointing at a
// sandbox Pod's relay port.
import net from "node:net";

const listenPort = Number(process.env.RELAY_PORT || 8080);
const targetHost = process.env.TARGET_HOST || "127.0.0.1";
const targetPort = Number(
    process.env.TARGET_PORT || process.env.DSH_WEB_PORT || 3080
);

const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, targetHost);
    client.pipe(upstream).pipe(client);
    const close = () => {
        client.destroy();
        upstream.destroy();
    };
    client.on("error", close);
    upstream.on("error", close);
    client.on("close", close);
    upstream.on("close", close);
});

server.listen(listenPort, "0.0.0.0", () => {
    console.log(
        `magda-agent relay: 0.0.0.0:${listenPort} -> ${targetHost}:${targetPort}`
    );
});
