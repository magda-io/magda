import {
    ArchiveValidationError,
    validateAgentSkillArchive,
    validateAgentSkillMetadata,
    validateAgentSkillNameForType
} from "./archive.js";
import { DownstreamServiceError } from "./clients.js";
import {
    AgentSkillArchiveLimits,
    AgentSkillAuthorization,
    AgentSkillMetadata,
    AgentSkillRecord,
    AgentSkillRegistry,
    AgentSkillType,
    AgentSkillState,
    AgentSkillStorage,
    ValidatedAgentSkillArchive,
    WorkspaceSkillManifest,
    WorkspaceSkillManifestItem,
    WorkspaceSkillManifestWarning,
    WorkspaceSkillSourceKind
} from "./types.js";
import { AuthenticatedUser } from "../types.js";
import jwt from "jsonwebtoken";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USER_RECORD_ID_PATTERN = /^agent-skill-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SYSTEM_RECORD_ID_PATTERN = /^agent-skill-system-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;

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

function hasRecordIdShape(type: AgentSkillType, id: string): boolean {
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
        public readonly recordId?: string
    ) {
        super(message);
    }
}

export interface AgentSkillServiceOptions {
    registry: AgentSkillRegistry;
    storage: AgentSkillStorage;
    authorization: AgentSkillAuthorization;
    archiveLimits: AgentSkillArchiveLimits;
    tenantId: number;
    jwtSecret: string;
    now?: () => Date;
}

export interface AgentSkillListRequest {
    type: AgentSkillType | "all";
    userId?: "current" | "!current";
    pageToken?: string;
    limit: number;
    q?: string;
}

function archiveKey(
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

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
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

function sameRecordVersion(
    left: AgentSkillRecord,
    right: AgentSkillRecord
): boolean {
    const leftAspect = left.aspects["agent-skill"];
    const rightAspect = right.aspects["agent-skill"];
    const leftPermissions =
        left.aspects["access-control"].preAuthorisedPermissionIds || [];
    const rightPermissions =
        right.aspects["access-control"].preAuthorisedPermissionIds || [];
    return (
        left.id === right.id &&
        left.name === right.name &&
        leftAspect.name === rightAspect.name &&
        left.tenantId === right.tenantId &&
        left.aspects["access-control"].ownerId ===
            right.aspects["access-control"].ownerId &&
        left.aspects["access-control"].orgUnitId ===
            right.aspects["access-control"].orgUnitId &&
        left.aspects["access-control"].constraintExemption ===
            right.aspects["access-control"].constraintExemption &&
        leftPermissions.length === rightPermissions.length &&
        leftPermissions.every(
            (permission, index) => permission === rightPermissions[index]
        ) &&
        leftAspect.type === rightAspect.type &&
        leftAspect.userId === rightAspect.userId &&
        leftAspect.createdAt === rightAspect.createdAt &&
        leftAspect.createdBy === rightAspect.createdBy &&
        leftAspect.description === rightAspect.description &&
        leftAspect.archiveKey === rightAspect.archiveKey &&
        leftAspect.updatedAt === rightAspect.updatedAt &&
        leftAspect.updatedBy === rightAspect.updatedBy &&
        leftAspect.checksum === rightAspect.checksum &&
        leftAspect.state === rightAspect.state
    );
}

function metadata(record: AgentSkillRecord): AgentSkillMetadata {
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

function downstreamError(error: unknown, recordId?: string): AgentSkillError {
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

export class AgentSkillService {
    private readonly registry: AgentSkillRegistry;
    private readonly storage: AgentSkillStorage;
    private readonly authorization: AgentSkillAuthorization;
    private readonly limits: AgentSkillArchiveLimits;
    private readonly tenantId: number;
    private readonly jwtSecret: string;
    private readonly now: () => Date;
    private readonly mutationQueues = new Map<string, Promise<void>>();

    constructor(options: AgentSkillServiceOptions) {
        this.registry = options.registry;
        this.storage = options.storage;
        this.authorization = options.authorization;
        this.limits = options.archiveLimits;
        this.tenantId = options.tenantId;
        this.jwtSecret = options.jwtSecret;
        this.now = options.now || (() => new Date());
    }

    private internalSession(): string {
        return jwt.sign({ userId: DEFAULT_ADMIN_USER_ID }, this.jwtSecret, {
            algorithm: "HS256",
            expiresIn: "2m"
        });
    }

    private exclusive<T>(
        recordId: string,
        operation: () => Promise<T>
    ): Promise<T> {
        const previous = this.mutationQueues.get(recordId) || Promise.resolve();
        const result = previous.then(operation, operation);
        const settled = result.then(
            () => undefined,
            () => undefined
        );
        this.mutationQueues.set(recordId, settled);
        settled.finally(() => {
            if (this.mutationQueues.get(recordId) === settled) {
                this.mutationQueues.delete(recordId);
            }
        });
        return result;
    }

    private requireArchiveIdentity(
        identity: {
            exists: boolean;
            recordId?: string;
            ownerId?: string;
        },
        record: AgentSkillRecord,
        required: boolean
    ): void {
        if (
            (required && !identity.exists) ||
            (identity.exists &&
                (identity.recordId !== record.id ||
                    identity.ownerId !==
                        record.aspects["access-control"].ownerId))
        ) {
            throw new AgentSkillError(
                "Published Agent Skill archive linkage is inconsistent",
                409,
                "AGENT_SKILL_ARCHIVE_LINK_INVALID"
            );
        }
    }

    private syntheticRecord(
        type: AgentSkillType,
        ownerId: string,
        requestedName?: string
    ): AgentSkillRecord {
        const now = this.now().toISOString();
        const name =
            requestedName ||
            (type === "system"
                ? "system-authorization-check"
                : "authorization-check");
        const userId = type === "user" ? ownerId : undefined;
        const id = agentSkillRecordId(type, userId, name);
        return {
            id,
            name,
            tenantId: this.tenantId,
            aspects: {
                "agent-skill": {
                    name,
                    type,
                    ...(userId ? { userId } : {}),
                    createdAt: now,
                    createdBy: ownerId,
                    description: "Authorization check",
                    archiveKey: archiveKey(type, userId, id),
                    updatedAt: now,
                    updatedBy: ownerId,
                    checksum: "0".repeat(64),
                    state: "PENDING"
                },
                "access-control": {
                    ownerId,
                    preAuthorisedPermissionIds: [],
                    ...(type === "system" ? { constraintExemption: true } : {})
                }
            }
        };
    }

    private async requirePermission(
        operation: "create" | "read" | "update" | "delete",
        record: AgentSkillRecord,
        user: AuthenticatedUser
    ): Promise<void> {
        if (
            !(await this.authorization.can(
                operation,
                record,
                user.sessionToken
            ))
        ) {
            throw new AgentSkillError(
                `You are not permitted to ${operation} this Agent Skill`,
                403,
                "AGENT_SKILL_FORBIDDEN"
            );
        }
    }

    async prepareCreate(
        type: AgentSkillType,
        user: AuthenticatedUser
    ): Promise<void> {
        const proposed = this.syntheticRecord(type, user.id);
        // This early admission check intentionally requires only the public
        // operation. Internal PENDING -> READY transitions use the service's
        // short-lived administrator session after caller authorization.
        await this.requirePermission("create", proposed, user);
    }

    async prepareExisting(
        type: AgentSkillType,
        id: string,
        operation: "read" | "update" | "delete",
        user: AuthenticatedUser
    ): Promise<AgentSkillRecord> {
        if (!hasRecordIdShape(type, id)) {
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        }
        const raw = await this.registry.get(
            id,
            operation === "read" ? user.sessionToken : this.internalSession()
        );
        if (!raw) {
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        }
        let record: AgentSkillRecord;
        try {
            record = parseAgentSkillRecord(raw);
        } catch {
            // Privileged mutation lookup must not disclose malformed protected
            // record details before the real caller is authorized.
            if (operation !== "read") {
                throw new AgentSkillError(
                    "Agent Skill not found",
                    404,
                    "AGENT_SKILL_NOT_FOUND"
                );
            }
            throw new AgentSkillError(
                "Registry record is not a valid Agent Skill",
                409,
                "INVALID_SKILL_RECORD"
            );
        }
        if (record.aspects["agent-skill"].type !== type) {
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        }
        try {
            await this.requirePermission(operation, record, user);
        } catch (error) {
            if (
                operation !== "read" &&
                error instanceof AgentSkillError &&
                error.code === "AGENT_SKILL_FORBIDDEN"
            ) {
                throw new AgentSkillError(
                    "Agent Skill not found",
                    404,
                    "AGENT_SKILL_NOT_FOUND"
                );
            }
            throw error;
        }
        return record;
    }

    private buildRecord(
        id: string,
        type: AgentSkillType,
        ownerId: string,
        userId: string | undefined,
        archive: ValidatedAgentSkillArchive,
        state: AgentSkillState,
        createdAt: string,
        createdBy: string,
        updatedAt: string,
        updatedBy: string
    ): AgentSkillRecord {
        return {
            id,
            name: archive.name,
            tenantId: this.tenantId,
            aspects: {
                "agent-skill": {
                    name: archive.name,
                    type,
                    ...(userId ? { userId } : {}),
                    createdAt,
                    createdBy,
                    description: archive.description,
                    archiveKey: archiveKey(type, userId, id),
                    updatedAt,
                    updatedBy,
                    checksum: archive.checksum,
                    state
                },
                "access-control": {
                    ownerId,
                    preAuthorisedPermissionIds: [],
                    ...(type === "system" ? { constraintExemption: true } : {})
                }
            }
        };
    }

    private audit(
        operation: "create" | "update" | "delete",
        record: AgentSkillRecord,
        user: AuthenticatedUser,
        result: "success" | "failure",
        code?: string
    ): void {
        console.info(
            JSON.stringify({
                event: "agent-skill-mutation",
                actorId: user.id,
                operation,
                recordId: record.id,
                type: record.aspects["agent-skill"].type,
                result,
                ...(code ? { code } : {})
            })
        );
    }

    private recoverCreate(
        raw: unknown,
        id: string,
        type: AgentSkillType,
        ownerId: string,
        archive: ValidatedAgentSkillArchive
    ): AgentSkillRecord {
        let existing: AgentSkillRecord;
        try {
            existing = parseAgentSkillRecord(raw);
        } catch {
            throw new AgentSkillError(
                "Agent Skill name is already in use",
                409,
                "AGENT_SKILL_ID_CONFLICT",
                false,
                id
            );
        }
        const aspect = existing.aspects["agent-skill"];
        const userId = type === "user" ? ownerId : undefined;
        if (
            !["PENDING", "READY"].includes(aspect.state) ||
            aspect.type !== type ||
            aspect.userId !== userId ||
            existing.aspects["access-control"].ownerId !== ownerId ||
            aspect.createdBy !== ownerId ||
            aspect.updatedBy !== ownerId ||
            aspect.checksum !== archive.checksum ||
            aspect.name !== archive.name ||
            aspect.description !== archive.description ||
            (existing.tenantId !== undefined &&
                existing.tenantId !== this.tenantId)
        ) {
            throw new AgentSkillError(
                "Agent Skill name is already in use",
                409,
                "AGENT_SKILL_ID_CONFLICT",
                false,
                id
            );
        }
        return existing;
    }

    async createAuthorized(
        type: AgentSkillType,
        bytes: Buffer,
        user: AuthenticatedUser
    ): Promise<AgentSkillMetadata> {
        let archive: ValidatedAgentSkillArchive;
        try {
            archive = await validateAgentSkillArchive(bytes, type, this.limits);
        } catch (error) {
            const mapped = downstreamError(error);
            this.audit(
                "create",
                this.syntheticRecord(type, user.id),
                user,
                "failure",
                mapped.code
            );
            throw mapped;
        }
        const userId = type === "user" ? user.id : undefined;
        const id = agentSkillRecordId(type, userId, archive.name);
        return await this.exclusive(id, async () => {
            let auditRecord = this.syntheticRecord(type, user.id, archive.name);
            try {
                const createdAt = this.now().toISOString();
                const candidate = this.buildRecord(
                    id,
                    type,
                    user.id,
                    userId,
                    archive,
                    "PENDING",
                    createdAt,
                    user.id,
                    createdAt,
                    user.id
                );
                // Never perform a privileged lookup or lifecycle write unless
                // the real caller is authorized for this exact publication.
                await this.requirePermission("create", candidate, user);
                const internalSession = this.internalSession();
                const existingRaw = await this.registry.get(
                    id,
                    internalSession
                );
                let pending: AgentSkillRecord;
                if (existingRaw) {
                    pending = this.recoverCreate(
                        existingRaw,
                        id,
                        type,
                        user.id,
                        archive
                    );
                } else {
                    pending = candidate;
                    try {
                        // Initial creation remains attributed to the real actor.
                        await this.registry.create(pending, user.sessionToken);
                    } catch (error) {
                        if (
                            error instanceof DownstreamServiceError &&
                            ![400, 409].includes(error.status) &&
                            error.status < 500
                        ) {
                            throw error;
                        }
                        const recovered = await this.registry.get(
                            id,
                            internalSession
                        );
                        if (!recovered) {
                            if (
                                error instanceof DownstreamServiceError &&
                                [400, 409].includes(error.status)
                            ) {
                                throw new AgentSkillError(
                                    "Agent Skill name is already in use",
                                    409,
                                    "AGENT_SKILL_ID_CONFLICT",
                                    false,
                                    id
                                );
                            }
                            throw error;
                        }
                        pending = this.recoverCreate(
                            recovered,
                            id,
                            type,
                            user.id,
                            archive
                        );
                    }
                }
                auditRecord = pending;
                // Recheck the same requested operation against authoritative
                // state before any administrator-authorized mutation.
                await this.requirePermission("create", pending, user);
                const stored = await this.storage.inspect(
                    pending.aspects["agent-skill"].archiveKey,
                    internalSession
                );
                this.requireArchiveIdentity(stored, pending, false);
                await this.storage.upload(
                    pending.aspects["agent-skill"].archiveKey,
                    id,
                    bytes,
                    stored.exists ? internalSession : user.sessionToken
                );
                this.requireArchiveIdentity(
                    await this.storage.inspect(
                        pending.aspects["agent-skill"].archiveKey,
                        internalSession
                    ),
                    pending,
                    true
                );
                if (pending.aspects["agent-skill"].state === "READY") {
                    this.audit("create", pending, user, "success");
                    return metadata(pending);
                }
                const ready: AgentSkillRecord = {
                    ...pending,
                    aspects: {
                        ...pending.aspects,
                        "agent-skill": {
                            ...pending.aspects["agent-skill"],
                            state: "READY",
                            updatedAt: this.now().toISOString(),
                            updatedBy: user.id
                        }
                    }
                };
                await this.registry.put(ready, internalSession);
                this.audit("create", ready, user, "success");
                return metadata(ready);
            } catch (error) {
                const mapped = downstreamError(error, id);
                this.audit("create", auditRecord, user, "failure", mapped.code);
                throw mapped;
            }
        });
    }

    async replaceAuthorized(
        existing: AgentSkillRecord,
        bytes: Buffer,
        user: AuthenticatedUser,
        expectedChecksum?: string
    ): Promise<AgentSkillMetadata> {
        return await this.exclusive(existing.id, async () => {
            try {
                const internalSession = this.internalSession();
                const currentRaw = await this.registry.get(
                    existing.id,
                    internalSession
                );
                if (!currentRaw) {
                    throw new AgentSkillError(
                        "Agent Skill not found",
                        404,
                        "AGENT_SKILL_NOT_FOUND"
                    );
                }
                const current = parseAgentSkillRecord(currentRaw);
                await this.requirePermission("update", current, user);
                if (
                    expectedChecksum &&
                    current.aspects["agent-skill"].checksum !== expectedChecksum
                ) {
                    throw new AgentSkillError(
                        "Agent Skill changed since it was last read",
                        412,
                        "AGENT_SKILL_PRECONDITION_FAILED"
                    );
                }
                if (current.aspects["agent-skill"].state === "DELETING") {
                    throw new AgentSkillError(
                        "Agent Skill is being deleted",
                        409,
                        "AGENT_SKILL_DELETING"
                    );
                }
                const type = current.aspects["agent-skill"].type;
                const ownerId = current.aspects["access-control"].ownerId;
                if (!sameRecordVersion(current, existing)) {
                    throw new AgentSkillError(
                        "Agent Skill changed during replacement",
                        409,
                        "AGENT_SKILL_VERSION_CONFLICT"
                    );
                }
                const archive = await validateAgentSkillArchive(
                    bytes,
                    type,
                    this.limits
                );
                if (archive.name !== current.aspects["agent-skill"].name) {
                    throw new AgentSkillError(
                        "Agent Skill names are immutable; publish a new skill to rename it",
                        409,
                        "AGENT_SKILL_NAME_IMMUTABLE"
                    );
                }
                if (
                    current.aspects["agent-skill"].state === "PENDING" &&
                    current.aspects["agent-skill"].checksum !== archive.checksum
                ) {
                    throw new AgentSkillError(
                        "A different Agent Skill replacement is already pending",
                        409,
                        "AGENT_SKILL_PENDING_CONFLICT"
                    );
                }
                const stored = await this.storage.inspect(
                    current.aspects["agent-skill"].archiveKey,
                    internalSession
                );
                if (!stored.exists) {
                    throw new AgentSkillError(
                        "Existing Agent Skill archive is missing; replacement was not attempted",
                        409,
                        "AGENT_SKILL_ARCHIVE_MISSING"
                    );
                }
                this.requireArchiveIdentity(stored, current, true);
                const nextPending = this.buildRecord(
                    current.id,
                    type,
                    ownerId,
                    current.aspects["agent-skill"].userId,
                    archive,
                    "PENDING",
                    current.aspects["agent-skill"].createdAt,
                    current.aspects["agent-skill"].createdBy,
                    current.aspects["agent-skill"].updatedAt,
                    current.aspects["agent-skill"].updatedBy
                );
                const pending: AgentSkillRecord = {
                    ...nextPending,
                    aspects: {
                        ...nextPending.aspects,
                        "access-control": {
                            ...current.aspects["access-control"],
                            ...(current.aspects["access-control"]
                                .preAuthorisedPermissionIds
                                ? {
                                      preAuthorisedPermissionIds: [
                                          ...current.aspects["access-control"]
                                              .preAuthorisedPermissionIds!
                                      ]
                                  }
                                : {})
                        }
                    }
                };
                await this.registry.put(pending, user.sessionToken);
                await this.storage.upload(
                    pending.aspects["agent-skill"].archiveKey,
                    current.id,
                    bytes,
                    user.sessionToken
                );
                this.requireArchiveIdentity(
                    await this.storage.inspect(
                        pending.aspects["agent-skill"].archiveKey,
                        internalSession
                    ),
                    pending,
                    true
                );
                const ready: AgentSkillRecord = {
                    ...pending,
                    aspects: {
                        ...pending.aspects,
                        "agent-skill": {
                            ...pending.aspects["agent-skill"],
                            state: "READY",
                            updatedAt: this.now().toISOString(),
                            updatedBy: user.id
                        }
                    }
                };
                await this.registry.put(ready, user.sessionToken);
                this.audit("update", ready, user, "success");
                return metadata(ready);
            } catch (error) {
                const mapped = downstreamError(error, existing.id);
                this.audit("update", existing, user, "failure", mapped.code);
                throw mapped;
            }
        });
    }

    async deleteAuthorized(
        existing: AgentSkillRecord,
        user: AuthenticatedUser,
        expectedChecksum?: string
    ): Promise<void> {
        await this.exclusive(existing.id, async () => {
            try {
                const internalSession = this.internalSession();
                const raw = await this.registry.get(
                    existing.id,
                    internalSession
                );
                if (!raw) {
                    throw new AgentSkillError(
                        "Agent Skill not found",
                        404,
                        "AGENT_SKILL_NOT_FOUND"
                    );
                }
                const current = parseAgentSkillRecord(raw);
                await this.requirePermission("delete", current, user);
                if (
                    expectedChecksum &&
                    current.aspects["agent-skill"].checksum !== expectedChecksum
                ) {
                    throw new AgentSkillError(
                        "Agent Skill changed since it was last read",
                        412,
                        "AGENT_SKILL_PRECONDITION_FAILED"
                    );
                }
                if (
                    current.aspects["agent-skill"].type !==
                        existing.aspects["agent-skill"].type ||
                    current.aspects["agent-skill"].userId !==
                        existing.aspects["agent-skill"].userId ||
                    current.aspects["access-control"].ownerId !==
                        existing.aspects["access-control"].ownerId ||
                    current.aspects["agent-skill"].archiveKey !==
                        existing.aspects["agent-skill"].archiveKey
                ) {
                    throw new AgentSkillError(
                        "Agent Skill immutable metadata changed during deletion",
                        409,
                        "AGENT_SKILL_IMMUTABLE_CONFLICT"
                    );
                }
                const stored = await this.storage.inspect(
                    current.aspects["agent-skill"].archiveKey,
                    internalSession
                );
                this.requireArchiveIdentity(stored, current, false);
                const deleting: AgentSkillRecord =
                    current.aspects["agent-skill"].state === "DELETING"
                        ? current
                        : {
                              ...current,
                              aspects: {
                                  ...current.aspects,
                                  "agent-skill": {
                                      ...current.aspects["agent-skill"],
                                      state: "DELETING"
                                  }
                              }
                          };
                if (deleting !== current) {
                    await this.registry.put(deleting, internalSession);
                }
                await this.storage.delete(
                    deleting.aspects["agent-skill"].archiveKey,
                    user.sessionToken
                );
                await this.registry.delete(deleting.id, user.sessionToken);
                this.audit("delete", deleting, user, "success");
            } catch (error) {
                const mapped = downstreamError(error, existing.id);
                this.audit("delete", existing, user, "failure", mapped.code);
                throw mapped;
            }
        });
    }

    async readAuthorized(
        record: AgentSkillRecord
    ): Promise<AgentSkillMetadata> {
        if (record.aspects["agent-skill"].state !== "READY") {
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        }
        return metadata(record);
    }

    async downloadAuthorized(
        record: AgentSkillRecord,
        user: AuthenticatedUser
    ): Promise<Buffer> {
        if (record.aspects["agent-skill"].state !== "READY") {
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        }
        const downloaded = await this.storage.download(
            record.aspects["agent-skill"].archiveKey,
            user.sessionToken,
            this.limits.maxCompressedBytes
        );
        this.requireArchiveIdentity(
            {
                exists: true,
                recordId: downloaded.recordId,
                ownerId: downloaded.ownerId
            },
            record,
            true
        );
        if (
            downloaded.contentType.split(";", 1)[0].trim() !== "application/zip"
        ) {
            throw new AgentSkillError(
                "Published Agent Skill archive has an invalid content type",
                409,
                "INVALID_PUBLISHED_ARCHIVE"
            );
        }
        let archive: ValidatedAgentSkillArchive;
        try {
            archive = await validateAgentSkillArchive(
                downloaded.bytes,
                record.aspects["agent-skill"].type,
                this.limits
            );
        } catch {
            throw new AgentSkillError(
                "Published Agent Skill archive is invalid",
                409,
                "INVALID_PUBLISHED_ARCHIVE"
            );
        }
        if (
            archive.checksum !== record.aspects["agent-skill"].checksum ||
            archive.name !== record.aspects["agent-skill"].name ||
            archive.description !== record.aspects["agent-skill"].description
        ) {
            throw new AgentSkillError(
                "Published Agent Skill metadata and archive are inconsistent",
                409,
                "INVALID_PUBLISHED_ARCHIVE"
            );
        }
        return downloaded.bytes;
    }

    private async workspaceManifestSource(
        sourceKind: Exclude<WorkspaceSkillSourceKind, "installation">,
        user: AuthenticatedUser
    ): Promise<{
        items: WorkspaceSkillManifestItem[];
        warnings: WorkspaceSkillManifestWarning[];
    }> {
        const items: WorkspaceSkillManifestItem[] = [];
        const warnings: WorkspaceSkillManifestWarning[] = [];
        const warn = (warning: WorkspaceSkillManifestWarning) => {
            if (warnings.length < 100) warnings.push(warning);
        };
        const seenTokens = new Set<string>();
        const seenIds = new Set<string>();
        let pageToken: string | undefined;
        do {
            const page = await this.registry.list(
                sourceKind === "system-publication"
                    ? {
                          type: "system",
                          state: "READY",
                          limit: 100,
                          ...(pageToken ? { pageToken } : {})
                      }
                    : {
                          type: "user",
                          state: "READY",
                          userId: { operator: "eq", value: user.id },
                          limit: 100,
                          ...(pageToken ? { pageToken } : {})
                      },
                user.sessionToken
            );
            for (const raw of page.records) {
                const rawId =
                    isObject(raw) && typeof raw.id === "string"
                        ? raw.id
                        : undefined;
                let record: AgentSkillRecord;
                try {
                    record = parseAgentSkillRecord(raw);
                } catch {
                    warn({
                        sourceKind,
                        code: "INVALID_RECORD",
                        ...(rawId ? { recordId: rawId } : {})
                    });
                    continue;
                }
                const aspect = record.aspects["agent-skill"];
                const belongs =
                    aspect.state === "READY" &&
                    (sourceKind === "system-publication"
                        ? aspect.type === "system" &&
                          aspect.userId === undefined
                        : aspect.type === "user" && aspect.userId === user.id);
                if (!belongs) {
                    warn({
                        sourceKind,
                        code: "INVALID_RECORD",
                        recordId: record.id
                    });
                    continue;
                }
                if (seenIds.has(record.id)) {
                    warn({
                        sourceKind,
                        code: "DUPLICATE_RECORD",
                        recordId: record.id
                    });
                    continue;
                }
                seenIds.add(record.id);
                if (
                    !(await this.authorization.can(
                        "read",
                        record,
                        user.sessionToken
                    ))
                ) {
                    warn({
                        sourceKind,
                        code: "READ_DENIED",
                        recordId: record.id
                    });
                    continue;
                }
                items.push({
                    selectionId: record.id,
                    effectiveName: aspect.name,
                    sourceKind,
                    source: metadata(record)
                });
            }
            if (!page.hasMore) break;
            const next = page.nextPageToken;
            if (!next || seenTokens.has(next)) {
                throw new DownstreamServiceError(
                    "registry",
                    502,
                    "Registry returned an invalid Agent Skill manifest page"
                );
            }
            seenTokens.add(next);
            pageToken = next;
        } while (true);
        return { items, warnings };
    }

    async getWorkspaceSkillManifest(
        user: AuthenticatedUser
    ): Promise<WorkspaceSkillManifest> {
        // Keep source traversals independent. #3861 can add an installation
        // resolver without changing publication pagination or source authority.
        const system = await this.workspaceManifestSource(
            "system-publication",
            user
        );
        const own = await this.workspaceManifestSource(
            "own-user-publication",
            user
        );
        const items = [...system.items, ...own.items].sort(
            (left, right) =>
                left.effectiveName.localeCompare(right.effectiveName) ||
                left.selectionId.localeCompare(right.selectionId)
        );
        return {
            version: 1,
            complete: true,
            items,
            warnings: [...system.warnings, ...own.warnings].slice(0, 100),
            sources: {
                system: { complete: true, count: system.items.length },
                user: { complete: true, count: own.items.length },
                installations: { status: "notImplemented", count: 0 }
            }
        };
    }

    async list(
        request: AgentSkillListRequest,
        user: AuthenticatedUser
    ): Promise<{
        records: AgentSkillMetadata[];
        hasMore: boolean;
        nextPageToken?: string;
    }> {
        const userSelector =
            request.userId ||
            (request.type === "user" ? ("current" as const) : undefined);
        const requestedTypes = new Set<AgentSkillType>(
            userSelector
                ? ["user"]
                : request.type === "all"
                ? ["system", "user"]
                : [request.type]
        );
        // Registry applies both catalogue membership and record-level OPA before
        // keyset pagination. In particular, the default All view is one SQL
        // query for READY (system OR current-user) records, avoiding an
        // unmergeable pair of independent cursors.
        const result = await this.registry.list(
            {
                ...(userSelector
                    ? {
                          type: "user" as const,
                          userId: {
                              operator: userSelector.startsWith("!")
                                  ? ("neq" as const)
                                  : ("eq" as const),
                              value: user.id
                          }
                      }
                    : request.type === "all"
                    ? {
                          anyOf: [
                              {
                                  field: "type" as const,
                                  operator: "eq" as const,
                                  value: "system"
                              },
                              {
                                  field: "userId" as const,
                                  operator: "eq" as const,
                                  value: user.id
                              }
                          ]
                      }
                    : { type: request.type }),
                state: "READY",
                pageToken: request.pageToken,
                limit: request.limit,
                q: request.q
            },
            user.sessionToken
        );
        const records: AgentSkillMetadata[] = [];
        for (const raw of result.records) {
            let record: AgentSkillRecord;
            try {
                record = parseAgentSkillRecord(raw);
            } catch {
                const recordId =
                    isObject(raw) && typeof raw.id === "string"
                        ? raw.id
                        : "unknown";
                console.warn(
                    JSON.stringify({
                        event: "agent-skill-invalid-catalogue-record",
                        recordId
                    })
                );
                continue;
            }
            const aspect = record.aspects["agent-skill"];
            const isRequestedPublication = userSelector
                ? aspect.type === "user" &&
                  (userSelector === "current"
                      ? aspect.userId === user.id
                      : aspect.userId !== user.id)
                : request.type === "all"
                ? aspect.type === "system" || aspect.userId === user.id
                : requestedTypes.has(aspect.type);
            if (
                aspect.state !== "READY" ||
                !isRequestedPublication ||
                !(await this.authorization.can(
                    "read",
                    record,
                    user.sessionToken
                ))
            ) {
                continue;
            }
            records.push(metadata(record));
        }
        return {
            records,
            hasMore: result.hasMore,
            ...(result.nextPageToken
                ? { nextPageToken: result.nextPageToken }
                : {})
        };
    }
}
