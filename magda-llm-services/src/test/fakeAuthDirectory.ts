import http from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import {
    ADMIN_USERS_ROLE_ID,
    ANONYMOUS_USERS_ROLE_ID,
    AUTHENTICATED_USERS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants.js";

/**
 * An in-memory stand-in for the Authorization API endpoints the profile API
 * uses, following the real API's semantics where they matter:
 * - `POST /permissions` takes an optional `id` and answers 409 when it's in use;
 * - `DELETE /permissions/:id` answers 400 for a missing permission, refuses a
 *   held one without `removeFromRoles=true`, and removes its links with it;
 * - attaching an existing link answers `{ result: false }`;
 * - detaching deletes the permission when it leaves its last role, unless
 *   `deletePermission=false`;
 * - deleting a role also deletes the permissions only that role held;
 * - missing roles or permissions on role/permission routes answer 400.
 *
 * Management decisions (`llm/access/*`, full) come from `allowedOperations`
 * per user. Every request records the session's user, so tests can check that
 * Auth API changes use LLM Services' internal session (AUTH-12).
 */
export async function startFakeAuthDirectory() {
    const permissions = new Map<string, any>();
    const roles = new Map<string, any>();
    const links = new Set<string>();
    const orgUnits = new Set<string>();
    const allowedOperations = new Map<string, Set<string>>();
    const calls: Array<{ method: string; path: string; userId: string }> = [];
    /** `"<METHOD> <path prefix>"` → status to answer instead, once. */
    const failures = new Map<string, number>();
    /**
     * `"<METHOD> <path prefix>"` → status to answer once, **after** applying
     * the change: a lost response, as after a timeout.
     */
    const failuresAfterApply = new Map<string, number>();

    for (const [id, name] of [
        [ANONYMOUS_USERS_ROLE_ID, "Anonymous Users"],
        [AUTHENTICATED_USERS_ROLE_ID, "Authenticated Users"],
        [ADMIN_USERS_ROLE_ID, "Admin Users"]
    ]) {
        roles.set(id, { id, name, description: `${name} (stock)` });
    }

    const key = (roleId: string, permissionId: string) =>
        `${roleId}|${permissionId}`;
    const holders = (permissionId: string) =>
        [...links]
            .filter((link) => link.endsWith(`|${permissionId}`))
            .map((link) => link.split("|")[0]);

    function deletePermission(permissionId: string) {
        permissions.delete(permissionId);
        for (const roleId of holders(permissionId)) {
            links.delete(key(roleId, permissionId));
        }
    }

    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        req.on("end", () => {
            const url = new URL(req.url || "/", "http://fake");
            const path = url.pathname;
            const method = req.method || "GET";
            const token = req.headers["x-magda-session"];
            const userId =
                typeof token === "string"
                    ? (jwt.decode(token) as any)?.userId ?? ""
                    : "";
            calls.push({ method, path: path + url.search, userId });
            let lostResponse: number | undefined;
            for (const [prefix, status] of failuresAfterApply) {
                if (`${method} ${path}`.startsWith(prefix)) {
                    failuresAfterApply.delete(prefix);
                    lostResponse = status;
                    break;
                }
            }
            const send = (status: number, body: unknown) => {
                if (lostResponse !== undefined) {
                    status = lostResponse;
                    body = { error: "injected failure after the change" };
                }
                res.writeHead(status, { "content-type": "application/json" });
                res.end(JSON.stringify(body));
            };
            for (const [prefix, status] of failures) {
                if (`${method} ${path}`.startsWith(prefix)) {
                    failures.delete(prefix);
                    send(status, { error: "injected failure" });
                    return;
                }
            }
            const body = chunks.length
                ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
                : undefined;
            let m: RegExpExecArray | null;

            if ((m = /^\/v0\/opa\/decision\/(.+)$/.exec(path))) {
                const allowed = allowedOperations.get(userId)?.has(m[1]);
                send(200, { hasResidualRules: false, result: !!allowed });
                return;
            }
            if (path === "/v0/public/permissions" && method === "POST") {
                const id = body?.id ?? randomUUID();
                if (permissions.has(id)) {
                    send(409, { error: "exists" });
                    return;
                }
                const permission = {
                    id,
                    name: body.name,
                    description: body.description ?? "",
                    resource_uri: body.resourceUri,
                    user_ownership_constraint: !!body.user_ownership_constraint,
                    org_unit_ownership_constraint: !!body.org_unit_ownership_constraint,
                    pre_authorised_constraint: !!body.pre_authorised_constraint,
                    allow_exemption: !!body.allow_exemption,
                    operations: (
                        body.operationUris ?? []
                    ).map((uri: string) => ({ uri })),
                    create_by: userId
                };
                permissions.set(id, permission);
                send(200, permission);
                return;
            }
            if (
                (m = /^\/v0\/public\/permissions\/([^/]+)\/roles$/.exec(path))
            ) {
                if (!permissions.has(m[1])) {
                    send(400, { error: "missing permission" });
                    return;
                }
                const offset = Number(url.searchParams.get("offset") || 0);
                const limit = Number(url.searchParams.get("limit") || 100);
                send(
                    200,
                    holders(m[1])
                        .map((roleId) => roles.get(roleId))
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .slice(offset, offset + limit)
                );
                return;
            }
            if ((m = /^\/v0\/public\/permissions\/([^/]+)$/.exec(path))) {
                const permission = permissions.get(m[1]);
                if (method === "GET") {
                    if (permission) send(200, permission);
                    else send(404, { error: "not found" });
                    return;
                }
                if (method === "DELETE") {
                    if (!permission) {
                        send(400, { error: "missing permission" });
                        return;
                    }
                    if (
                        url.searchParams.get("removeFromRoles") !== "true" &&
                        holders(m[1]).length
                    ) {
                        send(400, { error: "held by roles" });
                        return;
                    }
                    deletePermission(m[1]);
                    send(200, { result: true });
                    return;
                }
            }
            if (path === "/v0/public/roles" && method === "GET") {
                const keyword = (
                    url.searchParams.get("keyword") || ""
                ).toLowerCase();
                const offset = Number(url.searchParams.get("offset") || 0);
                const limit = Number(url.searchParams.get("limit") || 100);
                send(
                    200,
                    [...roles.values()]
                        .filter(
                            (role) =>
                                !keyword ||
                                role.name.toLowerCase().includes(keyword) ||
                                role.description.toLowerCase().includes(keyword)
                        )
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .slice(offset, offset + limit)
                );
                return;
            }
            if (
                (m = /^\/v0\/public\/roles\/([^/]+)\/permissions\/([^/]+)$/.exec(
                    path
                ))
            ) {
                const [, roleId, permissionId] = m;
                if (!roles.has(roleId) || !permissions.has(permissionId)) {
                    send(400, { error: "missing role or permission" });
                    return;
                }
                if (method === "POST") {
                    if (links.has(key(roleId, permissionId))) {
                        send(200, { result: false });
                        return;
                    }
                    links.add(key(roleId, permissionId));
                    send(200, { result: true });
                    return;
                }
                if (method === "DELETE") {
                    links.delete(key(roleId, permissionId));
                    if (
                        url.searchParams.get("deletePermission") !== "false" &&
                        !holders(permissionId).length
                    ) {
                        permissions.delete(permissionId);
                    }
                    send(200, { result: true });
                    return;
                }
            }
            if ((m = /^\/v0\/public\/roles\/([^/]+)$/.exec(path))) {
                const role = roles.get(m[1]);
                if (method === "GET") {
                    if (role) send(200, role);
                    else send(404, { error: "not found" });
                    return;
                }
            }
            if ((m = /^\/v0\/public\/orgunits\/([^/]+)$/.exec(path))) {
                if (orgUnits.has(m[1])) send(200, { id: m[1], name: "unit" });
                else send(404, { error: "not found" });
                return;
            }
            send(404, { error: `no fake route for ${method} ${path}` });
        });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;

    return {
        url: `http://127.0.0.1:${port}/v0`,
        permissions,
        roles,
        links,
        orgUnits,
        allowedOperations,
        calls,
        failures,
        failuresAfterApply,
        holders,
        addRole(name: string, id: string = randomUUID()) {
            roles.set(id, { id, name, description: `${name} role` });
            return id;
        },
        /** As `deleteRole` does: also deletes permissions only this role held. */
        deleteRole(roleId: string) {
            roles.delete(roleId);
            for (const link of [...links]) {
                if (!link.startsWith(`${roleId}|`)) continue;
                links.delete(link);
                const permissionId = link.split("|")[1];
                if (!holders(permissionId).length) {
                    permissions.delete(permissionId);
                }
            }
        },
        async close() {
            server.close();
            server.closeAllConnections();
            await once(server, "close");
        }
    };
}

export type FakeAuthDirectory = Awaited<
    ReturnType<typeof startFakeAuthDirectory>
>;
