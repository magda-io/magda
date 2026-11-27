import http from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import jwt from "jsonwebtoken";

export const ADMIN_ROLE = { id: "00000000-0000-0003-0000-000000000000" };

export interface FakeAuthUser {
    roles?: Array<{ id: string }>;
    /**
     * The Auth API's answer to the `llm/access/invoke` partial decision: a
     * decision body (e.g. recorded from OPA), or `"unavailable"`.
     */
    decision?: any;
    /** whoami answers this status instead of the user. */
    whoamiStatus?: number;
    /**
     * Full decisions for other operations, by operation URI (e.g.
     * `llm/usage/read`): `true`, `false` or `"unavailable"`. An operation
     * not listed is denied.
     */
    operations?: Record<string, boolean | "unavailable">;
    /** Name and email, returned by the users endpoint. */
    displayName?: string;
    email?: string;
    /** May this user read other users (`authObject/user/read`)? */
    canReadUsers?: boolean;
    /** The users endpoint answers this status to this caller. */
    usersStatus?: number;
}

/**
 * A stand-in for the Authorization API's `whoami` and decision endpoints.
 * Users are looked up by the `userId` of the `X-Magda-Session` JWT.
 */
export async function startFakeAuthApi() {
    const users = new Map<string, FakeAuthUser>();
    const calls = {
        whoami: [] as string[],
        decisions: [] as Array<{ userId: string; path: string; body: any }>,
        users: [] as Array<{ userId: string; query: string }>
    };
    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        req.on("end", () => {
            const token = req.headers["x-magda-session"];
            const payload =
                typeof token === "string" ? (jwt.decode(token) as any) : null;
            const userId: string = payload?.userId ?? "";
            const user = users.get(userId);
            const send = (status: number, body: unknown) => {
                res.writeHead(status, { "content-type": "application/json" });
                res.end(JSON.stringify(body));
            };
            if (req.url === "/v0/public/users/whoami") {
                calls.whoami.push(userId);
                if (user?.whoamiStatus) {
                    send(user.whoamiStatus, {});
                } else if (!user) {
                    send(401, {});
                } else {
                    send(200, { id: userId, roles: user.roles ?? [] });
                }
                return;
            }
            if (req.url?.startsWith("/v0/public/users?")) {
                const query = new URL(req.url, "http://fake").searchParams;
                calls.users.push({ userId, query: query.toString() });
                if (user?.usersStatus) {
                    send(user.usersStatus, {});
                    return;
                }
                if (!user?.canReadUsers) {
                    // the Auth API filters by the caller's decision: nobody
                    send(200, []);
                    return;
                }
                const id = query.get("id");
                const keyword = query.get("keyword")?.toLowerCase();
                const found = [...users.entries()]
                    .filter(
                        ([candidateId, candidate]) =>
                            candidate.displayName &&
                            (!id || candidateId === id) &&
                            (!keyword ||
                                candidate.displayName
                                    .toLowerCase()
                                    .includes(keyword) ||
                                candidate.email
                                    ?.toLowerCase()
                                    .includes(keyword))
                    )
                    .map(([candidateId, candidate]) => ({
                        id: candidateId,
                        displayName: candidate.displayName,
                        email: candidate.email
                    }));
                send(200, found);
                return;
            }
            if (req.url?.startsWith("/v0/opa/decision/")) {
                const raw = Buffer.concat(chunks).toString("utf8");
                calls.decisions.push({
                    userId,
                    path: req.url,
                    body: raw ? JSON.parse(raw) : undefined
                });
                const operation = req.url
                    .slice("/v0/opa/decision/".length)
                    .split("?")[0];
                if (operation !== "llm/access/invoke") {
                    const allowed = user?.operations?.[operation];
                    if (allowed === "unavailable") {
                        send(500, { error: "unavailable" });
                    } else {
                        send(200, {
                            hasResidualRules: false,
                            result: allowed === true
                        });
                    }
                    return;
                }
                if (!user || user.decision === "unavailable") {
                    send(500, { error: "unavailable" });
                } else {
                    send(200, user.decision);
                }
                return;
            }
            send(404, {});
        });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}/v0`,
        users,
        calls,
        async close() {
            server.close();
            await once(server, "close");
        }
    };
}

export type FakeAuthApi = Awaited<ReturnType<typeof startFakeAuthApi>>;
