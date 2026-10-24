import { createHash } from "node:crypto";
import {
    validateAgentSkillArchive,
    validateAgentSkillMetadata,
    validateAgentSkillNameForType
} from "./archive.js";
import { DownstreamServiceError } from "./clients.js";
import {
    AgentSkillError,
    agentSkillRecordId,
    downstreamError,
    hasRecordIdShape,
    isObject,
    metadata,
    parseAgentSkillRecord,
    requiredString,
    USER_RECORD_ID_PATTERN,
    UUID_PATTERN
} from "./records.js";
import type { AgentSkillService } from "./service.js";
import {
    AgentSkillArchiveLimits,
    AgentSkillAuthorization,
    AgentSkillInstallationAuthorization,
    AgentSkillInstallationMetadata,
    AgentSkillInstallationRecord,
    AgentSkillInstallationRegistry,
    AgentSkillInstallationSourceState,
    AgentSkillInstallationView,
    AgentSkillMetadata,
    AgentSkillRecord,
    AgentSkillRegistry,
    UnavailableSkillInstallation,
    WorkspaceSkillManifestItem,
    WorkspaceSkillManifestWarning
} from "./types.js";
import { AuthenticatedUser } from "../types.js";

/*
 * Recipient installations of shared user Agent Skills (#3861).
 *
 * An installation is a recipient-owned Registry record
 * `agent-skill-<recipient>-<effective name>` with an
 * `agent-skill-installation` aspect and no publication aspect or ZIP. It
 * shares the recipient's deterministic namespace with their own publications,
 * so Registry's atomic create rejects every name collision.
 *
 * Owning an installation never grants its source. Every install, listing,
 * download and manifest resolution reads the original publication with the
 * real caller's session and asks OPA for its typed `user/read` again.
 */

export const INSTALLATION_ASPECT = "agent-skill-installation";

const MAX_NAME_LENGTH = 46;

function installationError(): AgentSkillError {
    return new AgentSkillError(
        "Registry record is not a valid Agent Skill installation",
        409,
        "INVALID_INSTALLATION_RECORD"
    );
}

/** Validate a recipient-chosen effective skill name. */
export function validateInstallationName(name: unknown): string {
    try {
        const valid = validateAgentSkillMetadata(name, "alias").name;
        if (valid !== name) throw new Error();
        validateAgentSkillNameForType(valid, "user");
        return valid;
    } catch {
        throw new AgentSkillError(
            "An installed skill name must be 1-46 lowercase letters, digits or single hyphens, must not start with system- and must not be a runtime-bundled skill name",
            400,
            "INVALID_ALIAS"
        );
    }
}

function sourceIdentity(
    sourceSkillId: string
): { userId: string; name: string } | undefined {
    const match = USER_RECORD_ID_PATTERN.exec(sourceSkillId);
    if (!match || !hasRecordIdShape("user", sourceSkillId)) return undefined;
    return { userId: match[1], name: match[2] };
}

/** Strictly parse an installation record and its deterministic identity. */
export function parseInstallationRecord(
    raw: unknown,
    tenantId: number
): AgentSkillInstallationRecord {
    if (!isObject(raw) || !isObject(raw.aspects)) throw installationError();
    const aspect = raw.aspects[INSTALLATION_ASPECT];
    const accessControl = raw.aspects["access-control"];
    if (
        raw.aspects["agent-skill"] !== undefined ||
        !isObject(aspect) ||
        !isObject(accessControl)
    )
        throw installationError();
    try {
        const id = requiredString(raw.id, "id");
        const name = requiredString(raw.name, "name");
        const userId = requiredString(aspect.userId, "userId", UUID_PATTERN);
        const sourceSkillId = requiredString(
            aspect.sourceSkillId,
            "sourceSkillId"
        );
        const source = sourceIdentity(sourceSkillId);
        if (!source || source.userId === userId) throw installationError();
        let alias: string | undefined;
        if (aspect.alias !== undefined) {
            alias = validateInstallationName(aspect.alias);
            if (alias === source.name) throw installationError();
        }
        const effectiveName = validateInstallationName(alias || source.name);
        const createdAt = requiredString(aspect.createdAt, "createdAt");
        if (
            name !== effectiveName ||
            id !== agentSkillRecordId("user", userId, effectiveName) ||
            accessControl.ownerId !== userId ||
            !Number.isFinite(Date.parse(createdAt)) ||
            (raw.tenantId !== undefined && raw.tenantId !== tenantId)
        )
            throw installationError();
        return {
            id,
            name,
            ...(typeof raw.tenantId === "number"
                ? { tenantId: raw.tenantId }
                : {}),
            aspects: {
                [INSTALLATION_ASPECT]: {
                    userId,
                    sourceSkillId,
                    ...(alias ? { alias } : {}),
                    createdAt
                },
                "access-control": { ownerId: userId }
            }
        };
    } catch {
        throw installationError();
    }
}

export function installationMetadata(
    record: AgentSkillInstallationRecord
): AgentSkillInstallationMetadata {
    const aspect = record.aspects[INSTALLATION_ASPECT];
    return {
        id: record.id,
        effectiveName: record.name,
        ...(aspect.alias ? { alias: aspect.alias } : {}),
        userId: aspect.userId,
        sourceSkillId: aspect.sourceSkillId,
        createdAt: aspect.createdAt
    };
}

/**
 * The installation ID of a recipient's namespace, or undefined. Only the
 * caller's own `agent-skill-<caller>-<name>` IDs are ever accepted.
 */
function ownInstallationId(id: string, user: AuthenticatedUser): boolean {
    const match = USER_RECORD_ID_PATTERN.exec(id);
    return !!match && match[1] === user.id && hasRecordIdShape("user", id);
}

/** Up to nine valid alternative names derived from one effective name. */
function aliasCandidates(name: string): string[] {
    const candidates: string[] = [];
    for (let index = 2; index <= 9; index += 1) {
        const suffix = `-${index}`;
        const base = name
            .slice(0, MAX_NAME_LENGTH - suffix.length)
            .replace(/-+$/, "");
        candidates.push(`${base}${suffix}`);
    }
    return candidates.filter((candidate) => {
        try {
            validateInstallationName(candidate);
            return true;
        } catch {
            return false;
        }
    });
}

/** A short stable fingerprint for audit logs without the full archive. */
function fingerprint(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
}

/** How the caller currently sees one installation's original source. */
type SourceResolution =
    | { status: "available"; record: AgentSkillRecord }
    | { status: "pending" }
    | { status: "unavailable" };

export interface AgentSkillInstallationServiceOptions {
    publications: AgentSkillService;
    registry: AgentSkillRegistry;
    installations: AgentSkillInstallationRegistry;
    authorization: AgentSkillAuthorization;
    installationAuthorization: AgentSkillInstallationAuthorization;
    archiveLimits: AgentSkillArchiveLimits;
    tenantId: number;
    now: () => Date;
}

export interface InstallationManifestResolution {
    items: WorkspaceSkillManifestItem[];
    warnings: WorkspaceSkillManifestWarning[];
    unavailable: UnavailableSkillInstallation[];
}

export class AgentSkillInstallationService {
    constructor(
        private readonly options: AgentSkillInstallationServiceOptions
    ) {}

    private audit(
        operation: "install" | "uninstall" | "fork",
        id: string,
        user: AuthenticatedUser,
        result: "success" | "failure",
        extra: Record<string, unknown> = {}
    ): void {
        console.info(
            JSON.stringify({
                event: "agent-skill-installation",
                actorId: user.id,
                operation,
                recordId: id,
                result,
                ...extra
            })
        );
    }

    private async requireInstallationPermission(
        operation: "create" | "delete",
        record: AgentSkillInstallationRecord,
        user: AuthenticatedUser,
        code: string
    ): Promise<void> {
        if (
            !(await this.options.installationAuthorization.canInstallation(
                operation,
                record,
                user.sessionToken
            ))
        ) {
            throw new AgentSkillError(
                operation === "create"
                    ? "You are not permitted to install Agent Skills"
                    : "You are not permitted to uninstall Agent Skills",
                403,
                code
            );
        }
    }

    /**
     * Installation records are read with the internal session, so every record
     * is shown, synced or returned only when the real caller may read it (the
     * typed `object/agentSkill/install/read` decision on the complete record).
     */
    private canReadInstallation(
        raw: unknown,
        user: AuthenticatedUser
    ): Promise<boolean> {
        if (!isObject(raw)) return Promise.resolve(false);
        return this.options.installationAuthorization.canInstallation(
            "read",
            (raw as unknown) as AgentSkillInstallationRecord,
            user.sessionToken
        );
    }

    /**
     * Read a source publication as the real caller. A Registry 403/404, a
     * malformed or non-shareable record, DELETING or a typed read denial is a
     * definitive "unavailable"; PENDING is transient. Infrastructure failures
     * throw, so callers never mistake an outage for a revocation.
     */
    private async resolveSource(
        sourceSkillId: string,
        user: AuthenticatedUser
    ): Promise<SourceResolution> {
        let raw: unknown;
        try {
            raw = await this.options.registry.get(
                sourceSkillId,
                user.sessionToken
            );
        } catch (error) {
            if (error instanceof DownstreamServiceError && error.status === 403)
                return { status: "unavailable" };
            throw error;
        }
        if (!raw) return { status: "unavailable" };
        let record: AgentSkillRecord;
        try {
            record = parseAgentSkillRecord(raw);
        } catch {
            return { status: "unavailable" };
        }
        const aspect = record.aspects["agent-skill"];
        if (
            record.id !== sourceSkillId ||
            aspect.type !== "user" ||
            !aspect.userId ||
            aspect.userId === user.id ||
            (record.tenantId !== undefined &&
                record.tenantId !== this.options.tenantId) ||
            aspect.state === "DELETING"
        )
            return { status: "unavailable" };
        if (
            !(await this.options.authorization.can(
                "read",
                record,
                user.sessionToken
            ))
        )
            return { status: "unavailable" };
        if (aspect.state === "PENDING") return { status: "pending" };
        return { status: "available", record };
    }

    private sourceState(
        resolution: SourceResolution
    ): AgentSkillInstallationSourceState {
        return resolution.status === "available"
            ? { status: "available", skill: metadata(resolution.record) }
            : { status: resolution.status };
    }

    private async view(
        record: AgentSkillInstallationRecord,
        user: AuthenticatedUser
    ): Promise<AgentSkillInstallationView> {
        return {
            ...installationMetadata(record),
            source: this.sourceState(
                await this.resolveSource(
                    record.aspects[INSTALLATION_ASPECT].sourceSkillId,
                    user
                )
            )
        };
    }

    private async suggestAlias(
        name: string,
        userId: string,
        internalSession: string
    ): Promise<string | undefined> {
        // Probes only the caller's own namespace.
        for (const candidate of aliasCandidates(name)) {
            const id = agentSkillRecordId("user", userId, candidate);
            if (
                (await this.options.installations.occupant(
                    id,
                    internalSession
                )) === "none"
            )
                return candidate;
        }
        return undefined;
    }

    private async conflict(
        id: string,
        effectiveName: string,
        user: AuthenticatedUser
    ): Promise<AgentSkillError> {
        const internalSession = this.options.publications.internalSessionToken();
        const occupant = await this.options.installations.occupant(
            id,
            internalSession
        );
        const suggestedAlias = await this.suggestAlias(
            effectiveName,
            user.id,
            internalSession
        );
        const what =
            occupant === "publication"
                ? "one of your published skills"
                : occupant === "installation"
                ? "another installed skill"
                : "an existing record";
        return new AgentSkillError(
            `The name "${effectiveName}" is already used by ${what}. Install it under a different name (alias)${
                suggestedAlias ? `, for example "${suggestedAlias}"` : ""
            }.`,
            409,
            "AGENT_SKILL_NAME_CONFLICT",
            false,
            id,
            {
                conflict: occupant === "none" ? "unknown" : occupant,
                ...(suggestedAlias ? { suggestedAlias } : {})
            }
        );
    }

    async install(
        request: { sourceSkillId?: unknown; alias?: unknown },
        user: AuthenticatedUser
    ): Promise<{ created: boolean; installation: AgentSkillInstallationView }> {
        const sourceSkillId = request.sourceSkillId;
        if (typeof sourceSkillId !== "string" || !sourceIdentity(sourceSkillId))
            throw new AgentSkillError(
                "sourceSkillId must be the ID of a published user Agent Skill",
                400,
                "INVALID_SOURCE_SKILL_ID"
            );
        const source = sourceIdentity(sourceSkillId)!;
        if (source.userId === user.id)
            throw new AgentSkillError(
                "Your own published skills are already synchronized; they cannot be installed as shared skills",
                409,
                "AGENT_SKILL_OWN_SOURCE"
            );
        let alias: string | undefined;
        if (request.alias !== undefined && request.alias !== null) {
            alias = validateInstallationName(request.alias);
            if (alias === source.name) alias = undefined;
        }
        const effectiveName = alias || source.name;
        const id = agentSkillRecordId("user", user.id, effectiveName);
        try {
            const resolution = await this.resolveSource(sourceSkillId, user);
            if (resolution.status === "pending")
                throw new AgentSkillError(
                    "The shared skill is being updated by its publisher; try again shortly",
                    409,
                    "AGENT_SKILL_SOURCE_PENDING",
                    true
                );
            if (resolution.status !== "available")
                // Missing and unreadable sources are indistinguishable.
                throw new AgentSkillError(
                    "Shared Agent Skill not found",
                    404,
                    "AGENT_SKILL_SOURCE_NOT_FOUND"
                );
            const candidate: AgentSkillInstallationRecord = {
                id,
                name: effectiveName,
                tenantId: this.options.tenantId,
                aspects: {
                    [INSTALLATION_ASPECT]: {
                        userId: user.id,
                        sourceSkillId,
                        ...(alias ? { alias } : {}),
                        createdAt: this.options.now().toISOString()
                    },
                    "access-control": { ownerId: user.id }
                }
            };
            await this.requireInstallationPermission(
                "create",
                candidate,
                user,
                "AGENT_SKILL_INSTALL_FORBIDDEN"
            );
            const result = await this.options.publications.runExclusive(
                id,
                async () => {
                    try {
                        // Installation records are only written by Agent
                        // Services (with the internal session), after
                        // authorising the real caller above.
                        await this.options.installations.createInstallation(
                            candidate,
                            this.options.publications.internalSessionToken()
                        );
                        return { created: true, record: candidate };
                    } catch (error) {
                        if (
                            !(error instanceof DownstreamServiceError) ||
                            ![400, 409].includes(error.status)
                        )
                            throw error;
                        // Registry rejects a duplicate ID atomically. The same
                        // installation retried is an idempotent success.
                        const existingRaw = await this.options.installations.getInstallation(
                            id,
                            this.options.publications.internalSessionToken()
                        );
                        if (existingRaw) {
                            try {
                                const existing = parseInstallationRecord(
                                    existingRaw,
                                    this.options.tenantId
                                );
                                const aspect =
                                    existing.aspects[INSTALLATION_ASPECT];
                                if (
                                    aspect.userId === user.id &&
                                    aspect.sourceSkillId === sourceSkillId &&
                                    aspect.alias === alias
                                )
                                    return { created: false, record: existing };
                            } catch {
                                // Fall through to the conflict report.
                            }
                        }
                        const occupied = await this.options.installations.occupant(
                            id,
                            this.options.publications.internalSessionToken()
                        );
                        if (occupied === "none") throw error;
                        throw await this.conflict(id, effectiveName, user);
                    }
                }
            );
            this.audit("install", id, user, "success", {
                sourceSkillId,
                created: result.created
            });
            return {
                created: result.created,
                installation: {
                    ...installationMetadata(result.record),
                    source: this.sourceState(resolution)
                }
            };
        } catch (error) {
            const mapped = downstreamError(error, id);
            this.audit("install", id, user, "failure", {
                sourceSkillId,
                code: mapped.code
            });
            throw mapped;
        }
    }

    async uninstall(id: string, user: AuthenticatedUser): Promise<void> {
        const notFound = () =>
            new AgentSkillError(
                "Installed Agent Skill not found",
                404,
                "AGENT_SKILL_INSTALLATION_NOT_FOUND"
            );
        if (!ownInstallationId(id, user)) throw notFound();
        try {
            await this.options.publications.runExclusive(id, async () => {
                const raw = await this.options.installations.getInstallation(
                    id,
                    this.options.publications.internalSessionToken()
                );
                const record = this.ownedInstallation(raw, id, user);
                if (!record) throw notFound();
                await this.requireInstallationPermission(
                    "delete",
                    record,
                    user,
                    "AGENT_SKILL_UNINSTALL_FORBIDDEN"
                );
                // Only the recipient's record is removed, after authorising
                // the recipient above. The original publication and its ZIP
                // are never touched.
                await this.options.installations.deleteInstallation(
                    id,
                    this.options.publications.internalSessionToken()
                );
            });
            this.audit("uninstall", id, user, "success");
        } catch (error) {
            const mapped = downstreamError(error, id);
            this.audit("uninstall", id, user, "failure", {
                code: mapped.code
            });
            throw mapped;
        }
    }

    /**
     * The caller's own installation record, strictly parsed when possible.
     * A malformed record that is unambiguously the caller's (own namespace,
     * recipient and owner) stays removable, as the OPA delete rule allows.
     */
    private ownedInstallation(
        raw: unknown,
        id: string,
        user: AuthenticatedUser
    ): AgentSkillInstallationRecord | undefined {
        if (!raw) return undefined;
        try {
            const record = parseInstallationRecord(raw, this.options.tenantId);
            return record.aspects[INSTALLATION_ASPECT].userId === user.id
                ? record
                : undefined;
        } catch {
            if (
                !isObject(raw) ||
                raw.id !== id ||
                !isObject(raw.aspects) ||
                raw.aspects["agent-skill"] !== undefined
            )
                return undefined;
            const aspect = raw.aspects[INSTALLATION_ASPECT];
            const accessControl = raw.aspects["access-control"];
            if (
                !isObject(aspect) ||
                !isObject(accessControl) ||
                aspect.userId !== user.id ||
                accessControl.ownerId !== user.id
            )
                return undefined;
            return (raw as unknown) as AgentSkillInstallationRecord;
        }
    }

    async get(
        id: string,
        user: AuthenticatedUser
    ): Promise<AgentSkillInstallationView> {
        const notFound = new AgentSkillError(
            "Installed Agent Skill not found",
            404,
            "AGENT_SKILL_INSTALLATION_NOT_FOUND"
        );
        if (!ownInstallationId(id, user)) throw notFound;
        const raw = await this.options.installations
            .getInstallation(
                id,
                this.options.publications.internalSessionToken()
            )
            .catch((error) => {
                throw downstreamError(error, id);
            });
        if (!raw || !(await this.canReadInstallation(raw, user)))
            throw notFound;
        const record = parseInstallationRecord(raw, this.options.tenantId);
        if (record.aspects[INSTALLATION_ASPECT].userId !== user.id)
            throw notFound;
        return this.view(record, user);
    }

    async list(
        request: { pageToken?: string; limit: number },
        user: AuthenticatedUser
    ): Promise<{
        items: Array<
            | AgentSkillInstallationView
            | { id: string; problem: "INVALID_RECORD" }
        >;
        hasMore: boolean;
        nextPageToken?: string;
    }> {
        const page = await this.options.installations.listInstallations(
            {
                userId: user.id,
                limit: request.limit,
                ...(request.pageToken ? { pageToken: request.pageToken } : {})
            },
            this.options.publications.internalSessionToken()
        );
        const items: Array<
            | AgentSkillInstallationView
            | { id: string; problem: "INVALID_RECORD" }
        > = [];
        for (const raw of page.records) {
            if (!(await this.canReadInstallation(raw, user))) continue;
            let record: AgentSkillInstallationRecord;
            try {
                record = parseInstallationRecord(raw, this.options.tenantId);
            } catch {
                // Keep the caller's own malformed records visible so they can
                // be uninstalled; never echo another namespace's records.
                const rawId =
                    isObject(raw) && typeof raw.id === "string"
                        ? raw.id
                        : undefined;
                if (rawId && ownInstallationId(rawId, user))
                    items.push({ id: rawId, problem: "INVALID_RECORD" });
                continue;
            }
            if (record.aspects[INSTALLATION_ASPECT].userId !== user.id)
                continue;
            items.push(await this.view(record, user));
        }
        return {
            items,
            hasMore: page.hasMore,
            ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {})
        };
    }

    /**
     * Resolve every installation of the caller for a manifest. Pages are
     * exhausted independently of publication sources. Installations are read
     * with the internal session and authorized for the real caller; each
     * source is read and authorized as the real caller.
     */
    async resolveForManifest(
        user: AuthenticatedUser
    ): Promise<InstallationManifestResolution> {
        const items: WorkspaceSkillManifestItem[] = [];
        const warnings: WorkspaceSkillManifestWarning[] = [];
        const unavailable: UnavailableSkillInstallation[] = [];
        const warn = (warning: WorkspaceSkillManifestWarning) => {
            if (warnings.length < 100) warnings.push(warning);
        };
        const seenTokens = new Set<string>();
        const seenIds = new Set<string>();
        let pageToken: string | undefined;
        do {
            const page = await this.options.installations.listInstallations(
                {
                    userId: user.id,
                    limit: 100,
                    ...(pageToken ? { pageToken } : {})
                },
                this.options.publications.internalSessionToken()
            );
            for (const raw of page.records) {
                if (!(await this.canReadInstallation(raw, user))) continue;
                const rawId =
                    isObject(raw) && typeof raw.id === "string"
                        ? raw.id
                        : undefined;
                let record: AgentSkillInstallationRecord;
                try {
                    record = parseInstallationRecord(
                        raw,
                        this.options.tenantId
                    );
                } catch {
                    // A malformed own installation leaves the desired set
                    // uncertain: report it so clients do not reconcile.
                    warn({
                        sourceKind: "installation",
                        code: "INVALID_RECORD",
                        ...(rawId ? { recordId: rawId } : {})
                    });
                    continue;
                }
                const aspect = record.aspects[INSTALLATION_ASPECT];
                if (aspect.userId !== user.id) {
                    warn({
                        sourceKind: "installation",
                        code: "INVALID_RECORD",
                        recordId: record.id
                    });
                    continue;
                }
                if (seenIds.has(record.id)) {
                    warn({
                        sourceKind: "installation",
                        code: "DUPLICATE_RECORD",
                        recordId: record.id
                    });
                    continue;
                }
                seenIds.add(record.id);
                const resolution = await this.resolveSource(
                    aspect.sourceSkillId,
                    user
                );
                if (resolution.status === "pending") {
                    // The publisher is replacing the archive: membership is
                    // known, content is not. Retry rather than remove.
                    warn({
                        sourceKind: "installation",
                        code: "SOURCE_PENDING",
                        recordId: record.id
                    });
                    continue;
                }
                if (resolution.status === "unavailable") {
                    unavailable.push({
                        installationId: record.id,
                        effectiveName: record.name,
                        sourceSkillId: aspect.sourceSkillId,
                        code: "SOURCE_UNAVAILABLE"
                    });
                    continue;
                }
                items.push({
                    selectionId: record.id,
                    effectiveName: record.name,
                    sourceKind: "installation",
                    source: metadata(resolution.record),
                    installation: {
                        id: record.id,
                        userId: aspect.userId,
                        sourceSkillId: aspect.sourceSkillId,
                        ...(aspect.alias ? { alias: aspect.alias } : {})
                    }
                });
            }
            if (!page.hasMore) break;
            const next = page.nextPageToken;
            if (!next || seenTokens.has(next)) {
                throw new DownstreamServiceError(
                    "registry",
                    502,
                    "Registry returned an invalid Agent Skill installation page"
                );
            }
            seenTokens.add(next);
            pageToken = next;
        } while (true);
        return { items, warnings, unavailable: unavailable.slice(0, 1000) };
    }

    /**
     * Publish an edited installed copy as the recipient's own user skill
     * (`mgd agent-skill publish --force`). The own publication needs the
     * installation's deterministic ID, so the installation is removed first.
     * Both of the caller's permissions are checked before anything changes;
     * the original publication is never read for writing, modified or deleted.
     *
     * Registry has no multi-record transaction. If creating the publication
     * fails after the installation was removed, the error says so; retrying
     * finds no installation and completes as an ordinary own-skill create of
     * the same deterministic ID.
     */
    async fork(
        id: string,
        bytes: Buffer,
        user: AuthenticatedUser
    ): Promise<{
        publication: AgentSkillMetadata;
        installationRemoved: boolean;
    }> {
        if (!ownInstallationId(id, user))
            throw new AgentSkillError(
                "Installed Agent Skill not found",
                404,
                "AGENT_SKILL_INSTALLATION_NOT_FOUND"
            );
        let installationRemoved = false;
        try {
            const archive = await validateAgentSkillArchive(
                bytes,
                "user",
                this.options.archiveLimits
            );
            if (agentSkillRecordId("user", user.id, archive.name) !== id)
                throw new AgentSkillError(
                    "SKILL.md name must equal the installed skill name to publish it in its place",
                    409,
                    "AGENT_SKILL_FORK_NAME_MISMATCH"
                );
            const publication = await this.options.publications.runExclusive(
                id,
                async () => {
                    const internalSession = this.options.publications.internalSessionToken();
                    const raw = await this.options.installations.getInstallation(
                        id,
                        internalSession
                    );
                    const installation = this.ownedInstallation(raw, id, user);
                    if (raw && !installation)
                        throw new AgentSkillError(
                            "Installed Agent Skill not found",
                            404,
                            "AGENT_SKILL_INSTALLATION_NOT_FOUND"
                        );
                    // Check both requested operations before any change.
                    await this.options.publications.assertCanCreate(
                        "user",
                        archive,
                        user
                    );
                    if (installation) {
                        await this.requireInstallationPermission(
                            "delete",
                            installation,
                            user,
                            "AGENT_SKILL_UNINSTALL_FORBIDDEN"
                        );
                        await this.options.installations.deleteInstallation(
                            id,
                            internalSession
                        );
                        installationRemoved = true;
                    }
                    try {
                        return await this.options.publications.createUnlocked(
                            "user",
                            bytes,
                            archive,
                            user
                        );
                    } catch (error) {
                        if (!installationRemoved) throw error;
                        const mapped = downstreamError(error, id);
                        throw new AgentSkillError(
                            `Your installation was removed, but your own publication was not created: ${mapped.message}. Retry the publish to finish; nothing else was changed.`,
                            mapped.status,
                            "AGENT_SKILL_FORK_INCOMPLETE",
                            true,
                            id,
                            { installationRemoved: true, cause: mapped.code }
                        );
                    }
                }
            );
            this.audit("fork", id, user, "success", {
                installationRemoved,
                checksum: fingerprint(bytes)
            });
            return { publication, installationRemoved };
        } catch (error) {
            const mapped = downstreamError(error, id);
            this.audit("fork", id, user, "failure", {
                installationRemoved,
                code: mapped.code
            });
            throw mapped;
        }
    }
}
