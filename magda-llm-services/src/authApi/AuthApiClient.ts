// LLM Services' own calls to the Authorization API (#3838 AUTH-12).
//
// Callers are authorised first with `llm/access/*` decisions made with
// **their** session. Every Auth API change that follows is made here, with
// LLM Services' internal session: an internal JWT for
// `global.defaultAdminUserId`, as other services do. Callers never need any
// `authObject/*` permission.

import buildJwt from "magda-typescript-common/src/session/buildJwt.js";
import { AuthApiUnavailableError } from "../access/CallerAccess.js";

export const PROFILE_PERMISSION_RESOURCE = "llm/access";
export const PROFILE_PERMISSION_OPERATION = "llm/access/invoke";

/** A role, as LLM Services returns it: ID, name and description only (API-4). */
export interface RoleSummary {
    id: string;
    name: string;
    description: string;
}

export interface PermissionRecord {
    id: string;
    name: string;
    description?: string;
    resource_uri?: string;
    user_ownership_constraint: boolean;
    org_unit_ownership_constraint: boolean;
    pre_authorised_constraint: boolean;
    allow_exemption: boolean;
    operations?: Array<{ uri?: string }>;
}

/** The Auth API answered, but refused (a 4xx other than the handled ones). */
export class AuthApiRequestError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

export interface AuthApiClientOptions {
    /** The Auth API base URL, e.g. `http://authorization-api/v0`. */
    authApiUrl: string;
    jwtSecret: string;
    /** `global.defaultAdminUserId`: the internal session's user. */
    adminUserId: string;
    timeoutMs?: number;
}

function toRoleSummary(role: any): RoleSummary {
    return {
        id: String(role?.id ?? ""),
        name: String(role?.name ?? ""),
        description: role?.description ? String(role.description) : ""
    };
}

/**
 * Whether a permission is exactly a profile's managed permission (AUTH-7):
 * pre-authorised `llm/access/invoke` on `llm/access`, no other constraint,
 * no exemption.
 */
export function isProfilePermission(permission: PermissionRecord): boolean {
    const operations = (permission.operations ?? []).map((op) => op?.uri);
    return (
        permission.resource_uri === PROFILE_PERMISSION_RESOURCE &&
        operations.length === 1 &&
        operations[0] === PROFILE_PERMISSION_OPERATION &&
        permission.pre_authorised_constraint === true &&
        permission.user_ownership_constraint === false &&
        permission.org_unit_ownership_constraint === false &&
        permission.allow_exemption === false
    );
}

export default class AuthApiClient {
    private readonly base: string;
    private readonly token: string;

    constructor(private readonly options: AuthApiClientOptions) {
        this.base = `${options.authApiUrl.replace(/\/$/, "")}/public`;
        this.token = buildJwt(options.jwtSecret, options.adminUserId);
    }

    private async request(
        method: string,
        path: string,
        body?: unknown
    ): Promise<{ status: number; body: any }> {
        let response: Response;
        try {
            response = await fetch(`${this.base}${path}`, {
                method,
                headers: {
                    "X-Magda-Session": this.token,
                    ...(body === undefined
                        ? {}
                        : { "Content-Type": "application/json" })
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000)
            });
        } catch (error) {
            throw new AuthApiUnavailableError(
                `Auth API ${method} ${path} failed: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
        const text = await response.text();
        let parsed: any = undefined;
        try {
            parsed = text ? JSON.parse(text) : undefined;
        } catch {
            parsed = text;
        }
        if (response.status >= 500 || response.status === 401) {
            // 401: the internal session itself was refused; not the caller's fault
            throw new AuthApiUnavailableError(
                `Auth API ${method} ${path} answered HTTP ${response.status}`
            );
        }
        return { status: response.status, body: parsed };
    }

    private refused(method: string, path: string, status: number): never {
        throw new AuthApiRequestError(
            status,
            `Auth API ${method} ${path} answered HTTP ${status}`
        );
    }

    /** A permission by ID, or `null` when it doesn't exist. */
    async getPermission(id: string): Promise<PermissionRecord | null> {
        const path = `/permissions/${encodeURIComponent(id)}`;
        const { status, body } = await this.request("GET", path);
        if (status === 404) return null;
        if (status !== 200) this.refused("GET", path, status);
        return body as PermissionRecord;
    }

    /**
     * LIFE-1 step 2: create a profile's permission with the ID recorded on the
     * profile. Returns `"exists"` when a permission with that ID is already
     * there (a retry); the caller then checks it with `getPermission`.
     */
    async createProfilePermission(
        id: string,
        name: string,
        description: string
    ): Promise<"created" | "exists"> {
        const path = "/permissions";
        const { status } = await this.request("POST", path, {
            id,
            name,
            description,
            resourceUri: PROFILE_PERMISSION_RESOURCE,
            operationUris: [PROFILE_PERMISSION_OPERATION],
            user_ownership_constraint: false,
            org_unit_ownership_constraint: false,
            pre_authorised_constraint: true,
            allow_exemption: false
        });
        if (status === 200) return "created";
        if (status === 409) return "exists";
        this.refused("POST", path, status);
    }

    /**
     * LIFE-4 step 2: delete a permission and all its role links in one
     * transaction (AUTHAPI-2). Idempotent: a permission that is already gone
     * counts as deleted. (`DELETE` answers 400 for a missing permission, so a
     * refusal is confirmed with `GET` → 404.)
     */
    async deletePermissionWithRoleLinks(id: string): Promise<void> {
        const path = `/permissions/${encodeURIComponent(
            id
        )}?removeFromRoles=true`;
        const { status } = await this.request("DELETE", path);
        if (status === 200) return;
        if (status === 400 && (await this.getPermission(id)) === null) return;
        this.refused("DELETE", path, status);
    }

    /** AUTHAPI-1: the roles holding a permission, paginated. */
    async getPermissionRoles(
        permissionId: string,
        offset: number,
        limit: number
    ): Promise<RoleSummary[]> {
        const path = `/permissions/${encodeURIComponent(
            permissionId
        )}/roles?offset=${offset}&limit=${limit}`;
        const { status, body } = await this.request("GET", path);
        if (status !== 200) this.refused("GET", path, status);
        return (Array.isArray(body) ? body : []).map(toRoleSummary);
    }

    /** A role by ID, or `null` when it doesn't exist. */
    async getRole(roleId: string): Promise<RoleSummary | null> {
        const path = `/roles/${encodeURIComponent(roleId)}`;
        const { status, body } = await this.request("GET", path);
        if (status === 404 || (status === 200 && !body?.id)) return null;
        if (status !== 200) this.refused("GET", path, status);
        return toRoleSummary(body);
    }

    /** Roles whose name or description contains `keyword`. */
    async searchRoles(
        keyword: string,
        offset: number,
        limit: number
    ): Promise<RoleSummary[]> {
        const query = new URLSearchParams({
            offset: String(offset),
            limit: String(limit)
        });
        if (keyword) query.set("keyword", keyword);
        const path = `/roles?${query}`;
        const { status, body } = await this.request("GET", path);
        if (status !== 200) this.refused("GET", "/roles", status);
        return (Array.isArray(body) ? body : []).map(toRoleSummary);
    }

    /** LIFE-3: attach. Idempotent: an existing link is fine. */
    async attachPermissionToRole(
        roleId: string,
        permissionId: string
    ): Promise<void> {
        const path = `/roles/${encodeURIComponent(
            roleId
        )}/permissions/${encodeURIComponent(permissionId)}`;
        const { status } = await this.request("POST", path);
        if (status !== 200) this.refused("POST", path, status);
    }

    /**
     * LIFE-3: detach, always with `deletePermission=false`: the default
     * deletes the permission when it leaves its last role.
     */
    async detachPermissionFromRole(
        roleId: string,
        permissionId: string
    ): Promise<void> {
        const path = `/roles/${encodeURIComponent(
            roleId
        )}/permissions/${encodeURIComponent(
            permissionId
        )}?deletePermission=false`;
        const { status } = await this.request("DELETE", path);
        if (status !== 200) this.refused("DELETE", path, status);
    }

    /** LIFE-2: does an org unit exist? */
    async orgUnitExists(orgUnitId: string): Promise<boolean> {
        const path = `/orgunits/${encodeURIComponent(orgUnitId)}`;
        const { status, body } = await this.request("GET", path);
        if (status === 404) return false;
        if (status !== 200) this.refused("GET", path, status);
        return !!body?.id;
    }
}
