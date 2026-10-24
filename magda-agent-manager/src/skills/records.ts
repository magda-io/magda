import {
    ArchiveValidationError,
    validateAgentSkillMetadata,
    validateAgentSkillNameForType
} from "./archive.js";
import { DownstreamServiceError } from "./clients.js";
import {
    AgentSkillMetadata,
    AgentSkillRecord,
    AgentSkillState,
    AgentSkillType
} from "./types.js";

/*
 * Agent Skill record identity, parsing and error mapping shared by the
 * publication, installation and access services.
 */

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const USER_RECORD_ID_PATTERN = /^agent-skill-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
export const SYSTEM_RECORD_ID_PATTERN = /^agent-skill-system-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;

export function agentSkillRecordId(
    type: AgentSkillType,
    userId: string | undefined,
    name: string
): string {
    try {
        validateAgentSkillMetadata(name, "identity");
        validateAgentSkillNameForType(name, type);
    } catch {
        throw new AgentSkillError(
            "Agent Skill identity is invalid",
            400,
            "INVALID_SKILL_IDENTITY"
        );
    }
    if (type === "system") {
        if (userId !== undefined) {
            throw new AgentSkillError(
                "System Agent Skills must not have a user identity",
                400,
                "INVALID_SKILL_IDENTITY"
            );
        }
        return `agent-skill-${name}`;
    }
    if (!userId || !UUID_PATTERN.test(userId)) {
        throw new AgentSkillError(
            "Agent Skill intended user identity is invalid",
            400,
            "INVALID_SKILL_IDENTITY"
        );
    }
    return `agent-skill-${userId}-${name}`;
}

export function hasRecordIdShape(type: AgentSkillType, id: string): boolean {
    const match =
        type === "system"
            ? SYSTEM_RECORD_ID_PATTERN.exec(id)
            : USER_RECORD_ID_PATTERN.exec(id);
    if (!match) return false;
    const userId = type === "system" ? undefined : match[1];
    const name = type === "system" ? id.slice("agent-skill-".length) : match[2];
    try {
        return agentSkillRecordId(type, userId, name) === id;
    } catch {
        return false;
    }
}

export class AgentSkillError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code: string,
        public readonly retryable = false,
        public readonly recordId?: string,
        /** Safe, structured remedy data returned to the caller. */
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
    }
}

export function archiveKey(
    type: AgentSkillType,
    userId: string | undefined,
    recordId: string
): string {
    if (type === "user" && !userId) {
        throw new AgentSkillError(
            "Agent Skill intended user identity is invalid",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    return type === "system"
        ? `agent-services/skills/system-skills/${recordId}.zip`
        : `agent-services/skills/user-skills/${userId}/${recordId}.zip`;
}

export function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function requiredString(
    value: unknown,
    field: string,
    pattern?: RegExp
): string {
    if (
        typeof value !== "string" ||
        !value ||
        (pattern && !pattern.test(value))
    ) {
        throw new AgentSkillError(
            `Agent Skill record has invalid ${field}`,
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    return value;
}

export function parseAgentSkillRecord(raw: unknown): AgentSkillRecord {
    if (!isObject(raw) || !isObject(raw.aspects)) {
        throw new AgentSkillError(
            "Registry record is not a valid Agent Skill",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const aspect = raw.aspects["agent-skill"];
    const accessControl = raw.aspects["access-control"];
    if (!isObject(aspect) || !isObject(accessControl)) {
        throw new AgentSkillError(
            "Registry record is missing required Agent Skill aspects",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    // A publication is never also an installation (#3861).
    if (raw.aspects["agent-skill-installation"] !== undefined) {
        throw new AgentSkillError(
            "Registry record is not a valid Agent Skill",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const id = requiredString(raw.id, "id");
    const type = requiredString(aspect.type, "type") as AgentSkillType;
    if (type !== "system" && type !== "user") {
        throw new AgentSkillError(
            "Agent Skill record has invalid type",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const userId =
        type === "user"
            ? requiredString(aspect.userId, "userId", UUID_PATTERN)
            : undefined;
    if (type === "system" && aspect.userId !== undefined) {
        throw new AgentSkillError(
            "System Agent Skill records must omit userId",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const rawName = requiredString(raw.name, "name");
    const aspectName = requiredString(aspect.name, "agent-skill.name");
    const rawDescription = requiredString(aspect.description, "description");
    let name: string;
    let description: string;
    try {
        ({ name, description } = validateAgentSkillMetadata(
            rawName,
            rawDescription
        ));
        validateAgentSkillNameForType(name, type);
    } catch {
        throw new AgentSkillError(
            "Agent Skill record has invalid derived metadata",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    if (
        name !== rawName ||
        aspectName !== rawName ||
        description !== rawDescription
    ) {
        throw new AgentSkillError(
            "Agent Skill record has inconsistent derived metadata",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const ownerId = requiredString(
        accessControl.ownerId,
        "ownerId",
        UUID_PATTERN
    );
    if (id !== agentSkillRecordId(type, userId, name)) {
        throw new AgentSkillError(
            "Agent Skill record identity is inconsistent",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const state = requiredString(aspect.state, "state") as AgentSkillState;
    if (!(["PENDING", "READY", "DELETING"] as string[]).includes(state)) {
        throw new AgentSkillError(
            "Agent Skill record has invalid state",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const createdAt = requiredString(aspect.createdAt, "createdAt");
    const updatedAt = requiredString(aspect.updatedAt, "updatedAt");
    if (
        !Number.isFinite(Date.parse(createdAt)) ||
        !Number.isFinite(Date.parse(updatedAt))
    ) {
        throw new AgentSkillError(
            "Agent Skill record has invalid timestamps",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const createdBy = requiredString(
        aspect.createdBy,
        "createdBy",
        UUID_PATTERN
    );
    const updatedBy = requiredString(
        aspect.updatedBy,
        "updatedBy",
        UUID_PATTERN
    );
    const checksum = requiredString(
        aspect.checksum,
        "checksum",
        CHECKSUM_PATTERN
    );
    const expectedArchiveKey = archiveKey(type, userId, id);
    if (aspect.archiveKey !== expectedArchiveKey) {
        throw new AgentSkillError(
            "Agent Skill record archive path is inconsistent",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    if (
        accessControl.preAuthorisedPermissionIds !== undefined &&
        (!Array.isArray(accessControl.preAuthorisedPermissionIds) ||
            accessControl.preAuthorisedPermissionIds.some(
                (value) => typeof value !== "string"
            ))
    ) {
        throw new AgentSkillError(
            "Agent Skill record has invalid pre-authorised permissions",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    if (
        accessControl.orgUnitId !== undefined &&
        typeof accessControl.orgUnitId !== "string"
    ) {
        throw new AgentSkillError(
            "Agent Skill record has invalid organisation unit",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    if (
        accessControl.constraintExemption !== undefined &&
        typeof accessControl.constraintExemption !== "boolean"
    ) {
        throw new AgentSkillError(
            "Agent Skill record has invalid constraint exemption",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    return {
        id,
        name,
        ...(typeof raw.tenantId === "number" ? { tenantId: raw.tenantId } : {}),
        aspects: {
            "agent-skill": {
                name,
                type,
                ...(userId ? { userId } : {}),
                createdAt,
                createdBy,
                description,
                archiveKey: expectedArchiveKey,
                updatedAt,
                updatedBy,
                checksum,
                state
            },
            "access-control": {
                ownerId,
                ...(accessControl.orgUnitId !== undefined
                    ? { orgUnitId: accessControl.orgUnitId as string }
                    : {}),
                ...(accessControl.preAuthorisedPermissionIds
                    ? {
                          preAuthorisedPermissionIds: accessControl.preAuthorisedPermissionIds as string[]
                      }
                    : {}),
                ...(accessControl.constraintExemption !== undefined
                    ? {
                          constraintExemption: accessControl.constraintExemption as boolean
                      }
                    : {})
            }
        }
    };
}

export function metadata(record: AgentSkillRecord): AgentSkillMetadata {
    const aspect = record.aspects["agent-skill"];
    return {
        id: record.id,
        name: aspect.name,
        description: aspect.description,
        type: aspect.type,
        ...(aspect.userId ? { userId: aspect.userId } : {}),
        ownerId: record.aspects["access-control"].ownerId,
        createdAt: aspect.createdAt,
        createdBy: aspect.createdBy,
        updatedAt: aspect.updatedAt,
        updatedBy: aspect.updatedBy,
        checksum: aspect.checksum
    };
}

export function downstreamError(
    error: unknown,
    recordId?: string
): AgentSkillError {
    if (error instanceof AgentSkillError) return error;
    if (error instanceof ArchiveValidationError) {
        return new AgentSkillError(error.message, 400, "INVALID_SKILL_ARCHIVE");
    }
    if (error instanceof DownstreamServiceError) {
        const status = [400, 401, 403, 404, 409].includes(error.status)
            ? error.status
            : 503;
        return new AgentSkillError(
            error.message,
            status,
            `${error.service.toUpperCase()}_ERROR`,
            status >= 500,
            recordId
        );
    }
    return new AgentSkillError(
        "Agent Skill operation failed",
        500,
        "AGENT_SKILL_ERROR",
        true,
        recordId
    );
}
