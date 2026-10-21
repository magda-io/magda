import { createHash } from "node:crypto";
import { DownstreamServiceError } from "./clients.js";
import {
    AgentSkillError,
    downstreamError,
    parseAgentSkillRecord,
    UUID_PATTERN
} from "./records.js";
import type { AgentSkillService } from "./service.js";
import {
    AgentSkillAuthorization,
    AgentSkillRecord,
    AgentSkillRegistry,
    AgentSkillShareGroup,
    AgentSkillShareGroups,
    AgentSkillShareRecipient,
    AgentSkillType
} from "./types.js";
import { AuthenticatedUser } from "../types.js";

/*
 * Source access management for published Agent Skills (#3861).
 *
 * Sharing reuses MAGDA Access Groups: one group per publication incarnation
 * owns a group-specific pre-authorised permission granting exactly
 * `object/agentSkill/<type>/read`, and a role whose members receive it. The
 * permission ID is attached to that one publication's
 * `access-control.preAuthorisedPermissionIds`, so membership can never grant
 * another publication, generic `object/record/read` or an installation.
 *
 * Only a caller authorized for the typed `update` of the actual source may
 * change its access. The Access Group calls then use the Agent Services
 * internal session (members cannot manage groups); the source record itself is
 * written with the caller's own session, so Registry and OPA check it again.
 *
 * The group is bound to the publication by an opaque keyword derived from the
 * record ID and its immutable creation time. A publication deleted and
 * published again under the same name therefore never inherits the earlier
 * recipients.
 */

/** Recipients are listed and searched within this bound. */
export const MAX_SHARE_RECIPIENTS = 500;

function shareKeyword(record: AgentSkillRecord): string {
    const digest = createHash("sha256")
        .update(
            `${record.id}\n${record.aspects["agent-skill"].createdAt}`,
            "utf8"
        )
        .digest("hex");
    return `agent-skill-share-${digest.slice(0, 40)}`;
}

function resourceUri(type: AgentSkillType): string {
    return `object/agentSkill/${type}`;
}

function invalidShare(): AgentSkillError {
    return new AgentSkillError(
        "This skill's sharing configuration is inconsistent; ask a MAGDA administrator to review its Access Group",
        409,
        "AGENT_SKILL_SHARE_INVALID"
    );
}

export interface AgentSkillAccessView {
    id: string;
    type: AgentSkillType;
    /** System skills only: `access-control.constraintExemption`. */
    public?: boolean;
    /** System skills only. */
    orgUnitId?: string;
    recipients: { count: number };
}

export interface AgentSkillAccessServiceOptions {
    publications: AgentSkillService;
    registry: AgentSkillRegistry;
    authorization: AgentSkillAuthorization;
    shareGroups: AgentSkillShareGroups;
}

interface BoundGroup {
    group: AgentSkillShareGroup;
    attached: boolean;
}

export class AgentSkillAccessService {
    constructor(private readonly options: AgentSkillAccessServiceOptions) {}

    private audit(
        operation: string,
        record: AgentSkillRecord,
        user: AuthenticatedUser,
        result: "success" | "failure",
        extra: Record<string, unknown> = {}
    ): void {
        console.info(
            JSON.stringify({
                event: "agent-skill-access",
                actorId: user.id,
                operation,
                recordId: record.id,
                type: record.aspects["agent-skill"].type,
                result,
                ...extra
            })
        );
    }

    /** The source, if the caller is authorized to manage it (typed update). */
    private async managed(
        type: AgentSkillType,
        id: string,
        user: AuthenticatedUser
    ): Promise<AgentSkillRecord> {
        const record = await this.options.publications.prepareExisting(
            type,
            id,
            "update",
            user
        );
        if (record.aspects["agent-skill"].state !== "READY")
            throw new AgentSkillError(
                "Only published (READY) Agent Skills can be shared",
                409,
                "AGENT_SKILL_NOT_READY",
                true
            );
        return record;
    }

    /** Re-read the current source inside the record lock. */
    private async current(
        id: string,
        user: AuthenticatedUser
    ): Promise<AgentSkillRecord> {
        const raw = await this.options.registry.get(
            id,
            this.options.publications.internalSessionToken()
        );
        if (!raw)
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        const record = parseAgentSkillRecord(raw);
        if (
            !(await this.options.authorization.can(
                "update",
                record,
                user.sessionToken
            ))
        )
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        return record;
    }

    /**
     * Find this incarnation's share group and prove its binding: the expected
     * typed resource and single read operation, attached to this publication
     * only. An unattached bound group is a leftover of an interrupted first
     * share and is reused.
     */
    private async boundGroup(
        record: AgentSkillRecord,
        internalSession: string
    ): Promise<BoundGroup | undefined> {
        const type = record.aspects["agent-skill"].type;
        const keyword = shareKeyword(record);
        const groups = await this.options.shareGroups.find(
            keyword,
            internalSession
        );
        const valid = groups.filter(
            (group) =>
                group.keywords.includes(keyword) &&
                group.resourceUri === resourceUri(type) &&
                group.operationUris.length === 1 &&
                group.operationUris[0] === `${resourceUri(type)}/read` &&
                UUID_PATTERN.test(group.permissionId) &&
                UUID_PATTERN.test(group.roleId)
        );
        if (valid.length !== groups.length) throw invalidShare();
        const attachedIds =
            record.aspects["access-control"].preAuthorisedPermissionIds || [];
        const attached = valid.filter((group) =>
            attachedIds.includes(group.permissionId)
        );
        if (attached.length > 1) throw invalidShare();
        const group = attached[0] || valid[0];
        if (!group) return undefined;
        const users = await this.options.shareGroups.publicationsUsingPermission(
            group.permissionId,
            internalSession
        );
        if (users.some((id) => id !== record.id)) throw invalidShare();
        return { group, attached: !!attached[0] };
    }

    private async recipients(
        bound: BoundGroup | undefined,
        internalSession: string
    ): Promise<AgentSkillShareRecipient[]> {
        if (!bound?.attached) return [];
        return this.options.shareGroups.listUsers(
            bound.group.id,
            { offset: 0, limit: MAX_SHARE_RECIPIENTS },
            internalSession
        );
    }

    private view(
        record: AgentSkillRecord,
        count: number
    ): AgentSkillAccessView {
        const type = record.aspects["agent-skill"].type;
        const accessControl = record.aspects["access-control"];
        return {
            id: record.id,
            type,
            ...(type === "system"
                ? {
                      public: accessControl.constraintExemption === true,
                      ...(accessControl.orgUnitId
                          ? { orgUnitId: accessControl.orgUnitId }
                          : {})
                  }
                : {}),
            recipients: { count }
        };
    }

    async getAccess(
        type: AgentSkillType,
        id: string,
        user: AuthenticatedUser
    ): Promise<AgentSkillAccessView> {
        const record = await this.managed(type, id, user);
        try {
            const internalSession = this.options.publications.internalSessionToken();
            const bound = await this.boundGroup(record, internalSession);
            return this.view(
                record,
                (await this.recipients(bound, internalSession)).length
            );
        } catch (error) {
            throw downstreamError(error, id);
        }
    }

    async listRecipients(
        type: AgentSkillType,
        id: string,
        request: { offset: number; limit: number; keyword?: string },
        user: AuthenticatedUser
    ): Promise<{ items: AgentSkillShareRecipient[]; total: number }> {
        const record = await this.managed(type, id, user);
        try {
            const internalSession = this.options.publications.internalSessionToken();
            const all = await this.recipients(
                await this.boundGroup(record, internalSession),
                internalSession
            );
            // Search only what the manager already sees (ID and display name),
            // never other account attributes such as email.
            const keyword = request.keyword?.trim().toLowerCase();
            const matched = keyword
                ? all.filter(
                      (recipient) =>
                          recipient.id.includes(keyword) ||
                          !!recipient.displayName
                              ?.toLowerCase()
                              .includes(keyword)
                  )
                : all;
            return {
                items: matched.slice(
                    request.offset,
                    request.offset + request.limit
                ),
                total: matched.length
            };
        } catch (error) {
            throw downstreamError(error, id);
        }
    }

    private validRecipient(record: AgentSkillRecord, userId: string): void {
        if (!UUID_PATTERN.test(userId))
            throw new AgentSkillError(
                "Recipient must be a MAGDA user ID (UUID)",
                400,
                "INVALID_RECIPIENT"
            );
        const aspect = record.aspects["agent-skill"];
        if (
            userId === aspect.userId ||
            userId === record.aspects["access-control"].ownerId
        )
            throw new AgentSkillError(
                "The skill's own user already has access",
                400,
                "INVALID_RECIPIENT"
            );
    }

    async addRecipient(
        type: AgentSkillType,
        id: string,
        recipientId: string,
        user: AuthenticatedUser
    ): Promise<{ added: boolean }> {
        let record = await this.managed(type, id, user);
        this.validRecipient(record, recipientId);
        try {
            const added = await this.options.publications.runExclusive(
                id,
                async () => {
                    record = await this.current(id, user);
                    if (record.aspects["agent-skill"].state !== "READY")
                        throw new AgentSkillError(
                            "Only published (READY) Agent Skills can be shared",
                            409,
                            "AGENT_SKILL_NOT_READY",
                            true
                        );
                    const internalSession = this.options.publications.internalSessionToken();
                    let bound = await this.boundGroup(record, internalSession);
                    if (!bound) {
                        const group = await this.options.shareGroups.create(
                            {
                                name: "Agent Skill share",
                                description:
                                    "Managed by Agent Services: grants read access to one published Agent Skill. Manage recipients from the skill's sharing settings.",
                                resourceUri: resourceUri(type),
                                operationUris: [`${resourceUri(type)}/read`],
                                keywords: [
                                    "agent-skill-share",
                                    shareKeyword(record)
                                ]
                            },
                            internalSession
                        );
                        bound = { group, attached: false };
                    }
                    if (!bound.attached) {
                        // Attach first, then add members: a failure here
                        // leaves an empty, unattached group that the next
                        // attempt reuses, never a grant to the wrong skill.
                        const accessControl = record.aspects["access-control"];
                        await this.options.registry.put(
                            {
                                ...record,
                                aspects: {
                                    ...record.aspects,
                                    "access-control": {
                                        ...accessControl,
                                        preAuthorisedPermissionIds: [
                                            ...(accessControl.preAuthorisedPermissionIds ||
                                                []),
                                            bound.group.permissionId
                                        ]
                                    }
                                }
                            },
                            user.sessionToken
                        );
                    }
                    return this.options.shareGroups.addUser(
                        bound.group.id,
                        recipientId,
                        internalSession
                    );
                }
            );
            this.audit("share", record, user, "success", {
                recipientId,
                added
            });
            return { added };
        } catch (error) {
            const mapped =
                error instanceof DownstreamServiceError &&
                error.service === "authorization" &&
                error.status === 404
                    ? new AgentSkillError(
                          "No MAGDA user has this ID",
                          404,
                          "RECIPIENT_NOT_FOUND"
                      )
                    : downstreamError(error, id);
            this.audit("share", record, user, "failure", {
                recipientId,
                code: mapped.code
            });
            throw mapped;
        }
    }

    async removeRecipient(
        type: AgentSkillType,
        id: string,
        recipientId: string,
        user: AuthenticatedUser
    ): Promise<{ removed: boolean }> {
        let record = await this.managed(type, id, user);
        if (!UUID_PATTERN.test(recipientId))
            throw new AgentSkillError(
                "Recipient must be a MAGDA user ID (UUID)",
                400,
                "INVALID_RECIPIENT"
            );
        try {
            const removed = await this.options.publications.runExclusive(
                id,
                async () => {
                    record = await this.current(id, user);
                    const internalSession = this.options.publications.internalSessionToken();
                    const bound = await this.boundGroup(
                        record,
                        internalSession
                    );
                    // Revocation changes only membership: the publication,
                    // its ZIP and its other grants stay unchanged.
                    if (!bound?.attached) return false;
                    return this.options.shareGroups.removeUser(
                        bound.group.id,
                        recipientId,
                        internalSession
                    );
                }
            );
            this.audit("unshare", record, user, "success", {
                recipientId,
                removed
            });
            return { removed };
        } catch (error) {
            const mapped = downstreamError(error, id);
            this.audit("unshare", record, user, "failure", {
                recipientId,
                code: mapped.code
            });
            throw mapped;
        }
    }

    /**
     * System skill audience: Public skill (`constraintExemption`) and one
     * OrgUnit. Paths are additive; turning Public off keeps the OrgUnit and
     * selected users, which then become the only paths.
     */
    async updateSystemAccess(
        type: AgentSkillType,
        id: string,
        request: { public?: unknown; orgUnitId?: unknown },
        user: AuthenticatedUser
    ): Promise<AgentSkillAccessView> {
        if (type !== "system")
            throw new AgentSkillError(
                "User skills are private to their user and shared only with selected users",
                400,
                "AGENT_SKILL_ACCESS_NOT_CONFIGURABLE"
            );
        if (
            (request.public !== undefined &&
                typeof request.public !== "boolean") ||
            (request.orgUnitId !== undefined &&
                request.orgUnitId !== null &&
                (typeof request.orgUnitId !== "string" ||
                    !UUID_PATTERN.test(request.orgUnitId)))
        )
            throw new AgentSkillError(
                "public must be a boolean and orgUnitId an OrgUnit ID or null",
                400,
                "INVALID_ACCESS_SETTINGS"
            );
        let record = await this.managed(type, id, user);
        try {
            const internalSession = this.options.publications.internalSessionToken();
            if (
                typeof request.orgUnitId === "string" &&
                !(await this.options.shareGroups.orgUnitExists(
                    request.orgUnitId,
                    internalSession
                ))
            )
                throw new AgentSkillError(
                    "The selected organisation unit does not exist",
                    400,
                    "INVALID_ORG_UNIT"
                );
            const updated = await this.options.publications.runExclusive(
                id,
                async () => {
                    record = await this.current(id, user);
                    const {
                        orgUnitId: currentOrgUnitId,
                        ...accessControl
                    } = record.aspects["access-control"];
                    const orgUnitId =
                        request.orgUnitId === undefined
                            ? currentOrgUnitId
                            : (request.orgUnitId as string | null) || undefined;
                    const proposed: AgentSkillRecord = {
                        ...record,
                        aspects: {
                            ...record.aspects,
                            "access-control": {
                                ...accessControl,
                                ...(orgUnitId ? { orgUnitId } : {}),
                                constraintExemption:
                                    request.public === undefined
                                        ? accessControl.constraintExemption ===
                                          true
                                        : (request.public as boolean)
                            }
                        }
                    };
                    // The proposed audience must also be within the caller's
                    // typed update authority.
                    if (
                        !(await this.options.authorization.can(
                            "update",
                            proposed,
                            user.sessionToken
                        ))
                    )
                        throw new AgentSkillError(
                            "You are not permitted to apply these access settings",
                            403,
                            "AGENT_SKILL_FORBIDDEN"
                        );
                    await this.options.registry.put(
                        proposed,
                        user.sessionToken
                    );
                    return proposed;
                }
            );
            const bound = await this.boundGroup(updated, internalSession);
            this.audit("access", updated, user, "success", {
                public:
                    updated.aspects["access-control"].constraintExemption ===
                    true,
                orgUnitId: updated.aspects["access-control"].orgUnitId || null
            });
            return this.view(
                updated,
                (await this.recipients(bound, internalSession)).length
            );
        } catch (error) {
            const mapped = downstreamError(error, id);
            this.audit("access", record, user, "failure", {
                code: mapped.code
            });
            throw mapped;
        }
    }

    /**
     * After a publication was deleted, remove its share groups. Best effort:
     * an orphaned group grants nothing (no record lists its permission) and a
     * later publication of the same name is bound to a different keyword.
     */
    async cleanupAfterDelete(record: AgentSkillRecord): Promise<void> {
        try {
            const internalSession = this.options.publications.internalSessionToken();
            const groups = await this.options.shareGroups.find(
                shareKeyword(record),
                internalSession
            );
            for (const group of groups)
                await this.options.shareGroups.delete(
                    group.id,
                    internalSession
                );
        } catch (error) {
            console.warn(
                JSON.stringify({
                    event: "agent-skill-share-cleanup-failed",
                    recordId: record.id,
                    message: (error as Error)?.message
                })
            );
        }
    }
}
