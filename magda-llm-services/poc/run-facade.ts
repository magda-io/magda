/**
 * Optional local launcher: the actual facade with a disposable loopback usage tap.
 * Uses the same environment contract as src/index.ts; never logs credentials,
 * bodies, user/request identifiers, provider errors, or arbitrary event names.
 */
import createApp, { parseAllowedModels } from "../src/createApp.js";
import { startUsageTap } from "./usage-tap.js";

const jwtSecret = process.env.JWT_SECRET;
const liteLlmKey = process.env.LITELLM_MASTER_KEY;
if (!jwtSecret || !liteLlmKey) {
    throw new Error("JWT_SECRET and LITELLM_MASTER_KEY are required");
}
const allowedModels = parseAllowedModels(process.env.ALLOWED_MODELS);
const target = new URL(process.env.LITELLM_URL || "http://127.0.0.1:4000");
const port = Number(process.env.PORT || 61394);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer from 0 to 65535");
}
const tap = await startUsageTap(target, (observation) => {
    console.log(JSON.stringify({ event: "poc-usage", ...observation }));
});
const server = createApp({
    jwtSecret,
    liteLlmKey,
    liteLlmUrl: tap.url,
    allowedModels,
    authApiUrl: process.env.AUTH_API_URL || "http://127.0.0.1:61395/v0"
}).listen(port, "127.0.0.1", () => {
    console.log(
        JSON.stringify({ event: "poc-listening", address: server.address() })
    );
});
server.requestTimeout = 0;
function stop() {
    server.closeAllConnections();
    tap.server.closeAllConnections();
    server.close();
    tap.server.close();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
