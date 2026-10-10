import createApp from "./createApp.js";

const port = Number(process.env.PORT || 80);
const jwtSecret = process.env.JWT_SECRET;
const liteLlmKey = process.env.LITELLM_MASTER_KEY;

if (!jwtSecret) throw new Error("JWT_SECRET is required");
if (!liteLlmKey) throw new Error("LITELLM_MASTER_KEY is required");

const app = createApp({
    jwtSecret,
    authApiUrl: process.env.AUTH_API_URL || "http://authorization-api/v0",
    liteLlmUrl: new URL(process.env.LITELLM_URL || "http://litellm:4000"),
    liteLlmKey,
    allowedModels: new Set(
        (process.env.ALLOWED_MODELS || "magda-agent-default")
            .split(",")
            .map((model) => model.trim())
            .filter(Boolean)
    )
});

const server = app.listen(port, () =>
    console.log(JSON.stringify({ event: "llm-services-listening", port }))
);
server.requestTimeout = 0;
process.on("SIGTERM", () => server.close(() => process.exit(0)));
