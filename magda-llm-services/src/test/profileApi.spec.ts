import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import pg from "pg";
import {
    ADMIN_USERS_ROLE_ID,
    ANONYMOUS_USERS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants.js";
import createApp from "../createApp.js";
import AuthApiClient from "../authApi/AuthApiClient.js";
import ProfileRepository from "../profiles/ProfileRepository.js";
import ProfileService from "../profiles/ProfileService.js";
import { parseIfMatch } from "../profiles/createProfileRouter.js";
import { createTestDatabase } from "./testDb.js";
import {
    FakeAuthDirectory,
    startFakeAuthDirectory
} from "./fakeAuthDirectory.js";

// #3838 #3940: the profile management API, lifecycle and reconcile, against
// the real LLM Services database and an in-memory Auth API stand-in
// (fakeAuthDirectory.ts) that follows the real API's semantics.

const jwtSecret = "llm-services-profile-api-secret";
const INTERNAL_ADMIN = "00000000-0000-4000-8000-000000000000";
const MANAGER = "00000000-0000-4000-8000-0000000000a1";
const UPDATER = "00000000-0000-4000-8000-0000000000a2";
const READER = "00000000-0000-4000-8000-0000000000a3";
const OUTSIDER = "00000000-0000-4000-8000-0000000000a4";
const ORG_UNIT = "00000000-0000-4000-8000-00000000f000";
const ALLOWED = new Set(["model-a", "model-b", "unserved-model"]);

const ALL_OPERATIONS = [
    "llm/access/create",
    "llm/access/read",
    "llm/access/update",
    "llm/access/delete"
];

const PROFILE = {
    name: "Finance analysts",
    description: "For the finance team",
    allowedModels: ["model-a"],
    enabled: true,
    orgUnitId: null,
    constraintExemption: false,
    allowedDailyTokens: 100000,
    allowedWeeklyTokens: null,
    allowedMonthlyTokens: null
};

function sessionOf(userId: string) {
    return jwt.sign({ userId }, jwtSecret, { algorithm: "HS256" });
}

describe("profile management API (integration, #3838 #3940)", function (this: Mocha.Suite) {
    this.timeout(30000);
    let pool: pg.Pool;
    let drop: () => Promise<void>;
    let auth: FakeAuthDirectory;
    let service: ProfileService;
    let server: http.Server;
    let baseUrl: string;
    let served: Set<string> | null;
    const { log, error } = console;

    before(async () => {
        console.log = () => undefined;
        ({ pool, drop } = await createTestDatabase("profile_api"));
    });

    after(async () => {
        console.log = log;
        await drop?.();
    });

    beforeEach(async () => {
        await pool.query("TRUNCATE access_profiles");
        auth = await startFakeAuthDirectory();
        auth.allowedOperations.set(MANAGER, new Set(ALL_OPERATIONS));
        auth.allowedOperations.set(
            UPDATER,
            new Set(["llm/access/read", "llm/access/update"])
        );
        auth.allowedOperations.set(READER, new Set(["llm/access/read"]));
        auth.orgUnits.add(ORG_UNIT);
        served = new Set(["model-a", "model-b"]);
        service = new ProfileService({
            repository: new ProfileRepository(pool),
            authApi: new AuthApiClient({
                authApiUrl: auth.url,
                jwtSecret,
                adminUserId: INTERNAL_ADMIN
            })
        });
        const app = createApp({
            jwtSecret,
            authApiUrl: auth.url,
            liteLlmUrl: new URL("http://127.0.0.1:1"),
            liteLlmKey: "master-key",
            allowedModels: ALLOWED,
            pool,
            profiles: service,
            servedModels: { served: async () => served } as any
        });
        server = http.createServer(app);
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        baseUrl = `http://127.0.0.1:${
            (server.address() as AddressInfo).port
        }/v0`;
    });

    afterEach(async () => {
        console.error = error;
        server.close();
        server.closeAllConnections();
        await once(server, "close");
        await auth.close();
    });

    async function call(
        method: string,
        path: string,
        options: {
            user?: string | null;
            body?: unknown;
            headers?: Record<string, string>;
        } = {}
    ) {
        const user = options.user === undefined ? MANAGER : options.user;
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                ...(user ? { "X-Magda-Session": sessionOf(user) } : {}),
                ...(options.body !== undefined
                    ? { "content-type": "application/json" }
                    : {}),
                ...options.headers
            },
            body:
                options.body === undefined
                    ? undefined
                    : JSON.stringify(options.body)
        });
        const text = await response.text();
        return {
            status: response.status,
            headers: response.headers,
            body: text ? JSON.parse(text) : undefined
        };
    }

    async function createProfile(fields: Record<string, unknown> = {}) {
        const result = await call("POST", "/access-profiles", {
            body: { ...PROFILE, ...fields }
        });
        assert.equal(result.status, 201, JSON.stringify(result.body));
        return result.body;
    }

    /** Auth API calls that change something, apart from decisions and reads. */
    function authApiWrites() {
        return auth.calls.filter(
            (c) => c.method !== "GET" && !c.path.startsWith("/v0/opa/")
        );
    }

    function quietErrors() {
        console.error = () => undefined;
    }

    /** A service whose database transactions fail at COMMIT. */
    function serviceWithFailingCommit() {
        const failing = ({
            query: pool.query.bind(pool),
            connect: async () => {
                const client = await pool.connect();
                return new Proxy(client, {
                    get(target, property) {
                        if (property === "query") {
                            return (text: any, ...rest: any[]) =>
                                text === "COMMIT"
                                    ? Promise.reject(new Error("commit failed"))
                                    : (target.query as any)(text, ...rest);
                        }
                        const value = (target as any)[property];
                        return typeof value === "function"
                            ? value.bind(target)
                            : value;
                    }
                });
            }
        } as unknown) as pg.Pool;
        return new ProfileService({
            repository: new ProfileRepository(failing),
            authApi: new AuthApiClient({
                authApiUrl: auth.url,
                jwtSecret,
                adminUserId: INTERNAL_ADMIN
            })
        });
    }

    async function profileRows() {
        return (await pool.query("SELECT id FROM access_profiles")).rows;
    }

    describe("lifecycle (TEST-3)", () => {
        it("create provisions exactly one correctly flagged permission, with the internal session", async () => {
            const profile = await createProfile();
            assert.equal(profile.revision, 1);
            assert.equal(profile.createdBy, MANAGER);
            assert.equal(profile.state, undefined);
            assert.equal(auth.permissions.size, 1);
            const permission = auth.permissions.get(profile.usePermissionId)!;
            assert.ok(permission, "the permission has the recorded ID");
            assert.equal(permission.resource_uri, "llm/access");
            assert.deepEqual(permission.operations, [
                { uri: "llm/access/invoke" }
            ]);
            assert.equal(permission.pre_authorised_constraint, true);
            assert.equal(permission.user_ownership_constraint, false);
            assert.equal(permission.org_unit_ownership_constraint, false);
            assert.equal(permission.allow_exemption, false);
            assert.match(permission.name, /Finance analysts/);
            assert.ok(permission.name.includes(profile.id));
            // AUTH-12: every Auth API change uses the internal session
            assert.ok(authApiWrites().length > 0);
            for (const write of authApiWrites()) {
                assert.equal(write.userId, INTERNAL_ADMIN, write.path);
            }
            // the decision used the caller's own session
            assert.ok(
                auth.calls.some(
                    (c) =>
                        c.path.startsWith(
                            "/v0/opa/decision/llm/access/create"
                        ) && c.userId === MANAGER
                )
            );
        });

        it("rolls back the row when the permission can't be created", async () => {
            quietErrors();
            auth.failures.set("POST /v0/public/permissions", 503);
            const failed = await call("POST", "/access-profiles", {
                body: PROFILE
            });
            assert.equal(failed.status, 503);
            assert.deepEqual(await profileRows(), []);
            assert.equal(auth.permissions.size, 0);
        });

        it("deletes the permission when its creation's outcome was lost (a timeout)", async () => {
            quietErrors();
            // the permission is created, but the response is lost
            auth.failuresAfterApply.set("POST /v0/public/permissions", 503);
            const failed = await call("POST", "/access-profiles", {
                body: PROFILE
            });
            assert.equal(failed.status, 503);
            assert.deepEqual(await profileRows(), []);
            assert.equal(auth.permissions.size, 0, "the compensating delete");
            assert.ok(
                auth.calls.some(
                    (c) =>
                        c.method === "DELETE" &&
                        c.path.includes("?removeFromRoles=true") &&
                        c.userId === INTERNAL_ADMIN
                )
            );
        });

        it("deletes the permission when the commit fails after it was created", async () => {
            const logged: string[] = [];
            console.error = (line: string) => logged.push(String(line));
            const failing = serviceWithFailingCommit();
            await assert.rejects(
                failing.create(PROFILE, MANAGER),
                /commit failed/
            );
            assert.deepEqual(await profileRows(), []);
            assert.equal(auth.permissions.size, 0);
            assert.ok(
                !logged.some((l) => l.includes("cleanup-failed")),
                "the cleanup succeeded"
            );
        });

        it("reports the error, without retrying, when the compensating delete fails too", async () => {
            const logged: string[] = [];
            console.error = (line: string) => logged.push(String(line));
            auth.failuresAfterApply.set("POST /v0/public/permissions", 503);
            auth.failures.set("DELETE /v0/public/permissions/", 503);
            const failed = await call("POST", "/access-profiles", {
                body: PROFILE
            });
            assert.equal(failed.status, 503);
            assert.deepEqual(await profileRows(), []);
            // left behind: held by no role, referenced by no profile
            assert.equal(auth.permissions.size, 1);
            const [leftover] = [...auth.permissions.keys()];
            assert.deepEqual(auth.holders(leftover), []);
            const cleanup = logged
                .map((l) => {
                    try {
                        return JSON.parse(l);
                    } catch {
                        return {};
                    }
                })
                .find(
                    (e) => e.event === "llm-profile-permission-cleanup-failed"
                );
            assert.equal(cleanup?.permissionId, leftover);
            assert.equal(
                auth.calls.filter((c) => c.method === "DELETE").length,
                1,
                "one compensating attempt"
            );
        });

        it("never deletes a permission whose ID turned out to be in use", async () => {
            quietErrors();
            const failing = new ProfileService({
                repository: new ProfileRepository(pool),
                authApi: Object.assign(
                    new AuthApiClient({
                        authApiUrl: auth.url,
                        jwtSecret,
                        adminUserId: INTERNAL_ADMIN
                    }),
                    { createProfilePermission: async () => "exists" as const }
                )
            });
            await assert.rejects(failing.create(PROFILE, MANAGER), /in use/);
            assert.deepEqual(await profileRows(), []);
            assert.ok(!auth.calls.some((c) => c.method === "DELETE"));
        });

        it("a failed delete keeps the profile and its permission unchanged", async () => {
            quietErrors();
            const profile = await createProfile();
            const role = auth.addRole("Analysts");
            await call("PUT", `/access-profiles/${profile.id}/roles/${role}`);
            auth.failures.set(
                `DELETE /v0/public/permissions/${profile.usePermissionId}`,
                503
            );
            const failed = await call(
                "DELETE",
                `/access-profiles/${profile.id}`
            );
            assert.equal(failed.status, 503);
            const read = await call("GET", `/access-profiles/${profile.id}`);
            assert.equal(read.status, 200);
            assert.equal(read.body.enabled, true);
            assert.deepEqual(auth.holders(profile.usePermissionId), [role]);
            // a retry succeeds
            assert.equal(
                (await call("DELETE", `/access-profiles/${profile.id}`)).status,
                204
            );
            assert.equal(auth.permissions.size, 0);
        });

        it("a delete whose commit failed after the permission went is finished by a retry", async () => {
            quietErrors();
            const profile = await createProfile();
            await assert.rejects(
                serviceWithFailingCommit().delete(profile.id),
                /commit failed/
            );
            assert.equal(auth.permissions.size, 0, "the permission went");
            const read = await call("GET", `/access-profiles/${profile.id}`);
            assert.equal(read.status, 200, "the row stayed");
            assert.deepEqual(
                (await call("GET", `/access-profiles/${profile.id}/roles`)).body
                    .items,
                []
            );
            assert.equal(
                (await call("DELETE", `/access-profiles/${profile.id}`)).status,
                204
            );
            assert.deepEqual(await profileRows(), []);
        });

        it("delete removes the permission from every role and never deletes a role", async () => {
            const profile = await createProfile();
            const roleA = auth.addRole("Analysts");
            const roleB = auth.addRole("Auditors");
            for (const role of [roleA, roleB]) {
                assert.equal(
                    (
                        await call(
                            "PUT",
                            `/access-profiles/${profile.id}/roles/${role}`
                        )
                    ).status,
                    204
                );
            }
            assert.equal(auth.holders(profile.usePermissionId).length, 2);
            const deleted = await call(
                "DELETE",
                `/access-profiles/${profile.id}`
            );
            assert.equal(deleted.status, 204);
            assert.equal(auth.permissions.size, 0);
            assert.equal(auth.links.size, 0);
            assert.ok(auth.roles.has(roleA) && auth.roles.has(roleB));
            // a repeat is a 404, not an error
            assert.equal(
                (await call("DELETE", `/access-profiles/${profile.id}`)).status,
                404
            );
        });

        it("re-creates the permission, with the same ID, when a role is attached after its only holder role was deleted", async () => {
            const log: string[] = [];
            console.log = (line: string) => log.push(String(line));
            const profile = await createProfile();
            const temporary = auth.addRole("Temporary");
            await call(
                "PUT",
                `/access-profiles/${profile.id}/roles/${temporary}`
            );
            auth.deleteRole(temporary);
            assert.equal(auth.permissions.size, 0);
            assert.deepEqual(
                (await call("GET", `/access-profiles/${profile.id}/roles`)).body
                    .items,
                []
            );

            const role = auth.addRole("Analysts");
            const attached = await call(
                "PUT",
                `/access-profiles/${profile.id}/roles/${role}`
            );
            assert.equal(attached.status, 204);
            assert.ok(auth.permissions.has(profile.usePermissionId));
            assert.deepEqual(auth.holders(profile.usePermissionId), [role]);
            const read = await call("GET", `/access-profiles/${profile.id}`);
            assert.equal(read.body.revision, profile.revision);
            assert.ok(
                log.some((l) => l.includes("llm-profile-permission-recreated"))
            );
            console.log = () => undefined;
        });

        it("never adopts a permission with the recorded ID that isn't a profile permission", async () => {
            quietErrors();
            const profile = await createProfile();
            auth.permissions.set(profile.usePermissionId, {
                ...auth.permissions.get(profile.usePermissionId),
                pre_authorised_constraint: false,
                org_unit_ownership_constraint: true
            });
            const role = auth.addRole("Analysts");
            const result = await call(
                "PUT",
                `/access-profiles/${profile.id}/roles/${role}`
            );
            assert.equal(result.status, 500);
            assert.deepEqual(auth.holders(profile.usePermissionId), []);
        });

        it("detaching the last role keeps the permission", async () => {
            const profile = await createProfile();
            const role = auth.addRole("Analysts");
            await call("PUT", `/access-profiles/${profile.id}/roles/${role}`);
            const detached = await call(
                "DELETE",
                `/access-profiles/${profile.id}/roles/${role}`
            );
            assert.equal(detached.status, 204);
            assert.ok(auth.permissions.has(profile.usePermissionId));
            assert.deepEqual(
                (await call("GET", `/access-profiles/${profile.id}/roles`)).body
                    .items,
                []
            );
            assert.ok(
                auth.calls.some(
                    (c) =>
                        c.method === "DELETE" &&
                        c.path.endsWith("?deletePermission=false")
                )
            );
        });

        it("updates with If-Match, and answers a stale revision with 409", async () => {
            const profile = await createProfile();
            const missing = await call(
                "PUT",
                `/access-profiles/${profile.id}`,
                { body: { ...PROFILE, name: "Renamed" } }
            );
            assert.equal(missing.status, 428);
            const updated = await call(
                "PUT",
                `/access-profiles/${profile.id}`,
                {
                    body: { ...PROFILE, name: "Renamed", orgUnitId: ORG_UNIT },
                    headers: { "If-Match": `"${profile.revision}"` }
                }
            );
            assert.equal(updated.status, 200, JSON.stringify(updated.body));
            assert.equal(updated.body.name, "Renamed");
            assert.equal(updated.body.orgUnitId, ORG_UNIT);
            assert.equal(updated.body.revision, profile.revision + 1);
            assert.equal(updated.body.updatedBy, MANAGER);
            assert.equal(
                updated.headers.get("etag"),
                `"${profile.revision + 1}"`
            );
            const stale = await call("PUT", `/access-profiles/${profile.id}`, {
                body: { ...PROFILE, name: "Again" },
                headers: { "If-Match": `"${profile.revision}"` }
            });
            assert.equal(stale.status, 409);
            assert.equal(stale.body.error.code, "llm_profile_stale_revision");
            assert.equal(
                stale.body.error.currentRevision,
                profile.revision + 1
            );
        });
    });

    describe("role grants (TEST-4)", () => {
        it("attach and detach need only llm/access/update, with no authObject permission", async () => {
            const profile = await createProfile();
            const role = auth.addRole("Analysts");
            const attached = await call(
                "PUT",
                `/access-profiles/${profile.id}/roles/${role}`,
                { user: UPDATER }
            );
            assert.equal(attached.status, 204);
            // the role holds exactly the profile's own permission
            assert.deepEqual(auth.holders(profile.usePermissionId), [role]);
            assert.deepEqual(
                (
                    await call("GET", `/access-profiles/${profile.id}/roles`, {
                        user: READER
                    })
                ).body.items,
                [{ id: role, name: "Analysts", description: "Analysts role" }]
            );
            // attaching again is fine
            assert.equal(
                (
                    await call(
                        "PUT",
                        `/access-profiles/${profile.id}/roles/${role}`,
                        { user: UPDATER }
                    )
                ).status,
                204
            );
            assert.equal(
                (
                    await call(
                        "DELETE",
                        `/access-profiles/${profile.id}/roles/${role}`,
                        { user: UPDATER }
                    )
                ).status,
                204
            );
            // the caller's session was only used for llm/access decisions
            for (const c of auth.calls.filter((c) => c.userId === UPDATER)) {
                assert.match(c.path, /^\/v0\/opa\/decision\/llm\/access\//);
            }
        });

        it("denies callers without the operation, before any Auth API change", async () => {
            const profile = await createProfile();
            const role = auth.addRole("Analysts");
            const before = authApiWrites().length;
            for (const [user, method, path] of [
                [READER, "PUT", `/access-profiles/${profile.id}/roles/${role}`],
                [OUTSIDER, "GET", "/access-profiles"],
                [UPDATER, "DELETE", `/access-profiles/${profile.id}`],
                [UPDATER, "POST", "/access-profiles"]
            ] as const) {
                const result = await call(method, path, {
                    user,
                    body: method === "POST" ? PROFILE : undefined
                });
                assert.equal(result.status, 403, `${user} ${method} ${path}`);
                assert.equal(result.body.error.code, "llm_access_denied");
            }
            assert.equal(authApiWrites().length, before);
            assert.equal(
                (await call("GET", "/access-profiles", { user: null })).status,
                401
            );
        });

        it("rejects Anonymous Users and Admin Users, and lists only attachable candidates", async () => {
            const profile = await createProfile();
            for (const role of [ANONYMOUS_USERS_ROLE_ID, ADMIN_USERS_ROLE_ID]) {
                const result = await call(
                    "PUT",
                    `/access-profiles/${profile.id}/roles/${role}`
                );
                assert.equal(result.status, 422);
            }
            const missing = await call(
                "PUT",
                `/access-profiles/${profile.id}/roles/00000000-0000-4000-8000-00000000dead`
            );
            assert.equal(missing.status, 404);

            const analysts = auth.addRole("Analysts");
            const auditors = auth.addRole("Auditors");
            await call(
                "PUT",
                `/access-profiles/${profile.id}/roles/${analysts}`
            );
            const all = await call(
                "GET",
                `/access-profiles/${profile.id}/role-candidates`
            );
            assert.equal(all.status, 200);
            const names = all.body.items.map((r: any) => r.name);
            assert.ok(names.includes("Auditors"));
            assert.ok(names.includes("Authenticated Users"));
            assert.ok(!names.includes("Analysts"), "already attached");
            assert.ok(!names.includes("Anonymous Users"));
            assert.ok(!names.includes("Admin Users"));
            assert.deepEqual(Object.keys(all.body.items[0]).sort(), [
                "description",
                "id",
                "name"
            ]);
            const searched = await call(
                "GET",
                `/access-profiles/${profile.id}/role-candidates?q=audit`
            );
            assert.deepEqual(
                searched.body.items.map((r: any) => r.id),
                [auditors]
            );
            // role candidates need llm/access/update
            assert.equal(
                (
                    await call(
                        "GET",
                        `/access-profiles/${profile.id}/role-candidates`,
                        { user: READER }
                    )
                ).status,
                403
            );
        });
    });

    describe("API behaviour", () => {
        it("lists, searches and reads profiles, privately", async () => {
            const a = await createProfile({ name: "Alpha" });
            await createProfile({ name: "Beta" });
            const list = await call("GET", "/access-profiles?q=alp", {
                user: READER
            });
            assert.equal(list.status, 200);
            assert.equal(
                list.headers.get("cache-control"),
                "private, no-store"
            );
            assert.equal(list.body.total, 1);
            assert.equal(list.body.items[0].id, a.id);
            const read = await call("GET", `/access-profiles/${a.id}`, {
                user: READER
            });
            assert.equal(read.headers.get("etag"), `"${a.revision}"`);
            assert.equal(
                (await call("GET", "/access-profiles/not-a-uuid")).status,
                404
            );
            assert.equal(
                (
                    await call(
                        "GET",
                        "/access-profiles/00000000-0000-4000-8000-00000000beef"
                    )
                ).status,
                404
            );
        });

        it("accepts no client-supplied permission ID or internal state", async () => {
            for (const extra of [
                { usePermissionId: "00000000-0000-4000-8000-00000000cafe" },
                { state: "ready" },
                { revision: 7 },
                { id: "00000000-0000-4000-8000-00000000cafe" }
            ]) {
                const result = await call("POST", "/access-profiles", {
                    body: { ...PROFILE, ...extra }
                });
                assert.equal(result.status, 422, JSON.stringify(extra));
                assert.equal(result.body.error.code, "llm_profile_invalid");
            }
            assert.equal(auth.permissions.size, 0);
        });

        it("validates aliases against the allowlist and the served models, and org units through the Auth API", async () => {
            for (const allowedModels of [["not-allowed"], ["unserved-model"]]) {
                assert.equal(
                    (
                        await call("POST", "/access-profiles", {
                            body: { ...PROFILE, allowedModels }
                        })
                    ).status,
                    422,
                    allowedModels[0]
                );
            }
            assert.equal(
                (
                    await call("POST", "/access-profiles", {
                        body: { ...PROFILE, allowedModels: ["*"] }
                    })
                ).status,
                201
            );
            // with the backend list unavailable, the allowlist alone decides
            served = null;
            assert.equal(
                (
                    await call("POST", "/access-profiles", {
                        body: { ...PROFILE, allowedModels: ["unserved-model"] }
                    })
                ).status,
                201
            );
            const badUnit = await call("POST", "/access-profiles", {
                body: {
                    ...PROFILE,
                    orgUnitId: "00000000-0000-4000-8000-00000000eeee"
                }
            });
            assert.equal(badUnit.status, 422);
            assert.match(badUnit.body.error.message, /orgUnitId/);
        });

        it("lists the available models for the profile form (API-6)", async () => {
            const result = await call("GET", "/available-models", {
                user: READER
            });
            assert.deepEqual(result.body, {
                items: ["model-a", "model-b"],
                servedListAvailable: true
            });
            served = null;
            assert.deepEqual(
                (await call("GET", "/available-models", { user: READER })).body,
                { items: [...ALLOWED], servedListAvailable: false }
            );
        });

        it("answers 503 when the Auth API is down, and changes nothing", async () => {
            quietErrors();
            const profile = await createProfile();
            const role = auth.addRole("Analysts");
            auth.failures.set(`GET /v0/public/roles/${role}`, 503);
            const result = await call(
                "PUT",
                `/access-profiles/${profile.id}/roles/${role}`
            );
            assert.equal(result.status, 503);
            assert.deepEqual(auth.holders(profile.usePermissionId), []);
        });
    });

    it("parses If-Match", () => {
        assert.equal(parseIfMatch('"3"'), 3);
        assert.equal(parseIfMatch("3"), 3);
        assert.equal(parseIfMatch('W/"12"'), 12);
        for (const value of [undefined, "", "abc", '"0"', '"-1"', "*"]) {
            assert.equal(parseIfMatch(value), undefined, String(value));
        }
    });
});
