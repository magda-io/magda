/*
 * Real local Auth API + OPA + Postgres + LLM facade. FAKE LiteLLM/provider.
 * Launched only by run.mjs: no externally supplied DB/cluster credentials.
 * Assertions and evidence contain metadata only, never sessions/content.
 */
import http from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import jwt from "jsonwebtoken";
import pg from "pg";
import "../../../magda-typescript-common/src/pgTypes.js";
import Database from "../../../magda-authorization-api/src/Database.js";
import createApiRouter from "../../../magda-authorization-api/src/createApiRouter.js";
import createOpaRouter from "../../../magda-authorization-api/src/createOpaRouter.js";
import AuthDecisionQueryClient from "../../../magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import AuthorizedRegistryClient from "../../../magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import createApp from "../../src/createApp.js";
import AuthApiClient from "../../src/authApi/AuthApiClient.js";
import ProfileService from "../../src/profiles/ProfileService.js";
import ProfileRepository from "../../src/profiles/ProfileRepository.js";
import ServedModels from "../../src/access/ServedModels.js";

const ADMIN = "00000000-0000-4000-8000-000000000000";
const ADMIN_ROLE = "00000000-0000-0003-0000-000000000000";
const ANONYMOUS_ROLE = "00000000-0000-0001-0000-000000000000";
const AUTHENTICATED_ROLE = "00000000-0000-0002-0000-000000000000";
const MANAGER_ROLE = "00000000-3838-4200-8000-000000000001";
const WORKSPACE_ROLE = "00000000-3854-4200-8000-000000000001";
const secret = process.env.HARNESS_JWT_SECRET!;
const key = process.env.HARNESS_LITELLM_KEY!;
const opaUrl = process.env.HARNESS_OPA_URL!;
const root = new URL("../../../", import.meta.url);
const results: Array<{
    name: string;
    ok: boolean;
    durationMs: number;
    failure?: string;
}> = [];
const servers: http.Server[] = [];
const pools: pg.Pool[] = [];
const authLookups = new Map<string, number>();
const forwards: Array<{ alias: string; endpoint: string }> = [];
let served = new Set<string>();
let modelsAvailable = true;
let usageFixture: "valid" | "missing" | "malformed" | "oversize" = "valid";
let authUrl: string;
let llm: string;
let manager: string;
let db: Database;
let llmPool: pg.Pool;
let profiles: ProfileService;
let fakeUrl: URL;
let setupStage = "dependencies";
const aliases = new Set([
    "role-a",
    "role-b",
    "quota",
    "zero",
    "unlimited",
    "or-budget",
    "cache",
    "no-cache",
    "own",
    "ancestor",
    "descendant",
    "sibling",
    "no-org",
    "public",
    "owner",
    "forged",
    "wild-a",
    "wild-b",
    "unserved",
    "streams",
    "admin-only",
    "meter-fallback",
    "authenticated-only"
]);

// Avoid accidental service error logs containing request objects. Harness output
// is a strict allowlist: test names, statuses/counts, revisions and image IDs.
console.log = console.warn = console.error = () => undefined;
const output = (value: unknown) =>
    process.stdout.write(JSON.stringify(value) + "\n");
function check(ok: unknown, label: string): asserts ok {
    if (!ok) throw new Error(label);
}
function equal(actual: unknown, expected: unknown, label: string) {
    check(JSON.stringify(actual) === JSON.stringify(expected), label);
}
async function test(name: string, action: () => Promise<void>) {
    const started = Date.now();
    try {
        await action();
        results.push({ name, ok: true, durationMs: Date.now() - started });
    } catch (error) {
        // Only our literal assertion labels / HTTP metadata are printable.
        const failure =
            error instanceof Error &&
            /^(assert:|HTTP |timeout:)/.test(error.message)
                ? error.message
                : `unexpected-${error instanceof Error ? error.name : "error"}`;
        results.push({
            name,
            ok: false,
            durationMs: Date.now() - started,
            failure
        });
    }
    output({ event: "harness-test", ...results.at(-1) });
}
function session(user: string, extra = {}) {
    return jwt.sign({ ...extra, userId: user }, secret, {
        algorithm: "HS256",
        expiresIn: "10m"
    });
}
async function listen(app: http.RequestListener) {
    const server = http.createServer(app);
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as { port: number };
    return `http://127.0.0.1:${address.port}`;
}
async function call(
    base: string,
    user: string | undefined,
    method: string,
    route: string,
    body?: unknown,
    expected = 200,
    headers: Record<string, string> = {}
) {
    const response = await fetch(base + route, {
        method,
        headers: {
            ...(user ? { "X-Magda-Session": session(user) } : {}),
            ...(body !== undefined
                ? { "Content-Type": "application/json" }
                : {}),
            ...headers
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000)
    });
    const text = await response.text();
    check(
        response.status === expected,
        `HTTP ${method} ${route.split("?")[0]} expected ${expected} got ${
            response.status
        }`
    );
    let data: any;
    try {
        data = text ? JSON.parse(text) : undefined;
    } catch {
        data = undefined;
    }
    return { data, response, bytes: Buffer.byteLength(text) };
}
const auth = (
    user: string,
    method: string,
    route: string,
    body?: unknown,
    status = 200
) => call(authUrl + "/public", user, method, route, body, status);
async function newUser(name: string, roles: string[] = [], orgUnitId?: string) {
    const { data } = await auth(ADMIN, "POST", "/users", {
        displayName: name,
        email: `${randomUUID()}@harness.invalid`,
        photoURL: "",
        source: "integration-harness",
        sourceId: randomUUID(),
        ...(orgUnitId ? { orgUnitId } : {})
    });
    if (roles.length)
        await auth(ADMIN, "POST", `/users/${data.id}/roles`, roles);
    return data.id as string;
}
async function newRole(name: string) {
    return (
        await auth(ADMIN, "POST", "/roles", {
            name,
            description: "Disposable harness fixture"
        })
    ).data.id as string;
}
async function permission(
    role: string,
    flags: Record<string, boolean> = {},
    operationUris = ["llm/access/invoke"]
) {
    const { data } = await auth(ADMIN, "POST", `/roles/${role}/permissions`, {
        name: "Harness permission",
        description: "Disposable",
        resourceUri: "llm/access",
        user_ownership_constraint: false,
        org_unit_ownership_constraint: false,
        pre_authorised_constraint: false,
        allow_exemption: false,
        ...flags,
        operationUris
    });
    // Guard the dangerous API convention: snake_case is required for flags.
    for (const [flag, value] of Object.entries(flags))
        equal(data[flag], value, `assert:permission flag ${flag}`);
    return data;
}
async function profile(alias: string, overrides: Record<string, unknown> = {}) {
    return (
        await call(
            llm,
            manager,
            "POST",
            "/access-profiles",
            {
                name: `Harness ${alias} ${randomUUID()}`,
                description: "Disposable harness profile",
                allowedModels: [alias],
                enabled: true,
                orgUnitId: null,
                constraintExemption: false,
                allowedDailyTokens: null,
                allowedWeeklyTokens: null,
                allowedMonthlyTokens: null,
                ...overrides
            },
            201
        )
    ).data;
}
async function update(p: any, fields: Record<string, unknown>, expected = 200) {
    const editable = Object.fromEntries(
        [
            "name",
            "description",
            "allowedModels",
            "enabled",
            "orgUnitId",
            "constraintExemption",
            "allowedDailyTokens",
            "allowedWeeklyTokens",
            "allowedMonthlyTokens"
        ].map((field) => [field, p[field]])
    );
    return (
        await call(
            llm,
            manager,
            "PUT",
            `/access-profiles/${p.id}`,
            { ...editable, ...fields },
            expected,
            { "If-Match": `"${p.revision}"` }
        )
    ).data;
}
async function attach(p: any, role: string, expected = 204) {
    await call(
        llm,
        manager,
        "PUT",
        `/access-profiles/${p.id}/roles/${role}`,
        undefined,
        expected
    );
}
async function invoke(
    user: string | undefined,
    alias: string,
    expected = 200,
    base = llm,
    extra = {}
) {
    return call(
        base,
        user,
        "POST",
        "/v1/chat/completions",
        {
            model: alias,
            messages: [
                { role: "user", content: "synthetic integration fixture" }
            ],
            ...extra
        },
        expected
    );
}
async function models(user: string, base = llm) {
    const { data } = await call(base, user, "GET", "/v1/models");
    return data.data.map((item: { id: string }) => item.id).sort() as string[];
}
async function used(user: string, alias: string) {
    const { rows } = await llmPool.query(
        `SELECT COALESCE(SUM(measured_input_tokens + measured_output_tokens + estimated_tokens), 0)::int n
        FROM daily_model_usage WHERE user_id=$1 AND model_alias=$2`,
        [user, alias]
    );
    return rows[0].n as number;
}
async function awaitUsed(user: string, alias: string, expected: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        if ((await used(user, alias)) === expected) return;
        await delay(20);
    }
    throw new Error("timeout:settlement count");
}
async function facade(ttl = 0, observerLimits?: { maxJsonBytes?: number }) {
    return (
        (await listen(
            createApp({
                jwtSecret: secret,
                authApiUrl: authUrl,
                liteLlmUrl: fakeUrl,
                liteLlmKey: key,
                allowedModels: aliases,
                pool: llmPool,
                profiles,
                decisionCacheSeconds: ttl,
                observerLimits,
                servedModels: new ServedModels({
                    liteLlmUrl: fakeUrl,
                    liteLlmKey: key,
                    cacheMs: 0,
                    failureCacheMs: 0
                }),
                usageTimeZone: "Australia/Sydney"
            })
        )) + "/v0"
    );
}
async function migrate(pool: pg.Pool, relative: string, skipClient = false) {
    const dir = new URL(relative + "/", root);
    const version = (name: string) =>
        name
            .match(/^V([\d_]+)__/i)?.[1]
            .split("_")
            .map(Number) || [];
    const files = (await readdir(dir))
        .filter(
            (f) =>
                /^V.*\.sql$/i.test(f) && !(skipClient && f.startsWith("V1_2__"))
        )
        .sort((a, b) => {
            const aa = version(a),
                bb = version(b);
            for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
                const delta = (aa[i] || 0) - (bb[i] || 0);
                if (delta) return delta;
            }
            return 0;
        });
    for (const file of files) {
        setupStage = `migration:${relative}:${file}`;
        const sql = (await readFile(new URL(file, dir), "utf8"))
            .replace(/\$\{clientUserName\}/g, "postgres")
            .replace(/\$\{clientPassword\}/g, process.env.PGPASSWORD || "");
        await pool.query(sql);
    }
}
async function bootstrap() {
    check(
        /^magda-3945-[a-f0-9-]+$/.test(process.env.HARNESS_RUN_ID || ""),
        "assert:runner required"
    );
    const adminPool = new pg.Pool();
    pools.push(adminPool);
    const deadline = Date.now() + 30_000;
    while (true) {
        try {
            await adminPool.query("SELECT 1");
            check(
                (await fetch(new URL("health", opaUrl))).ok,
                "assert:OPA healthy"
            );
            break;
        } catch {
            if (Date.now() >= deadline)
                throw new Error("timeout:isolated dependencies");
            await delay(200);
        }
    }
    await adminPool.query('CREATE DATABASE "auth"');
    await adminPool.query('CREATE DATABASE "llm"');
    db = new Database({
        dbHost: "127.0.0.1",
        dbPort: Number(process.env.PGPORT)
    });
    pools.push(db.getPool());
    llmPool = new pg.Pool({ database: "llm" });
    pools.push(llmPool);
    // Same SQL as services' DB tests; V1_2 creates a cluster login, not schema.
    await migrate(db.getPool(), "magda-migrator-authorization-db/sql", true);
    await migrate(llmPool, "magda-migrator-llm-services-db/sql");
    setupStage = "auth-api-bootstrap";
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        const token = req.get("X-Magda-Session");
        const user = token ? (jwt.decode(token) as any)?.userId : "anonymous";
        if (
            req.path.includes("/decision/") ||
            req.path.endsWith("/users/whoami")
        ) {
            const countKey = `${user}:${req.path}`;
            authLookups.set(countKey, (authLookups.get(countKey) || 0) + 1);
        }
        next();
    });
    authUrl = (await listen(app)) + "/v0";
    app.use(
        "/v0",
        createApiRouter({
            database: db,
            jwtSecret: secret,
            opaUrl,
            tenantId: 0,
            authDecisionClient: new AuthDecisionQueryClient(authUrl),
            failedApiKeyAuthBackOffSeconds: 0,
            // Registry is not used by tested auth routes. Any accidental call fails closed.
            registryClient: new AuthorizedRegistryClient({
                baseUrl: "http://127.0.0.1:1/v0",
                jwtSecret: secret,
                userId: ADMIN,
                tenantId: 0,
                maxRetries: 0
            }),
            systemApiKeyIssuerUserId: ADMIN
        })
    );
    const opaRouter = createOpaRouter({
        database: db,
        jwtSecret: secret,
        opaUrl
    });
    app.use("/v0/opa", opaRouter);
    app.use("/v0/public/opa", opaRouter);
    manager = await newUser("Profile manager", [MANAGER_ROLE]);
    served = new Set([...aliases].filter((a) => a !== "unserved"));
    fakeUrl = new URL(
        await listen((req, res) => {
            if (req.headers.authorization !== `Bearer ${key}`) {
                res.writeHead(401).end();
                return;
            }
            if (req.method === "GET" && req.url === "/v1/models") {
                res.writeHead(modelsAvailable ? 200 : 503, {
                    "Content-Type": "application/json"
                });
                res.end(
                    JSON.stringify({
                        data: [...served].map((id) => ({ id, object: "model" }))
                    })
                );
                return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            req.on("data", (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes <= 65536) chunks.push(chunk);
            });
            req.on("end", () => {
                if (bytes > 65536) {
                    res.writeHead(413).end();
                    return;
                }
                const body = JSON.parse(Buffer.concat(chunks).toString());
                forwards.push({ alias: body.model, endpoint: req.url || "" });
                // No provider call and no model output: only deterministic token metadata.
                if (body.stream) {
                    res.writeHead(200, {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "public, max-age=3600"
                    });
                    if (req.url === "/v1/responses") {
                        res.write(
                            'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":7,"output_tokens":3,"total_tokens":10}}}\n\n'
                        );
                    } else
                        res.write(
                            'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10}}\n\n'
                        );
                    res.end("data: [DONE]\n\n");
                } else {
                    res.writeHead(200, {
                        "Content-Type": "application/json",
                        "Cache-Control": "public, max-age=3600"
                    });
                    res.end(
                        JSON.stringify({
                            object: "chat.completion",
                            ...(usageFixture === "missing"
                                ? {}
                                : {
                                      usage: {
                                          prompt_tokens:
                                              usageFixture === "malformed"
                                                  ? -7
                                                  : 7,
                                          completion_tokens: 3,
                                          total_tokens: 10
                                      }
                                  }),
                            ...(usageFixture === "oversize"
                                ? { fixture_metadata_padding: "x".repeat(1024) }
                                : {})
                        })
                    );
                }
            });
        })
    );
    profiles = new ProfileService({
        repository: new ProfileRepository(llmPool),
        authApi: new AuthApiClient({
            authApiUrl: authUrl,
            jwtSecret: secret,
            adminUserId: ADMIN
        })
    });
    llm = await facade();
}

async function qualification() {
    await test("AUTH-3/8/12 manager create/attach uses internal admin, not role-update rights", async () => {
        const r = await newRole("Invoke role");
        const u = await newUser("Role user", [r]);
        const p = await profile("role-a");
        const provisioned = (
            await auth(ADMIN, "GET", `/permissions/${p.usePermissionId}`)
        ).data;
        equal(
            provisioned.pre_authorised_constraint,
            true,
            "assert:managed permission pre-authorised"
        );
        equal(
            provisioned.user_ownership_constraint,
            false,
            "assert:managed permission not owner constrained"
        );
        equal(
            provisioned.org_unit_ownership_constraint,
            false,
            "assert:managed permission not org constrained"
        );
        equal(
            provisioned.allow_exemption,
            false,
            "assert:managed permission no exemption"
        );
        await auth(
            manager,
            "POST",
            `/roles/${r}/permissions/${p.usePermissionId}`,
            undefined,
            403
        );
        await invoke(u, "role-a", 403);
        await attach(p, r);
        await attach(p, r); // UI-idempotent
        await invoke(u, "role-a");
        await awaitUsed(u, "role-a", 10);
        equal(
            await models(u),
            ["role-a"],
            "assert:attached grant only its profile"
        );
        await profile("role-b");
        await invoke(u, "role-b", 403);
        const links = (
            await call(llm, manager, "GET", `/access-profiles/${p.id}/roles`)
        ).data;
        check(
            JSON.stringify(links).includes(r),
            "assert:real Auth API reverse role listing"
        );
        await call(
            llm,
            manager,
            "DELETE",
            `/access-profiles/${p.id}/roles/${r}`,
            undefined,
            204
        );
        await auth(ADMIN, "GET", `/permissions/${p.usePermissionId}`); // last detach keeps permission
        await invoke(u, "role-a", 403);
        await attach(p, r);
        await call(
            llm,
            manager,
            "DELETE",
            `/access-profiles/${p.id}`,
            undefined,
            204
        );
        await auth(
            ADMIN,
            "GET",
            `/permissions/${p.usePermissionId}`,
            undefined,
            404
        );
        await auth(ADMIN, "GET", `/roles/${r}`);
        await auth(ADMIN, "GET", `/users/${u}`);
        await invoke(u, "role-a", 403);
    });
    await test("AUTH-8 forbidden Admin/Anonymous role attach and invoke-only management denial", async () => {
        const p = await profile("role-a");
        await attach(p, ADMIN_ROLE, 422);
        await attach(p, ANONYMOUS_ROLE, 422);
        const u = await newUser("Unprivileged");
        await call(llm, u, "POST", "/access-profiles", p, 403);
        await call(
            llm,
            u,
            "PUT",
            `/access-profiles/${p.id}/roles/${WORKSPACE_ROLE}`,
            undefined,
            403
        );
    });
    await test("AUTH-3 constrained create/update grants cannot manage or attach", async () => {
        const r = await newRole("Constrained managers");
        await permission(
            r,
            { org_unit_ownership_constraint: true, allow_exemption: true },
            ["llm/access/create", "llm/access/update"]
        );
        const u = await newUser("Constrained manager", [r]);
        const p = await profile("role-a", { constraintExemption: true });
        await call(llm, u, "POST", "/access-profiles", p, 403);
        await call(
            llm,
            u,
            "PUT",
            `/access-profiles/${p.id}/roles/${r}`,
            undefined,
            403
        );
    });
    await test("LIFE-2 stale revision 409 and missing If-Match 428", async () => {
        const p = await profile("role-a");
        await update(p, { description: "revision changed" });
        await update(p, { description: "stale" }, 409);
        await call(llm, manager, "PUT", `/access-profiles/${p.id}`, p, 428);
    });
    await test("USE-2/6/7 quota 429 vs denial 403, no forwarding/debit on refusals", async () => {
        const r = await newRole("Quota users");
        const u = await newUser("Quota user", [r]);
        const p = await profile("quota", { allowedDailyTokens: 10 });
        await attach(p, r);
        const before = forwards.length;
        const response = await invoke(u, "quota", 200, llm, { user: ADMIN });
        equal(
            response.response.headers.get("cache-control"),
            "private, no-store",
            "assert:proxy cache-control private"
        );
        await awaitUsed(u, "quota", 10);
        equal(
            await used(ADMIN, "quota"),
            0,
            "assert:client user field ignored"
        );
        const blocked = await invoke(u, "quota", 429);
        equal(
            blocked.data.error.code,
            "llm_quota_exceeded",
            "assert:quota error code"
        );
        equal(
            blocked.response.headers.get("x-should-retry"),
            "false",
            "assert:no SDK automatic quota retries"
        );
        const denied = await invoke(u, "role-b", 403);
        equal(
            denied.data.error.code,
            "llm_no_eligible_profile",
            "assert:denial error code"
        );
        equal(forwards.length - before, 1, "assert:denials not forwarded");
        equal(await used(u, "quota"), 10, "assert:denials not debited");
        const me = await call(llm, u, "GET", `/usage/me?userId=${ADMIN}`);
        equal(me.data.user.id, u, "assert:usage/me ignores forged user ID");
        equal(
            me.response.headers.get("cache-control"),
            "private, no-store",
            "assert:usage cache-control private"
        );
        await call(llm, u, "GET", `/usage/users/${ADMIN}`, undefined, 403);
    });
    await test("DATA-3/USE-5 zero denies, NULL unlimited, profiles OR without limit stacking", async () => {
        const r = await newRole("Budget users");
        const u = await newUser("Budget user", [r]);
        const zero = await profile("zero", { allowedDailyTokens: 0 });
        await attach(zero, r);
        await invoke(u, "zero", 429);
        const unlimited = await profile("unlimited");
        await attach(unlimited, r);
        await invoke(u, "unlimited");
        await awaitUsed(u, "unlimited", 10);
        await invoke(u, "unlimited");
        await awaitUsed(u, "unlimited", 20);
        const a = await profile("or-budget", {
            allowedDailyTokens: 0,
            allowedMonthlyTokens: 100
        });
        const b = await profile("or-budget", {
            allowedDailyTokens: 100,
            allowedMonthlyTokens: 0
        });
        await attach(a, r);
        await attach(b, r);
        await invoke(u, "or-budget", 429); // cannot splice periods from a and b
        const c = await profile("or-budget", { allowedDailyTokens: 10 });
        await attach(c, r);
        await invoke(u, "or-budget");
        await awaitUsed(u, "or-budget", 10);
        await invoke(u, "or-budget", 429);
    });
    await test("AUTH-5 audience own/ancestor allowed, descendant/sibling/null denied via real ancestors", async () => {
        const queryer = db.getOrgQueryer();
        const rootNode = (await queryer.getRootNode()).valueOr(null);
        const orgRoot =
            rootNode?.id ||
            (await queryer.createRootNode({ name: "Harness root" }));
        const corporate = await queryer.insertNode(orgRoot, {
            name: "Corporate"
        });
        const finance = await queryer.insertNode(corporate, {
            name: "Finance"
        });
        const payroll = await queryer.insertNode(finance, { name: "Payroll" });
        const sales = await queryer.insertNode(corporate, { name: "Sales" });
        const r = await newRole("Audience only");
        await permission(r, { org_unit_ownership_constraint: true });
        const u = await newUser("Finance user", [r], finance);
        const noOrg = await newUser("No org user", [r]);
        for (const [alias, org] of [
            ["own", finance],
            ["ancestor", corporate],
            ["descendant", payroll],
            ["sibling", sales],
            ["no-org", null]
        ]) {
            await profile(alias!, { orgUnitId: org });
        }
        const visible = await models(u);
        equal(
            visible,
            ["ancestor", "own"],
            "assert:audience exact SQL filtered aliases"
        );
        await invoke(u, "own");
        await invoke(u, "ancestor");
        for (const alias of ["descendant", "sibling", "no-org"])
            await invoke(u, alias, 403);
        equal(
            await models(noOrg),
            [],
            "assert:no-org caller no audience grants"
        );
        await invoke(noOrg, "own", 403);
    });
    await test("AUTH-6 Public needs exemption-capable grant and never admits anonymous", async () => {
        await profile("public", { constraintExemption: true });
        const audience = await newRole("No exemption");
        await permission(audience, { org_unit_ownership_constraint: true });
        const withExemption = await newUser("Workspace public user", [
            WORKSPACE_ROLE
        ]);
        const without = await newUser("No exemption user", [audience]);
        const noGrant = await newUser("No permission public user");
        await invoke(withExemption, "public");
        await invoke(without, "public", 403);
        await invoke(noGrant, "public", 403);
        await invoke(undefined, "public", 401);
    });
    await test("AUTH-4 owner-constrained invoke matches no private profile", async () => {
        const r = await newRole("Owner only");
        await permission(r, { user_ownership_constraint: true });
        const u = await newUser("Owner user", [r]);
        await profile("owner");
        await invoke(u, "owner", 403);
    });
    await test("AUTHAPI-3 forged body/query/JWT user context cannot become admin or audience", async () => {
        const r = await newRole("Forgery audience");
        await permission(r, { org_unit_ownership_constraint: true });
        const u = await newUser("Forgery user", [r]);
        const queryer = db.getOrgQueryer();
        const rootNode = (await queryer.getRootNode()).valueOr(null);
        const orgRoot =
            rootNode?.id ||
            (await queryer.createRootNode({ name: "Forgery root" }));
        const restrictedOrg = await queryer.insertNode(orgRoot, {
            name: "Forgery restricted unit"
        });
        const p = await profile("forged", { orgUnitId: restrictedOrg });
        const forged = {
            id: ADMIN,
            roles: [{ id: ADMIN_ROLE }],
            orgUnitAncestorIds: [restrictedOrg],
            permissions: []
        };
        const decision = await call(
            authUrl,
            u,
            "POST",
            "/opa/decision/llm/access/invoke",
            {
                unknowns: [],
                input: {
                    user: forged,
                    object: {
                        llmAccessProfile: {
                            use_permission_id: p.usePermissionId,
                            org_unit_id: randomUUID(),
                            constraint_exemption: false
                        }
                    }
                }
            }
        );
        equal(
            decision.data.result,
            false,
            "assert:forged body user overwritten"
        );
        const query = encodeURIComponent(JSON.stringify({ user: forged }));
        const queryDecision = await call(
            authUrl,
            u,
            "POST",
            `/opa/decision/llm/access/invoke?input=${query}`,
            {
                unknowns: [],
                input: {
                    object: {
                        llmAccessProfile: {
                            constraint_exemption: false,
                            org_unit_id: randomUUID(),
                            use_permission_id: p.usePermissionId
                        }
                    }
                }
            }
        );
        equal(
            queryDecision.data.result,
            false,
            "assert:forged query user overwritten"
        );
        const audienceForgery = await call(
            authUrl,
            u,
            "POST",
            "/opa/decision/llm/access/invoke",
            {
                unknowns: [],
                input: {
                    user: { id: u, orgUnitAncestorIds: [restrictedOrg] },
                    object: {
                        llmAccessProfile: {
                            use_permission_id: p.usePermissionId,
                            org_unit_id: restrictedOrg,
                            constraint_exemption: false
                        }
                    }
                }
            }
        );
        equal(
            audienceForgery.data.result,
            false,
            "assert:forged ancestor list not trusted"
        );
        await invoke(u, "forged", 403, llm, {
            user: ADMIN,
            input: { user: forged }
        });
        await call(
            llm,
            u,
            "POST",
            "/v1/chat/completions",
            { model: "forged", messages: [] },
            403,
            {
                "X-Magda-Session": session(u, {
                    roles: forged.roles,
                    orgUnitAncestorIds: [randomUUID()],
                    user: forged
                })
            }
        );
        await call(llm, u, "GET", "/v1/models", undefined, 401, {
            "X-Magda-Session": jwt.sign(
                { userId: ADMIN },
                "invalid-untrusted-secret"
            )
        });
    });
    await test("EVAL-3 cached role revoke bounded by TTL; profile edits immediate; per-user cache", async () => {
        const r = await newRole("Cached users");
        const u = await newUser("Cached user", [r]);
        const other = await newUser("Other cached user");
        let p = await profile("cache");
        await attach(p, r);
        const cached = await facade(4);
        const countKey = `${u}:/v0/opa/decision/llm/access/invoke`;
        const whoKey = `${u}:/v0/public/users/whoami`;
        const before = authLookups.get(countKey) || 0;
        const whoBefore = authLookups.get(whoKey) || 0;
        await invoke(u, "cache");
        await awaitUsed(u, "cache", 10);
        await invoke(u, "cache", 200, cached);
        await awaitUsed(u, "cache", 20);
        const cacheStarted = Date.now();
        await invoke(other, "cache", 403, cached);
        p = await update(p, { enabled: false });
        await invoke(u, "cache", 403, cached);
        p = await update(p, { enabled: true });
        await call(
            llm,
            manager,
            "DELETE",
            `/access-profiles/${p.id}/roles/${r}`,
            undefined,
            204
        );
        await invoke(u, "cache", 200, cached);
        await awaitUsed(u, "cache", 30);
        equal(
            (authLookups.get(countKey) || 0) - before,
            2,
            "assert:one decision per facade before TTL"
        );
        equal(
            (authLookups.get(whoKey) || 0) - whoBefore,
            2,
            "assert:whoami cached with decision"
        );
        await delay(Math.max(0, 4250 - (Date.now() - cacheStarted)));
        const n = forwards.length;
        await invoke(u, "cache", 403, cached);
        equal(
            forwards.length,
            n,
            "assert:revoked user denied after TTL before forwarding"
        );
        equal(
            (authLookups.get(countKey) || 0) - before,
            3,
            "assert:decision refreshed after TTL"
        );
        equal(
            (authLookups.get(whoKey) || 0) - whoBefore,
            3,
            "assert:whoami refreshed after TTL"
        );
    });
    await test("EVAL-3 TTL=0 reflects role revoke on next request", async () => {
        const r = await newRole("No cache users");
        const u = await newUser("No cache user", [r]);
        const p = await profile("no-cache");
        await attach(p, r);
        await invoke(u, "no-cache");
        await awaitUsed(u, "no-cache", 10);
        await call(
            llm,
            manager,
            "DELETE",
            `/access-profiles/${p.id}/roles/${r}`,
            undefined,
            204
        );
        await invoke(u, "no-cache", 403);
    });
    await test("MODEL-1/2/3 wildcard served allowlist, fallback, per-alias and per-user counters", async () => {
        const r = await newRole("Wildcard role");
        const u = await newUser("Wildcard user", [r]);
        const other = await newUser("Other wildcard user", [r]);
        const p = await profile("wild-a", {
            allowedModels: ["*"],
            allowedDailyTokens: 10
        });
        await attach(p, r);
        const listed = await models(u);
        check(
            listed.includes("wild-a") &&
                listed.includes("wild-b") &&
                !listed.includes("unserved"),
            "assert:wildcard served intersection"
        );
        const n = forwards.length;
        await invoke(u, "unserved", 403);
        await invoke(u, "arbitrary-provider-name", 403);
        equal(
            forwards.length,
            n,
            "assert:unserved and disallowed never forwarded"
        );
        await invoke(u, "wild-a");
        await awaitUsed(u, "wild-a", 10);
        await invoke(u, "wild-a", 429);
        await invoke(u, "wild-b");
        await awaitUsed(u, "wild-b", 10);
        await invoke(other, "wild-a");
        await awaitUsed(other, "wild-a", 10);
        modelsAvailable = false;
        try {
            check(
                (await models(u)).includes("unserved"),
                "assert:wildcard list-unavailable fallback allowlist"
            );
            await invoke(other, "unserved");
            await awaitUsed(other, "unserved", 10);
            await invoke(other, "arbitrary-provider-name", 403);
        } finally {
            modelsAvailable = true;
        }
    });
    await test("AUTH-10 administrator allowlist-bound, quota-bypassed but recorded", async () => {
        await profile("admin-only", { allowedDailyTokens: 0 });
        await invoke(ADMIN, "admin-only");
        await awaitUsed(ADMIN, "admin-only", 10);
        await invoke(ADMIN, "admin-only");
        await awaitUsed(ADMIN, "admin-only", 20);
        await invoke(ADMIN, "arbitrary-provider-name", 403);
    });
    await test("METER-4 fake missing/malformed/oversize usage estimated, never measured as zero", async () => {
        const r = await newRole("Fallback metering users");
        const u = await newUser("Fallback user", [r]);
        const p = await profile("meter-fallback");
        await attach(p, r);
        const boundedObserver = await facade(0, { maxJsonBytes: 256 });
        let expectedRequests = 0;
        try {
            for (const mode of ["missing", "malformed", "oversize"] as const) {
                usageFixture = mode;
                await invoke(u, "meter-fallback", 200, boundedObserver);
                expectedRequests++;
                const deadline = Date.now() + 5000;
                while (true) {
                    const row = (
                        await llmPool.query(
                            `SELECT COALESCE(SUM(measured_input_tokens + measured_output_tokens),0)::int measured,
                        COALESCE(SUM(estimated_tokens),0)::int estimated, COALESCE(SUM(estimated_requests),0)::int requests
                        FROM daily_model_usage WHERE user_id=$1 AND model_alias='meter-fallback'`,
                            [u]
                        )
                    ).rows[0];
                    if (row.requests === expectedRequests) {
                        equal(
                            row.measured,
                            0,
                            "assert:invalid usage not measured"
                        );
                        check(
                            row.estimated > 0,
                            "assert:invalid usage estimated nonzero"
                        );
                        break;
                    }
                    if (Date.now() >= deadline)
                        throw new Error("timeout:estimated settlement");
                    await delay(20);
                }
            }
        } finally {
            usageFixture = "valid";
        }
    });
    await test("METER smoke: fake Chat/Responses streams settle measured metadata once", async () => {
        const r = await newRole("Streaming users");
        const u = await newUser("Streaming user", [r]);
        const p = await profile("streams");
        await attach(p, r);
        const chat = await invoke(u, "streams", 200, llm, { stream: true });
        equal(
            chat.response.headers.get("cache-control"),
            "private, no-store",
            "assert:stream cache private"
        );
        await awaitUsed(u, "streams", 10);
        const responses = await call(llm, u, "POST", "/v1/responses", {
            model: "streams",
            input: "synthetic integration fixture",
            stream: true
        });
        equal(
            responses.response.headers.get("cache-control"),
            "private, no-store",
            "assert:Responses stream cache private"
        );
        await awaitUsed(u, "streams", 20);
        const row = (
            await llmPool.query(
                `SELECT SUM(measured_input_tokens)::int i, SUM(measured_output_tokens)::int o,
            SUM(estimated_requests)::int e FROM daily_model_usage WHERE user_id=$1 AND model_alias='streams'`,
                [u]
            )
        ).rows[0];
        equal(
            row,
            { i: 14, o: 6, e: 0 },
            "assert:stream measured once no estimate"
        );
    });
    await test("AUTH-8 Authenticated Users attach grants all signed-in users, not anonymous; detach revokes", async () => {
        // AUTH-8 excludes Anonymous/Admin, not Authenticated Users. A private,
        // no-audience profile attached here intentionally reaches every login.
        const p = await profile("authenticated-only");
        const users = [
            await newUser("Existing signed-in A"),
            await newUser("Existing signed-in B")
        ];
        for (const user of users) await invoke(user, "authenticated-only", 403);
        await attach(p, AUTHENTICATED_ROLE);
        try {
            users.push(await newUser("Signed-in user created after attach"));
            const roles = (
                await call(
                    llm,
                    manager,
                    "GET",
                    `/access-profiles/${p.id}/roles`
                )
            ).data.items;
            check(
                roles.some(
                    (role: { id: string }) => role.id === AUTHENTICATED_ROLE
                ),
                "assert:Authenticated Users role attached"
            );
            for (const user of users) {
                const who = (await auth(user, "GET", "/users/whoami")).data;
                check(
                    who.roles.some(
                        (role: { id: string }) => role.id === AUTHENTICATED_ROLE
                    ),
                    "assert:signed-in default role comes from real Auth DB"
                );
                check(
                    (await models(user)).includes("authenticated-only"),
                    "assert:Authenticated Users profile discoverable"
                );
                await invoke(user, "authenticated-only");
                await awaitUsed(user, "authenticated-only", 10);
            }
            await invoke(undefined, "authenticated-only", 401);
        } finally {
            // Never leave the broad default-role grant active for other cases.
            await call(
                llm,
                manager,
                "DELETE",
                `/access-profiles/${p.id}/roles/${AUTHENTICATED_ROLE}`,
                undefined,
                204
            );
        }
        for (const user of users) await invoke(user, "authenticated-only", 403);
        await auth(ADMIN, "GET", `/permissions/${p.usePermissionId}`);
    });
}

let bootstrapped = false;
let cleanupOk = true;
try {
    await bootstrap();
    bootstrapped = true;
    await qualification();
} catch (error) {
    output({
        event: "harness-setup-failed",
        stage: setupStage,
        code: /^[A-Z0-9]{5}$/.test((error as any)?.code || "")
            ? (error as any).code
            : undefined,
        type: error instanceof Error ? error.name : "unknown",
        detail:
            error instanceof Error &&
            /^(assert:|HTTP |timeout:)/.test(error.message)
                ? error.message
                : "raw-error-suppressed"
    });
} finally {
    for (const server of servers.reverse()) {
        try {
            const closed = once(server, "close");
            server.close();
            server.closeAllConnections();
            await closed;
        } catch {
            cleanupOk = false;
        }
    }
    for (const pool of pools.reverse()) {
        try {
            await pool.end();
        } catch {
            cleanupOk = false;
        }
    }
    const evidence = {
        event: "harness-summary",
        runId: process.env.HARNESS_RUN_ID,
        timestamp: new Date().toISOString(),
        revision: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: fileURLToPath(root),
            encoding: "utf8"
        }).trim(),
        topology: {
            authApi: "real current source, skipAuth=false",
            opa: "real pinned engine + current policies",
            postgres: "real disposable tmpfs, auth and llm databases",
            facade: "real current source",
            litellmAndProvider:
                "FAKE deterministic HTTP usage fixture; no external provider calls",
            registry: "not exercised"
        },
        images: {
            postgres: process.env.HARNESS_POSTGRES_IMAGE_ID,
            opa: process.env.HARNESS_OPA_IMAGE_ID
        },
        passed: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        bootstrapped,
        localCleanupOk: cleanupOk,
        forwardedRequests: forwards.length,
        tests: results,
        gaps: [
            "No Gateway/browser/UI/DSH or deployed Helm verification",
            "No real LiteLLM/provider compatibility or billing claim",
            "No all-failure-races/ledger-outage/concurrency/DST qualification; existing focused suites cover these separately",
            "Short real-time 4s decision TTL and TTL=0 tested; production 30s value not waited in this harness"
        ]
    };
    output(evidence);
    if (process.env.HARNESS_EVIDENCE_FILE)
        await writeFile(
            process.env.HARNESS_EVIDENCE_FILE,
            JSON.stringify(evidence, null, 2) + "\n",
            { mode: 0o600 }
        );
    process.exitCode =
        !bootstrapped || !cleanupOk || results.some((r) => !r.ok) ? 1 : 0;
}
