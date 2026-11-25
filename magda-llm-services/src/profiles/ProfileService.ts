// LLM access profile lifecycle (#3838 LIFE-1 to LIFE-5, AUTH-7, AUTH-8).
// See docs/design/agent-workspace/llm-access-profiles.md, "Profile lifecycle".

import { randomUUID } from "node:crypto";
import {
    ADMIN_USERS_ROLE_ID,
    ANONYMOUS_USERS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants.js";
import AuthApiClient, {
    isProfilePermission,
    RoleSummary
} from "../authApi/AuthApiClient.js";
import ProfileRepository from "./ProfileRepository.js";
import { AccessProfile, ProfileFields } from "./types.js";
import { isUuid } from "./validation.js";

/** Roles a profile can never be attached to (API-4). */
const EXCLUDED_ROLE_IDS = new Set([
    ANONYMOUS_USERS_ROLE_ID,
    ADMIN_USERS_ROLE_ID
]);

export type LifecycleError =
    | "not_found"
    | "role_not_found"
    | "role_not_allowed";

export class ProfileLifecycleError extends Error {
    constructor(readonly reason: LifecycleError, message: string) {
        super(message);
    }
}

/**
 * A permission with the profile's recorded ID exists but isn't a profile
 * permission. It is never adopted or changed; an operator has to look at it.
 */
export class UnexpectedPermissionError extends Error {}

export interface ProfileServiceOptions {
    repository: ProfileRepository;
    authApi: AuthApiClient;
}

function permissionName(profile: Pick<AccessProfile, "id" | "name">) {
    return `LLM access profile: ${profile.name} (${profile.id})`;
}

function permissionDescription(profile: Pick<AccessProfile, "id">) {
    return (
        `Managed by LLM Services for LLM access profile ${profile.id}. ` +
        "Attach it to roles from the profile, not here."
    );
}

export default class ProfileService {
    readonly repository: ProfileRepository;
    private readonly authApi: AuthApiClient;

    constructor(options: ProfileServiceOptions) {
        this.repository = options.repository;
        this.authApi = options.authApi;
    }

    /** LIFE-2: validate an org unit through the Auth API. */
    orgUnitExists(orgUnitId: string): Promise<boolean> {
        return this.authApi.orgUnitExists(orgUnitId);
    }

    /**
     * LIFE-1, in one transaction:
     * 1. insert the profile, with a newly chosen ID for its permission;
     * 2. create the permission with that ID through the Auth API;
     * 3. commit.
     *
     * If anything fails once step 2 was attempted (the Auth API call, an
     * unknown outcome such as a timeout, or the commit), the row is rolled
     * back and one compensating delete of the permission by its ID is made.
     * If that delete fails too, it is logged and the original error is
     * returned: no retry. Only a crash between steps 2 and 3 leaves a
     * permission that no profile refers to; no role holds it, so it grants
     * nothing.
     */
    async create(
        fields: ProfileFields,
        createdBy: string | null
    ): Promise<AccessProfile> {
        const id = randomUUID();
        const permissionId = randomUUID();
        let attempted = false;
        let foreign = false;
        try {
            return await this.repository.transaction(async (tx) => {
                const profile = await tx.insert(
                    id,
                    permissionId,
                    fields,
                    createdBy
                );
                attempted = true;
                const created = await this.authApi.createProfilePermission(
                    permissionId,
                    permissionName(profile),
                    permissionDescription(profile)
                );
                if (created === "exists") {
                    // A random UUID already in use: never ours, never deleted.
                    foreign = true;
                    throw new UnexpectedPermissionError(
                        `Permission ID ${permissionId} is already in use`
                    );
                }
                return profile;
            });
        } catch (error) {
            if (attempted && !foreign) {
                await this.compensate(id, permissionId);
            }
            throw error;
        }
    }

    /** One best-effort delete of a permission created for a profile that wasn't saved. */
    private async compensate(profileId: string, permissionId: string) {
        try {
            await this.authApi.deletePermissionWithRoleLinks(permissionId);
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: "llm-profile-permission-cleanup-failed",
                    message:
                        "A profile wasn't created, and its permission may remain; it is held by no role and grants nothing",
                    profileId,
                    permissionId,
                    error: error instanceof Error ? error.message : "unknown"
                })
            );
        }
    }

    /**
     * LIFE-4, in one transaction: delete the row, delete the permission with
     * all its role links through the Auth API (a permission that is already
     * gone counts as deleted), commit. If the Auth API call fails, the row is
     * rolled back and the profile is unchanged. If the commit fails after the
     * permission was deleted, the profile remains without a permission, and a
     * retry finishes the delete.
     */
    async delete(id: string): Promise<void> {
        await this.repository.transaction(async (tx) => {
            const profile = await tx.delete(id);
            if (!profile) {
                throw new ProfileLifecycleError(
                    "not_found",
                    "Profile not found"
                );
            }
            await this.authApi.deletePermissionWithRoleLinks(
                profile.usePermissionId
            );
        });
    }

    private async existingProfile(id: string): Promise<AccessProfile> {
        const profile = await this.repository.get(id);
        if (!profile) {
            throw new ProfileLifecycleError("not_found", "Profile not found");
        }
        return profile;
    }

    /**
     * LIFE-5: make sure the profile's permission exists, re-creating it with
     * the **same** ID if it's missing. It goes missing when an administrator
     * deletes the only role holding it (the Auth API deletes permissions only
     * that role held); its holders went with that role, so re-creating it
     * loses nothing. Never adopts a permission that isn't a profile
     * permission.
     */
    private async ensurePermission(profile: AccessProfile): Promise<void> {
        const existing = await this.authApi.getPermission(
            profile.usePermissionId
        );
        if (existing) {
            if (!isProfilePermission(existing)) {
                throw new UnexpectedPermissionError(
                    `Permission ${profile.usePermissionId} of profile ${profile.id} isn't a profile permission`
                );
            }
            return;
        }
        const created = await this.authApi.createProfilePermission(
            profile.usePermissionId,
            permissionName(profile),
            permissionDescription(profile)
        );
        if (created === "exists") {
            // created concurrently: check what it is
            return this.ensurePermission(profile);
        }
        console.log(
            JSON.stringify({
                event: "llm-profile-permission-recreated",
                profileId: profile.id,
                permissionId: profile.usePermissionId
            })
        );
    }

    /** API-3: the roles holding a profile's permission (none if it's missing). */
    async roles(
        id: string,
        offset: number,
        limit: number
    ): Promise<RoleSummary[]> {
        const profile = await this.existingProfile(id);
        if (!(await this.authApi.getPermission(profile.usePermissionId))) {
            return [];
        }
        return this.authApi.getPermissionRoles(
            profile.usePermissionId,
            offset,
            limit
        );
    }

    /**
     * API-4: roles a manager may attach: ID, name and description only;
     * never Anonymous Users or Admin Users, nor roles already attached.
     */
    async roleCandidates(
        id: string,
        keyword: string,
        limit: number
    ): Promise<RoleSummary[]> {
        const attached = new Set(
            (await this.roles(id, 0, 500)).map((role) => role.id)
        );
        const candidates: RoleSummary[] = [];
        // over-fetch: excluded roles may be among the matches
        const matches = await this.authApi.searchRoles(
            keyword,
            0,
            limit + EXCLUDED_ROLE_IDS.size + attached.size
        );
        for (const role of matches) {
            if (EXCLUDED_ROLE_IDS.has(role.id) || attached.has(role.id)) {
                continue;
            }
            candidates.push(role);
            if (candidates.length >= limit) break;
        }
        return candidates;
    }

    /**
     * LIFE-3 / AUTH-8: attach the profile's own permission to a role,
     * re-creating the permission first if it's missing (LIFE-5).
     *
     * The profile row is locked for the whole attach (DATA-4), so it can't
     * interleave with a delete: a delete in progress makes this wait and then
     * answer "not found"; an attach in progress makes the delete wait, and
     * the delete then removes the permission with its new role link.
     * Without the lock, an attach could re-create the permission of a profile
     * deleted meanwhile, and leave it on the role.
     */
    async attachRole(id: string, roleId: string): Promise<void> {
        if (!isUuid(roleId)) {
            throw new ProfileLifecycleError("role_not_found", "Role not found");
        }
        if (EXCLUDED_ROLE_IDS.has(roleId)) {
            throw new ProfileLifecycleError(
                "role_not_allowed",
                "LLM access profiles can't be attached to this role"
            );
        }
        await this.repository.transaction(async (tx) => {
            const profile = await tx.getForUpdate(id);
            if (!profile) {
                throw new ProfileLifecycleError(
                    "not_found",
                    "Profile not found"
                );
            }
            if (!(await this.authApi.getRole(roleId))) {
                throw new ProfileLifecycleError(
                    "role_not_found",
                    "Role not found"
                );
            }
            await this.ensurePermission(profile);
            await this.authApi.attachPermissionToRole(
                roleId,
                profile.usePermissionId
            );
        });
    }

    /** LIFE-3: detach, keeping the permission even when it leaves its last role. */
    async detachRole(id: string, roleId: string): Promise<void> {
        const profile = await this.existingProfile(id);
        if (!isUuid(roleId) || !(await this.authApi.getRole(roleId))) {
            throw new ProfileLifecycleError("role_not_found", "Role not found");
        }
        if (!(await this.authApi.getPermission(profile.usePermissionId))) {
            return; // nothing holds it, so nothing to detach
        }
        await this.authApi.detachPermissionFromRole(
            roleId,
            profile.usePermissionId
        );
    }
}
