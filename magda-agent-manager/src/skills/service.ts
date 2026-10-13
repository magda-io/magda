import {
    ArchiveValidationError,
    validateAgentSkillArchive,
    validateAgentSkillMetadata,
    validateAgentSkillNameForScope
} from "./archive.js";
import { DownstreamServiceError } from "./clients.js";
import {
    AgentSkillArchiveLimits,
    AgentSkillAuthorization,
    AgentSkillMetadata,
    AgentSkillRecord,
    AgentSkillRegistry,
    AgentSkillScope,
    AgentSkillState,
    AgentSkillStorage,
    ValidatedAgentSkillArchive
} from "./types.js";
import { AuthenticatedUser } from "../types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USER_RECORD_ID_PATTERN = /^agent-skill-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SYSTEM_RECORD_ID_PATTERN = /^agent-skill-system-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;

export function agentSkillRecordId(
    scope: AgentSkillScope,
    ownerId: string,
    name: string
): string {
    try {
        validateAgentSkillMetadata(name, "identity");
        validateAgentSkillNameForScope(name, scope);
    } catch {
        throw new AgentSkillError(
            "Agent Skill identity is invalid",
            400,
            "INVALID_SKILL_IDENTITY"
        );
    }
    if (!UUID_PATTERN.test(ownerId)) {
        throw new AgentSkillError(
            "Agent Skill owner identity is invalid",
            400,
            "INVALID_SKILL_IDENTITY"
        );
    }
    return scope === "system"
        ? `agent-skill-${name}`
        : `agent-skill-${ownerId}-${name}`;
}

function hasRecordIdShape(scope: AgentSkillScope, id: string): boolean {
    const match =
        scope === "system"
            ? SYSTEM_RECORD_ID_PATTERN.exec(id)
            : USER_RECORD_ID_PATTERN.exec(id);
    if (!match) return false;
    const ownerId =
        scope === "system" ? "00000000-0000-4000-8000-000000000000" : match[1];
    const name =
        scope === "system" ? id.slice("agent-skill-".length) : match[2];
    try {
        return agentSkillRecordId(scope, ownerId, name) === id;
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
    now?: () => Date;
}

export interface AgentSkillListRequest {
    scope: AgentSkillScope | "all";
    pageToken?: string;
    limit: number;
    q?: string;
}

function archiveKey(
    scope: AgentSkillScope,
    ownerId: string,
    recordId: string
): string {
    return scope === "system"
        ? `agent-services/skills/system-skills/${recordId}.zip`
        : `agent-services/skills/user-skills/${ownerId}/${recordId}.zip`;
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
    const scope = requiredString(aspect.scope, "scope") as AgentSkillScope;
    if (scope !== "system" && scope !== "user") {
        throw new AgentSkillError(
            "Agent Skill record has invalid scope",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const rawName = requiredString(raw.name, "name");
    const rawDescription = requiredString(aspect.description, "description");
    let name: string;
    let description: string;
    try {
        ({ name, description } = validateAgentSkillMetadata(
            rawName,
            rawDescription
        ));
        validateAgentSkillNameForScope(name, scope);
    } catch {
        throw new AgentSkillError(
            "Agent Skill record has invalid derived metadata",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    if (name !== rawName || description !== rawDescription) {
        throw new AgentSkillError(
            "Agent Skill record has non-canonical derived metadata",
            409,
            "INVALID_SKILL_RECORD"
        );
    }
    const ownerId = requiredString(
        accessControl.ownerId,
        "ownerId",
        UUID_PATTERN
    );
    if (id !== agentSkillRecordId(scope, ownerId, name)) {
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
    const expectedArchiveKey = archiveKey(scope, ownerId, id);
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
    return {
        id,
        name,
        ...(typeof raw.tenantId === "number" ? { tenantId: raw.tenantId } : {}),
        aspects: {
            "agent-skill": {
                scope,
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
                ...(accessControl.preAuthorisedPermissionIds
                    ? {
                          preAuthorisedPermissionIds: accessControl.preAuthorisedPermissionIds as string[]
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
        left.tenantId === right.tenantId &&
        left.aspects["access-control"].ownerId ===
            right.aspects["access-control"].ownerId &&
        leftPermissions.length === rightPermissions.length &&
        leftPermissions.every(
            (permission, index) => permission === rightPermissions[index]
        ) &&
        leftAspect.scope === rightAspect.scope &&
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
        name: record.name,
        description: aspect.description,
        scope: aspect.scope,
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
    private readonly now: () => Date;
    private readonly mutationQueues = new Map<string, Promise<void>>();

    constructor(options: AgentSkillServiceOptions) {
        this.registry = options.registry;
        this.storage = options.storage;
        this.authorization = options.authorization;
        this.limits = options.archiveLimits;
        this.tenantId = options.tenantId;
        this.now = options.now || (() => new Date());
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

    private syntheticRecord(
        scope: AgentSkillScope,
        ownerId: string,
        requestedName?: string
    ): AgentSkillRecord {
        const now = this.now().toISOString();
        const name =
            requestedName ||
            (scope === "system"
                ? "system-authorization-check"
                : "authorization-check");
        const id = agentSkillRecordId(scope, ownerId, name);
        return {
            id,
            name,
            tenantId: this.tenantId,
            aspects: {
                "agent-skill": {
                    scope,
                    createdAt: now,
                    createdBy: ownerId,
                    description: "Authorization check",
                    archiveKey: archiveKey(scope, ownerId, id),
                    updatedAt: now,
                    updatedBy: ownerId,
                    checksum: "0".repeat(64),
                    state: "PENDING"
                },
                "access-control": {
                    ownerId,
                    preAuthorisedPermissionIds: []
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
        scope: AgentSkillScope,
        user: AuthenticatedUser
    ): Promise<void> {
        await this.requirePermission(
            "create",
            this.syntheticRecord(scope, user.id),
            user
        );
    }

    async prepareExisting(
        scope: AgentSkillScope,
        id: string,
        operation: "read" | "update" | "delete",
        user: AuthenticatedUser
    ): Promise<AgentSkillRecord> {
        if (!hasRecordIdShape(scope, id)) {
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        }
        const raw = await this.registry.get(id, user.sessionToken);
        if (!raw) {
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        }
        const record = parseAgentSkillRecord(raw);
        if (record.aspects["agent-skill"].scope !== scope) {
            throw new AgentSkillError(
                "Agent Skill not found",
                404,
                "AGENT_SKILL_NOT_FOUND"
            );
        }
        await this.requirePermission(operation, record, user);
        return record;
    }

    private buildRecord(
        id: string,
        scope: AgentSkillScope,
        ownerId: string,
        actorId: string,
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
                    scope,
                    createdAt,
                    createdBy,
                    description: archive.description,
                    archiveKey: archiveKey(scope, ownerId, id),
                    updatedAt,
                    updatedBy,
                    checksum: archive.checksum,
                    state
                },
                "access-control": {
                    ownerId,
                    preAuthorisedPermissionIds: []
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
                scope: record.aspects["agent-skill"].scope,
                result,
                ...(code ? { code } : {})
            })
        );
    }

    private recoverCreate(
        raw: unknown,
        id: string,
        scope: AgentSkillScope,
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
        if (
            !["PENDING", "READY"].includes(aspect.state) ||
            aspect.scope !== scope ||
            existing.aspects["access-control"].ownerId !== ownerId ||
            aspect.createdBy !== ownerId ||
            aspect.checksum !== archive.checksum ||
            existing.name !== archive.name ||
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
        scope: AgentSkillScope,
        bytes: Buffer,
        user: AuthenticatedUser
    ): Promise<AgentSkillMetadata> {
        let archive: ValidatedAgentSkillArchive;
        try {
            archive = await validateAgentSkillArchive(
                bytes,
                scope,
                this.limits
            );
        } catch (error) {
            const mapped = downstreamError(error);
            this.audit(
                "create",
                this.syntheticRecord(scope, user.id),
                user,
                "failure",
                mapped.code
            );
            throw mapped;
        }
        const id = agentSkillRecordId(scope, user.id, archive.name);
        return await this.exclusive(id, async () => {
            let auditRecord = this.syntheticRecord(
                scope,
                user.id,
                archive.name
            );
            try {
                const existingRaw = await this.registry.get(
                    id,
                    user.sessionToken
                );
                let pending: AgentSkillRecord;
                if (existingRaw) {
                    pending = this.recoverCreate(
                        existingRaw,
                        id,
                        scope,
                        user.id,
                        archive
                    );
                } else {
                    const createdAt = this.now().toISOString();
                    pending = this.buildRecord(
                        id,
                        scope,
                        user.id,
                        user.id,
                        archive,
                        "PENDING",
                        createdAt,
                        user.id,
                        createdAt,
                        user.id
                    );
                    try {
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
                            user.sessionToken
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
                            scope,
                            user.id,
                            archive
                        );
                    }
                }
                auditRecord = pending;
                if (pending.aspects["agent-skill"].state === "READY") {
                    this.audit("create", pending, user, "success");
                    return metadata(pending);
                }
                await this.storage.upload(
                    pending.aspects["agent-skill"].archiveKey,
                    id,
                    bytes,
                    user.sessionToken
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
        user: AuthenticatedUser
    ): Promise<AgentSkillMetadata> {
        return await this.exclusive(existing.id, async () => {
            try {
                const currentRaw = await this.registry.get(
                    existing.id,
                    user.sessionToken
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
                if (current.aspects["agent-skill"].state === "DELETING") {
                    throw new AgentSkillError(
                        "Agent Skill is being deleted",
                        409,
                        "AGENT_SKILL_DELETING"
                    );
                }
                const scope = current.aspects["agent-skill"].scope;
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
                    scope,
                    this.limits
                );
                if (archive.name !== current.name) {
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
                if (
                    !(await this.storage.exists(
                        current.aspects["agent-skill"].archiveKey,
                        user.sessionToken
                    ))
                ) {
                    throw new AgentSkillError(
                        "Existing Agent Skill archive is missing; replacement was not attempted",
                        409,
                        "AGENT_SKILL_ARCHIVE_MISSING"
                    );
                }
                const nextPending = this.buildRecord(
                    current.id,
                    scope,
                    ownerId,
                    user.id,
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
        user: AuthenticatedUser
    ): Promise<void> {
        await this.exclusive(existing.id, async () => {
            try {
                const raw = await this.registry.get(
                    existing.id,
                    user.sessionToken
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
                    current.aspects["agent-skill"].scope !==
                        existing.aspects["agent-skill"].scope ||
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
                    await this.registry.put(deleting, user.sessionToken);
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
                record.aspects["agent-skill"].scope,
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
            archive.name !== record.name ||
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

    async list(
        request: AgentSkillListRequest,
        user: AuthenticatedUser
    ): Promise<{
        records: AgentSkillMetadata[];
        hasMore: boolean;
        nextPageToken?: string;
    }> {
        const requestedScopes: AgentSkillScope[] =
            request.scope === "all" ? ["system", "user"] : [request.scope];
        const decisions = await Promise.all(
            requestedScopes.map(async (scope) => ({
                scope,
                allowed: await this.authorization.can(
                    "read",
                    this.syntheticRecord(scope, user.id),
                    user.sessionToken
                )
            }))
        );
        const allowedScopes = new Set(
            decisions.filter((item) => item.allowed).map((item) => item.scope)
        );
        if (!allowedScopes.size) {
            throw new AgentSkillError(
                "You are not permitted to list Agent Skills",
                403,
                "AGENT_SKILL_FORBIDDEN"
            );
        }
        const queryScope =
            allowedScopes.size === 1
                ? ([...allowedScopes][0] as AgentSkillScope)
                : undefined;
        const result = await this.registry.list(
            {
                scope: queryScope,
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
            if (
                aspect.state !== "READY" ||
                !allowedScopes.has(aspect.scope) ||
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
