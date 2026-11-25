// LLM access profile lifecycle (#3838 LIFE-1 to LIFE-5, AUTH-7, AUTH-8).
// See docs/design/agent-workspace/llm-access-profiles.md, "Profile lifecycle".

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
    /** The profile is being created or deleted: retry shortly. */
    | "not_ready"
    | "role_not_found"
    | "role_not_allowed";

export class ProfileLifecycleError extends Error {
    constructor(readonly reason: LifecycleError, message: string) {
        super(message);
    }
}

/**
 * The profile's existing permission (found by the ID recorded on the profile)
 * isn't a profile permission. It is never adopted or changed; an operator has
 * to look at it.
 */
export class UnexpectedPermissionError extends Error {}

export type ReconcileOutcome =
    | "ready"
    | "finished"
    | "recreated"
    | "deleted"
    | "abandoned"
    | "skipped";

/** Profiles per reconcile outcome, plus how many failed. */
export type SweepResult = Record<ReconcileOutcome, number> & {
    failures: number;
};

export interface ProfileServiceOptions {
    repository: ProfileRepository;
    authApi: AuthApiClient;
    /**
     * A pending profile younger than this is left to the request creating it,
     * so reconcile doesn't race it (a race is safe, just wasteful).
     */
    pendingGraceMs?: number;
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

/** LIFE-5: how often reconcile runs; `0` runs it only at startup and on demand. */
export function parseReconcileIntervalSeconds(
    value: string | undefined
): number {
    if (value === undefined || value.trim() === "") return 300;
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86_400) {
        throw new Error(
            "PROFILE_RECONCILE_INTERVAL_SECONDS must be an integer from 0 to 86400"
        );
    }
    return seconds;
}

export default class ProfileService {
    readonly repository: ProfileRepository;
    private readonly authApi: AuthApiClient;
    private readonly pendingGraceMs: number;
    private sweeping: Promise<SweepResult> | null = null;

    constructor(options: ProfileServiceOptions) {
        this.repository = options.repository;
        this.authApi = options.authApi;
        this.pendingGraceMs = options.pendingGraceMs ?? 60_000;
    }

    /**
     * Make sure the permission recorded on a profile exists and is a profile
     * permission: create it with that ID if it's missing (LIFE-1 step 2, and
     * LIFE-5 re-creation). Never adopts a permission found any other way.
     */
    private async ensurePermission(
        profile: AccessProfile
    ): Promise<"present" | "created"> {
        const id = profile.usePermissionId;
        if (!id) throw new Error(`Profile ${profile.id} has no permission ID`);
        const existing = await this.authApi.getPermission(id);
        if (existing) {
            if (!isProfilePermission(existing)) {
                throw new UnexpectedPermissionError(
                    `Permission ${id} of profile ${profile.id} isn't a profile permission`
                );
            }
            return "present";
        }
        const created = await this.authApi.createProfilePermission(
            id,
            permissionName(profile),
            permissionDescription(profile)
        );
        if (created === "exists") {
            // created concurrently (another replica or reconcile): check it
            return this.ensurePermission(profile);
        }
        return "created";
    }

    /** LIFE-2: validate an org unit through the Auth API. */
    orgUnitExists(orgUnitId: string): Promise<boolean> {
        return this.authApi.orgUnitExists(orgUnitId);
    }

    /** LIFE-1: pending row with its permission ID → permission → ready. */
    async create(
        fields: ProfileFields,
        createdBy: string | null
    ): Promise<AccessProfile> {
        const pending = await this.repository.createPending(fields, createdBy);
        await this.ensurePermission(pending);
        const ready = await this.repository.markReady(pending.id);
        if (ready) return ready;
        // finished by reconcile in the meantime
        const current = await this.repository.get(pending.id);
        if (!current) throw new Error(`Profile ${pending.id} disappeared`);
        return current;
    }

    private async readyProfile(id: string): Promise<AccessProfile> {
        const profile = await this.repository.get(id);
        if (!profile) {
            throw new ProfileLifecycleError("not_found", "Profile not found");
        }
        if (profile.state !== "ready") {
            throw new ProfileLifecycleError(
                "not_ready",
                `The profile is ${profile.state}; retry shortly`
            );
        }
        return profile;
    }

    /**
     * LIFE-4: mark deleting → delete the permission and its role links in one
     * Auth API call → delete the row. Safe to retry at any point. A pending
     * profile can't be deleted until its creation finishes.
     */
    async delete(id: string): Promise<void> {
        const marked = await this.repository.markDeleting(id);
        if (marked.status === "not_found") {
            throw new ProfileLifecycleError("not_found", "Profile not found");
        }
        if (marked.status === "pending") {
            throw new ProfileLifecycleError(
                "not_ready",
                "The profile is still being created; retry shortly"
            );
        }
        await this.finishDelete(marked.profile);
    }

    private async finishDelete(profile: AccessProfile): Promise<void> {
        if (profile.usePermissionId) {
            await this.authApi.deletePermissionWithRoleLinks(
                profile.usePermissionId
            );
        }
        await this.repository.delete(profile.id);
    }

    /** API-3: the roles holding a profile's permission. */
    async roles(
        id: string,
        offset: number,
        limit: number
    ): Promise<RoleSummary[]> {
        const profile = await this.readyProfile(id);
        return this.authApi.getPermissionRoles(
            profile.usePermissionId!,
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
        const profile = await this.readyProfile(id);
        const attached = new Set(
            (
                await this.authApi.getPermissionRoles(
                    profile.usePermissionId!,
                    0,
                    500
                )
            ).map((role) => role.id)
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

    private async attachableRole(roleId: string): Promise<RoleSummary> {
        if (!isUuid(roleId)) {
            throw new ProfileLifecycleError("role_not_found", "Role not found");
        }
        if (EXCLUDED_ROLE_IDS.has(roleId)) {
            throw new ProfileLifecycleError(
                "role_not_allowed",
                "LLM access profiles can't be attached to this role"
            );
        }
        const role = await this.authApi.getRole(roleId);
        if (!role) {
            throw new ProfileLifecycleError("role_not_found", "Role not found");
        }
        return role;
    }

    /** LIFE-3 / AUTH-8: attach the profile's own permission to a role. */
    async attachRole(id: string, roleId: string): Promise<void> {
        const profile = await this.readyProfile(id);
        await this.attachableRole(roleId);
        // the permission may have been removed with a deleted role (LIFE-5)
        await this.ensurePermission(profile);
        await this.authApi.attachPermissionToRole(
            roleId,
            profile.usePermissionId!
        );
    }

    /** LIFE-3: detach, keeping the permission even when it leaves its last role. */
    async detachRole(id: string, roleId: string): Promise<void> {
        const profile = await this.readyProfile(id);
        if (!isUuid(roleId) || !(await this.authApi.getRole(roleId))) {
            throw new ProfileLifecycleError("role_not_found", "Role not found");
        }
        if (!(await this.authApi.getPermission(profile.usePermissionId!))) {
            return; // nothing holds it, so nothing to detach
        }
        await this.authApi.detachPermissionFromRole(
            roleId,
            profile.usePermissionId!
        );
    }

    /**
     * LIFE-5, for one profile:
     * - `pending`: create the recorded permission if it's missing, then mark
     *   the profile ready (a pending row without a recorded permission, which
     *   only an older version could write, is abandoned);
     * - `deleting`: retry the delete;
     * - `ready`: re-create a missing permission with the **same** ID, so the
     *   profile needs no change (it went missing because an administrator
     *   deleted the only role holding it, together with that role's users'
     *   access; re-creating it loses nothing).
     */
    async reconcile(profile: AccessProfile): Promise<ReconcileOutcome> {
        if (profile.state === "deleting") {
            await this.finishDelete(profile);
            return "deleted";
        }
        if (profile.state === "pending") {
            if (!profile.usePermissionId) {
                await this.repository.delete(profile.id);
                return "abandoned";
            }
            await this.ensurePermission(profile);
            return (await this.repository.markReady(profile.id))
                ? "finished"
                : "skipped";
        }
        return (await this.ensurePermission(profile)) === "created"
            ? "recreated"
            : "ready";
    }

    /** LIFE-5 on demand, for one profile. Returns the profile afterwards (or `null` once deleted). */
    async reconcileOne(id: string): Promise<AccessProfile | null> {
        const profile = await this.repository.get(id);
        if (!profile) {
            throw new ProfileLifecycleError("not_found", "Profile not found");
        }
        await this.reconcile(profile);
        return this.repository.get(id);
    }

    /**
     * LIFE-5 at startup and periodically: every pending profile past the grace
     * period, every deleting profile, and every ready profile. One sweep at a
     * time; a failure on one profile doesn't stop the others.
     */
    sweep(): Promise<SweepResult> {
        if (!this.sweeping) {
            this.sweeping = this.runSweep().finally(() => {
                this.sweeping = null;
            });
        }
        return this.sweeping;
    }

    private async runSweep(): Promise<SweepResult> {
        const counts: Record<ReconcileOutcome, number> = {
            ready: 0,
            finished: 0,
            recreated: 0,
            deleted: 0,
            abandoned: 0,
            skipped: 0
        };
        const profiles = [
            ...(await this.repository.listByState(
                ["pending"],
                500,
                new Date(Date.now() - this.pendingGraceMs)
            )),
            ...(await this.repository.listByState(["deleting", "ready"], 5000))
        ];
        let failures = 0;
        for (const profile of profiles) {
            try {
                const outcome = await this.reconcile(profile);
                counts[outcome]++;
                if (outcome !== "ready" && outcome !== "skipped") {
                    console.log(
                        JSON.stringify({
                            event: "llm-profile-reconciled",
                            profileId: profile.id,
                            outcome
                        })
                    );
                }
            } catch (error) {
                failures++;
                console.error(
                    JSON.stringify({
                        event: "llm-profile-reconcile-failed",
                        profileId: profile.id,
                        state: profile.state,
                        error:
                            error instanceof Error ? error.message : "unknown"
                    })
                );
            }
        }
        if (failures || counts.finished || counts.recreated || counts.deleted) {
            console.log(
                JSON.stringify({
                    event: "llm-profile-reconcile-sweep",
                    ...counts,
                    failures
                })
            );
        }
        return { ...counts, failures };
    }
}
