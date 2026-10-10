#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
let payload;
try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
    console.error("magda-agent-bootstrap: invalid JSON payload");
    process.exit(64);
}
if (
    payload?.version !== 1 ||
    !payload?.magda?.baseUrl ||
    !payload?.magda?.apiKeyId ||
    !payload?.magda?.apiKey ||
    !payload?.llm?.baseUrl ||
    !payload?.llm?.model ||
    !payload?.llm?.authorization
) {
    console.error("magda-agent-bootstrap: incomplete payload");
    process.exit(64);
}

function atomicJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o600
    });
    fs.renameSync(tmp, file);
    fs.chmodSync(file, 0o600);
}
function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

// Some CSI/KAS combinations pre-create the image WORKDIR as root even with an
// fsGroup. Replace that unwritable directory from its writable PVC parent and
// copy any existing content so DSH always receives a user-owned workspace.
const workspace = "/data/workspace";
fs.mkdirSync("/data", { recursive: true });
try {
    fs.accessSync(workspace, fs.constants.W_OK);
} catch {
    const backup = `/data/.workspace-readonly-${Date.now()}`;
    if (fs.existsSync(workspace)) fs.renameSync(workspace, backup);
    fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
    if (fs.existsSync(backup)) {
        fs.cpSync(backup, workspace, { recursive: true, force: false });
    }
}

atomicJson("/data/config/mgd/config.json", {
    activeProfile: payload.magda.profile || "magda-agent-workspace",
    profiles: {
        [payload.magda.profile || "magda-agent-workspace"]: {
            baseUrl: payload.magda.baseUrl,
            apiKeyId: payload.magda.apiKeyId,
            apiKey: payload.magda.apiKey
        }
    }
});

const envFile = "/data/config/magda-agent.env";
const envTmp = `${envFile}.${process.pid}.tmp`;
fs.writeFileSync(
    envTmp,
    [
        `export MAGDA_LLM_BASE_URL=${shellQuote(payload.llm.baseUrl)}`,
        `export MAGDA_LLM_API_KEY=${shellQuote(payload.llm.authorization)}`,
        `export MAGDA_LLM_MODEL=${shellQuote(payload.llm.model)}`,
        ...(payload.llm.reasoningEffort
            ? [
                  `export MAGDA_LLM_REASONING_EFFORT=${shellQuote(
                      payload.llm.reasoningEffort
                  )}`
              ]
            : []),
        ""
    ].join("\n"),
    { mode: 0o600 }
);
fs.renameSync(envTmp, envFile);
fs.chmodSync(envFile, 0o600);
atomicJson("/data/config/magda-agent-bootstrap.json", {
    version: payload.version,
    userId: payload.userId,
    apiKeyId: payload.magda.apiKeyId,
    completedAt: new Date().toISOString()
});

// DSH was started while this Sandbox was warm and unclaimed. Restart the
// container after the secret-bearing config is persisted so the managed
// provider consumes it. The delayed signal lets this exec return success.
const children = fs
    .readdirSync("/proc")
    .filter((name) => /^\d+$/.test(name))
    .map(Number)
    .filter((pid) => pid > 1)
    .filter((pid) => {
        try {
            return fs
                .readFileSync(`/proc/${pid}/cmdline`, "utf8")
                .includes("dsh-launch.mjs");
        } catch {
            return false;
        }
    });
if (children.length) {
    const child = children[0];
    setTimeout(() => {
        try {
            process.kill(child, "SIGTERM");
        } catch {
            // The kubelet may already be restarting the process.
        }
    }, 500);
}
console.log("magda-agent-bootstrap: managed configuration installed");
