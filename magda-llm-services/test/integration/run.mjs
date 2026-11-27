#!/usr/bin/env node
/** Opt-in #3945/#3950 qualification. Never uses a deployment or existing DB. */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const id = `magda-3945-${randomUUID()}`;
const postgres = `${id}-pg`;
const opa = `${id}-opa`;
const pgImage = process.env.HARNESS_POSTGRES_IMAGE || "postgres:17-alpine";
const opaImage =
    process.env.HARNESS_OPA_IMAGE || "openpolicyagent/opa:0.37.2-static";
const env = { ...process.env };
// Do not inherit libpq/node-postgres connection, TLS, service-file or startup
// options. Rebuild the supported PG and POSTGRES aliases for our instance below.
for (const name of Object.keys(env)) {
    if (name.startsWith("PG") || name.startsWith("POSTGRES_")) delete env[name];
}
Object.assign(env, {
    POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
    HARNESS_JWT_SECRET: randomBytes(32).toString("hex"),
    HARNESS_LITELLM_KEY: randomBytes(32).toString("hex")
});
let child;
let interrupted = false;
let stage = "preflight";
const created = new Set();
function docker(args) {
    // Never emit Docker stderr: failures can include invocation environment.
    return execFileSync("docker", args, {
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
    }).trim();
}
function port(name, containerPort) {
    const bindings = JSON.parse(
        docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", name])
    );
    return bindings[`${containerPort}/tcp`][0].HostPort;
}
function stop() {
    interrupted = true;
    child?.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
let status = 1;
try {
    docker(["info", "--format", "{{.ServerVersion}}"]);
    // --pull=never avoids silently changing versions or accessing registries.
    docker(["image", "inspect", pgImage]);
    docker(["image", "inspect", opaImage]);
    stage = "start-postgres";
    docker([
        "run",
        "--pull=never",
        "--detach",
        "--name",
        postgres,
        "--label",
        `magda.integration-run=${id}`,
        "--rm",
        "--publish",
        "127.0.0.1::5432",
        "--env",
        "POSTGRES_PASSWORD",
        "--tmpfs",
        "/var/lib/postgresql/data:rw",
        pgImage
    ]);
    created.add(postgres);
    stage = "start-opa";
    docker([
        "run",
        "--pull=never",
        "--detach",
        "--name",
        opa,
        "--label",
        `magda.integration-run=${id}`,
        "--rm",
        "--publish",
        "127.0.0.1::8181",
        "--mount",
        `type=bind,source=${path.join(
            root,
            "magda-opa/policies"
        )},target=/policies,readonly`,
        opaImage,
        "run",
        "--ignore=.*",
        "--server",
        "--addr=0.0.0.0:8181",
        "/policies"
    ]);
    created.add(opa);
    stage = "run-tests";
    env.PGHOST = "127.0.0.1";
    env.PGPORT = port(postgres, 5432);
    env.PGUSER = "postgres";
    env.PGPASSWORD = env.POSTGRES_PASSWORD;
    env.PGDATABASE = "postgres";
    env.POSTGRES_HOST = "127.0.0.1";
    env.POSTGRES_USER = "postgres";
    env.POSTGRES_DB = "postgres";
    env.PGSSLMODE = "disable";
    env.HARNESS_OPA_URL = `http://127.0.0.1:${port(opa, 8181)}/`;
    env.OPA_URL = env.HARNESS_OPA_URL;
    env.HARNESS_RUN_ID = id;
    env.HARNESS_POSTGRES_IMAGE_ID = docker([
        "inspect",
        "--format",
        "{{.Image}}",
        postgres
    ]);
    env.HARNESS_OPA_IMAGE_ID = docker([
        "inspect",
        "--format",
        "{{.Image}}",
        opa
    ]);
    if (interrupted) throw new Error("interrupted");
    async function execute(file) {
        child = spawn(
            process.execPath,
            [
                path.join(root, "node_modules/tsx/dist/cli.mjs"),
                "--tsconfig",
                path.join(
                    root,
                    "magda-llm-services/test/integration/tsconfig.json"
                ),
                path.join(root, `magda-llm-services/test/integration/${file}`)
            ],
            { cwd: root, env, stdio: "inherit" }
        );
        return new Promise((resolve, reject) => {
            child.once("error", reject);
            child.once("exit", (code) => resolve(code ?? 1));
        });
    }
    status = await execute("suite.ts");
    if (
        status === 0 &&
        !interrupted &&
        process.argv.includes("--existing-tests")
    ) {
        stage = "existing-tests";
        status = await execute("existing-tests.ts");
    }
} catch {
    console.error(
        JSON.stringify({
            event: "harness-runner-failed",
            stage,
            hint:
                "Requires Docker, cached images and root node_modules. No deployment is used; raw errors are deliberately suppressed."
        })
    );
} finally {
    let cleanupOk = true;
    for (const name of [...created].reverse()) {
        try {
            // Verify exact generated name AND ownership label before removal.
            const label = docker([
                "inspect",
                "--format",
                '{{index .Config.Labels "magda.integration-run"}}',
                name
            ]);
            if (label !== id || ![postgres, opa].includes(name))
                throw new Error("ownership mismatch");
            docker(["rm", "--force", name]);
        } catch {
            cleanupOk = false;
        }
    }
    console.log(
        JSON.stringify({
            event: "harness-cleanup",
            ok: cleanupOk,
            containers: [...created],
            persistentVolumes: false
        })
    );
    if (!cleanupOk) status = 1;
}
process.exitCode = interrupted ? 130 : status;
