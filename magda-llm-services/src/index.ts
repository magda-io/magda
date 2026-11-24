import createApp, { parseAllowedModels } from "./createApp.js";
import createPgPool from "magda-typescript-common/src/createPgPool.js";
import {
    parseUsageEstimateConfig,
    parseUsageObserverLimits
} from "./metering/settlement.js";
import { parseUsageTimeZone } from "./usage/periods.js";

const port = Number(process.env.PORT || 80);
const jwtSecret = process.env.JWT_SECRET;
const liteLlmKey = process.env.LITELLM_MASTER_KEY;

if (!jwtSecret) throw new Error("JWT_SECRET is required");
if (!liteLlmKey) throw new Error("LITELLM_MASTER_KEY is required");

// The LLM Services database (#3838): access profiles and token usage. The Helm
// chart always sets DB_HOST; without it (local development) there is no DB.
const pool = process.env.DB_HOST
    ? createPgPool({
          dbHost: process.env.DB_HOST,
          dbPort: Number(process.env.DB_PORT || 5432),
          database: process.env.DB_NAME || "llm"
      })
    : undefined;

const app = createApp({
    jwtSecret,
    authApiUrl: process.env.AUTH_API_URL || "http://authorization-api/v0",
    liteLlmUrl: new URL(process.env.LITELLM_URL || "http://litellm:4000"),
    liteLlmKey,
    allowedModels: parseAllowedModels(process.env.ALLOWED_MODELS),
    pool,
    usageEstimate: parseUsageEstimateConfig(process.env),
    observerLimits: parseUsageObserverLimits(process.env),
    usageTimeZone: parseUsageTimeZone(process.env.USAGE_TIME_ZONE)
});

const server = app.listen(port, () =>
    console.log(JSON.stringify({ event: "llm-services-listening", port }))
);
server.requestTimeout = 0;
process.on("SIGTERM", () =>
    server.close(async () => {
        await pool?.end();
        process.exit(0);
    })
);
