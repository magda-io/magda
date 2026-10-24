import { MagdaClient } from "./client.js";
import { MgdApiError } from "./errors.js";
import {
    AGENT_SKILLS,
    AGENT_SKILL_INSTALLATIONS,
    AGENT_SKILL_LOCAL_SYNC_MANIFEST,
    AGENT_SKILL_WORKSPACE_MANIFEST,
    agentSkill,
    agentSkillAccess,
    agentSkillArchive,
    agentSkillInstallation
} from "./endpoints.js";
import {
    AgentSkillAccess,
    AgentSkillInstallation,
    AgentSkillInstallationPage,
    AgentSkillListType,
    AgentSkillMetadata,
    AgentSkillPage,
    AgentSkillRef,
    AgentSkillType,
    LocalSkillManifest,
    UnavailableSkillInstallation,
    WorkspaceSkillManifestItem,
    WorkspaceSkillManifestWithIdentity
} from "./agentSkillTypes.js";

const CHECKSUM = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_NAMES = new Set(["capture-workflow", "magda-mgd"]);

function validInstalledName(name: unknown): name is string {
    return (
        typeof name === "string" &&
        SKILL_NAME.test(name) &&
        name.length <= 46 &&
        !name.startsWith("system-") &&
        !RESERVED_NAMES.has(name)
    );
}

/**
 * Validate one manifest item against the authenticated identity. An
 * installation item must name the caller's own deterministic installation and
 * another user's publication, with an effective name of its alias or the
 * source name.
 */
function assertManifestItem(
    item: WorkspaceSkillManifestItem,
    userId: string,
    allowed: ReadonlySet<WorkspaceSkillManifestItem["sourceKind"]>,
    message: string
): WorkspaceSkillManifestItem {
    const source = assertMetadata(item?.source);
    if (!allowed.has(item.sourceKind)) throw new Error(message);
    if (item.sourceKind === "installation") {
        const installation = item.installation;
        if (
            !installation ||
            source.type !== "user" ||
            !source.userId ||
            source.userId === userId ||
            installation.userId !== userId ||
            installation.sourceSkillId !== source.id ||
            installation.id !== item.selectionId ||
            installation.id !== `agent-skill-${userId}-${item.effectiveName}` ||
            !validInstalledName(item.effectiveName) ||
            (installation.alias === undefined
                ? item.effectiveName !== source.name
                : installation.alias !== item.effectiveName ||
                  installation.alias === source.name)
        )
            throw new Error(message);
        return {
            selectionId: item.selectionId,
            effectiveName: item.effectiveName,
            sourceKind: item.sourceKind,
            source,
            installation: {
                id: installation.id,
                userId: installation.userId,
                sourceSkillId: installation.sourceSkillId,
                ...(installation.alias !== undefined
                    ? { alias: installation.alias }
                    : {})
            }
        };
    }
    if (
        item.installation !== undefined ||
        item.selectionId !== source.id ||
        item.effectiveName !== source.name ||
        (item.sourceKind === "system-publication") !==
            (source.type === "system") ||
        (item.sourceKind === "own-user-publication" && source.userId !== userId)
    )
        throw new Error(message);
    return { ...item, source };
}

function assertUnavailableInstallations(
    value: unknown,
    userId: string,
    message: string
): UnavailableSkillInstallation[] {
    // Servers that predate installations omit the list.
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(message);
    return value.map((entry) => {
        if (
            !entry ||
            typeof entry !== "object" ||
            entry.code !== "SOURCE_UNAVAILABLE" ||
            !validInstalledName(entry.effectiveName) ||
            entry.installationId !==
                `agent-skill-${userId}-${entry.effectiveName}` ||
            typeof entry.sourceSkillId !== "string" ||
            !/^agent-skill-[0-9a-z-]+$/.test(entry.sourceSkillId)
        )
            throw new Error(message);
        return {
            installationId: entry.installationId,
            effectiveName: entry.effectiveName,
            sourceSkillId: entry.sourceSkillId,
            code: "SOURCE_UNAVAILABLE" as const
        };
    });
}

function assertInstallation(value: unknown, userId?: string) {
    const item = value as AgentSkillInstallation;
    if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        !validInstalledName(item.effectiveName) ||
        typeof item.userId !== "string" ||
        (userId !== undefined && item.userId !== userId) ||
        item.id !== `agent-skill-${item.userId}-${item.effectiveName}` ||
        typeof item.sourceSkillId !== "string" ||
        !item.source ||
        !["available", "pending", "unavailable"].includes(item.source.status)
    )
        throw new Error("Invalid Agent Skill installation response");
    if (item.source.status === "available") {
        const skill = assertMetadata(item.source.skill);
        if (skill.id !== item.sourceSkillId)
            throw new Error("Invalid Agent Skill installation response");
    }
    return item;
}

function assertMetadata(value: unknown): AgentSkillMetadata {
    if (!value || typeof value !== "object")
        throw new Error("Invalid Agent Skill metadata response");
    const item = value as Record<string, unknown>;
    if (
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.description !== "string" ||
        !SKILL_NAME.test(item.name) ||
        item.name.length > 46 ||
        (item.type !== "system" && item.type !== "user") ||
        typeof item.ownerId !== "string" ||
        typeof item.createdAt !== "string" ||
        typeof item.createdBy !== "string" ||
        typeof item.updatedAt !== "string" ||
        typeof item.updatedBy !== "string" ||
        typeof item.checksum !== "string" ||
        !CHECKSUM.test(item.checksum) ||
        (item.userId !== undefined && typeof item.userId !== "string")
    )
        throw new Error("Invalid Agent Skill metadata response");
    const metadata = (item as unknown) as AgentSkillMetadata;
    if (
        (metadata.type === "user" &&
            (!metadata.userId || !UUID.test(metadata.userId))) ||
        (metadata.type === "system" && metadata.userId !== undefined) ||
        (metadata.type === "system") !== metadata.name.startsWith("system-")
    ) {
        throw new Error("Invalid Agent Skill metadata identity");
    }
    const expectedId =
        metadata.type === "system"
            ? `agent-skill-${metadata.name}`
            : metadata.userId
            ? `agent-skill-${metadata.userId}-${metadata.name}`
            : undefined;
    if (!expectedId || metadata.id !== expectedId) {
        throw new Error("Invalid Agent Skill metadata identity");
    }
    return metadata;
}

export class AgentSkillClient {
    constructor(private readonly client: MagdaClient) {}

    get baseUrl(): string {
        return this.client.opts.baseUrl;
    }

    async list(
        options: {
            type?: AgentSkillListType;
            userId?: "current" | "!current";
            limit?: number;
            pageToken?: string;
            q?: string;
        } = {}
    ): Promise<AgentSkillPage> {
        const value = await this.client.json<unknown>("GET", AGENT_SKILLS, {
            query: {
                type: options.type ?? "all",
                userId: options.userId,
                limit: options.limit,
                pageToken: options.pageToken,
                q: options.q
            }
        });
        if (!value || typeof value !== "object")
            throw new Error("Invalid Agent Skill page response");
        const page = value as Record<string, unknown>;
        if (
            !Array.isArray(page.items) ||
            typeof page.hasMore !== "boolean" ||
            (page.nextPageToken !== undefined &&
                typeof page.nextPageToken !== "string") ||
            (page.hasMore && !page.nextPageToken)
        )
            throw new Error("Invalid Agent Skill page response");
        return {
            items: page.items.map(assertMetadata),
            hasMore: page.hasMore,
            ...(typeof page.nextPageToken === "string"
                ? { nextPageToken: page.nextPageToken }
                : {})
        };
    }

    async show(ref: AgentSkillRef): Promise<AgentSkillMetadata> {
        const item = assertMetadata(
            await this.client.json("GET", agentSkill(ref.type, ref.id))
        );
        if (item.id !== ref.id || item.type !== ref.type)
            throw new Error(
                "Agent Skill response identity does not match the request"
            );
        return item;
    }

    async manifest(): Promise<WorkspaceSkillManifestWithIdentity> {
        const value = await this.client.json<
            WorkspaceSkillManifestWithIdentity
        >("GET", AGENT_SKILL_WORKSPACE_MANIFEST);
        if (
            !value ||
            value.version !== 1 ||
            value.complete !== true ||
            typeof value.identity?.tenantId !== "string" ||
            typeof value.identity?.userId !== "string" ||
            !value.identity.userId ||
            !Array.isArray(value.items) ||
            !Array.isArray(value.warnings)
        ) {
            throw new Error("Invalid Agent Skill workspace manifest response");
        }
        const message = "Invalid Agent Skill workspace manifest item";
        value.items = value.items.map((item) =>
            assertManifestItem(
                item,
                value.identity.userId,
                new Set([
                    "system-publication",
                    "own-user-publication",
                    "installation"
                ]),
                message
            )
        );
        value.unavailableInstallations = assertUnavailableInstallations(
            value.unavailableInstallations,
            value.identity.userId,
            message
        );
        return value;
    }

    async localManifest(): Promise<LocalSkillManifest> {
        const value = await this.client.json<LocalSkillManifest>(
            "GET",
            AGENT_SKILL_LOCAL_SYNC_MANIFEST
        );
        if (
            !value ||
            value.version !== 1 ||
            value.complete !== true ||
            typeof value.identity?.tenantId !== "string" ||
            typeof value.identity?.userId !== "string" ||
            !value.identity.userId ||
            !Array.isArray(value.items) ||
            !Array.isArray(value.warnings)
        ) {
            throw new Error("Invalid Agent Skill local sync manifest response");
        }
        // Local computers never receive system publications.
        const message = "Invalid Agent Skill local sync manifest item";
        value.items = value.items.map((item) =>
            assertManifestItem(
                item,
                value.identity.userId,
                new Set(["own-user-publication", "installation"]),
                message
            )
        );
        value.unavailableInstallations = assertUnavailableInstallations(
            value.unavailableInstallations,
            value.identity.userId,
            message
        );
        return value;
    }

    /** Other users' READY publications shared with (readable by) the caller. */
    async listShared(
        options: { limit?: number; pageToken?: string; q?: string } = {}
    ): Promise<AgentSkillPage> {
        return this.list({ ...options, type: "user", userId: "!current" });
    }

    async installations(
        options: { limit?: number; pageToken?: string } = {}
    ): Promise<AgentSkillInstallationPage> {
        const value = await this.client.json<AgentSkillInstallationPage>(
            "GET",
            AGENT_SKILL_INSTALLATIONS,
            { query: { limit: options.limit, pageToken: options.pageToken } }
        );
        if (
            !value ||
            !Array.isArray(value.items) ||
            typeof value.hasMore !== "boolean"
        )
            throw new Error("Invalid Agent Skill installation page response");
        return {
            items: value.items.map((item) =>
                (item as { problem?: string }).problem === "INVALID_RECORD"
                    ? item
                    : assertInstallation(item)
            ),
            hasMore: value.hasMore,
            ...(value.nextPageToken
                ? { nextPageToken: value.nextPageToken }
                : {})
        };
    }

    async install(
        sourceSkillId: string,
        alias?: string
    ): Promise<AgentSkillInstallation> {
        return afterWrite(async () =>
            assertInstallation(
                await this.client.json("POST", AGENT_SKILL_INSTALLATIONS, {
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        sourceSkillId,
                        ...(alias !== undefined ? { alias } : {})
                    })
                })
            )
        );
    }

    async uninstall(installationId: string): Promise<void> {
        await afterWrite(() =>
            this.client.request(
                "DELETE",
                agentSkillInstallation(installationId)
            )
        );
    }

    /**
     * Publish an installed shared copy as the caller's own user skill in the
     * installation's place. The publisher's original is never written.
     */
    async publishInstallation(
        installationId: string,
        bytes: Buffer
    ): Promise<{
        publication: AgentSkillMetadata;
        installationRemoved: boolean;
    }> {
        return afterWrite(async () => {
            const value = (await this.client.json(
                "POST",
                `${agentSkillInstallation(installationId)}/publish`,
                {
                    headers: { "content-type": "application/zip" },
                    body: bytes
                }
            )) as {
                publication?: unknown;
                installationRemoved?: unknown;
            };
            const publication = assertMetadata(value?.publication);
            if (
                publication.type !== "user" ||
                publication.id !== installationId ||
                typeof value.installationRemoved !== "boolean"
            )
                throw new Error(
                    "Agent Skill response identity does not match the request"
                );
            return {
                publication,
                installationRemoved: value.installationRemoved
            };
        });
    }

    async access(ref: AgentSkillRef): Promise<AgentSkillAccess> {
        return this.client.json<AgentSkillAccess>(
            "GET",
            agentSkillAccess(ref.type, ref.id)
        );
    }

    async updateAccess(
        ref: AgentSkillRef,
        settings: { public?: boolean; orgUnitId?: string | null }
    ): Promise<AgentSkillAccess> {
        return afterWrite(() =>
            this.client.json<AgentSkillAccess>(
                "PUT",
                agentSkillAccess(ref.type, ref.id),
                {
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(settings)
                }
            )
        );
    }

    async recipients(
        ref: AgentSkillRef,
        options: { offset?: number; limit?: number; keyword?: string } = {}
    ): Promise<{
        items: Array<{ id: string; displayName?: string }>;
        total: number;
    }> {
        return this.client.json(
            "GET",
            `${agentSkillAccess(ref.type, ref.id)}/users`,
            {
                query: {
                    offset: options.offset,
                    limit: options.limit,
                    keyword: options.keyword
                }
            }
        );
    }

    async share(
        ref: AgentSkillRef,
        userId: string
    ): Promise<{ added: boolean }> {
        return afterWrite(() =>
            this.client.json(
                "PUT",
                `${agentSkillAccess(
                    ref.type,
                    ref.id
                )}/users/${encodeURIComponent(userId)}`
            )
        );
    }

    async unshare(
        ref: AgentSkillRef,
        userId: string
    ): Promise<{ removed: boolean }> {
        return afterWrite(() =>
            this.client.json(
                "DELETE",
                `${agentSkillAccess(
                    ref.type,
                    ref.id
                )}/users/${encodeURIComponent(userId)}`
            )
        );
    }

    async download(
        ref: AgentSkillRef
    ): Promise<{ metadata: AgentSkillMetadata; bytes: Buffer }> {
        const metadata = await this.show(ref);
        const response = await this.client.request(
            "GET",
            agentSkillArchive(ref.type, ref.id)
        );
        const bytes = Buffer.from(await response.arrayBuffer());
        return { metadata, bytes };
    }

    async create(
        type: AgentSkillType,
        bytes: Buffer
    ): Promise<AgentSkillMetadata> {
        return afterWrite(async () => {
            const item = assertMetadata(
                await this.client.json("POST", `${AGENT_SKILLS}/${type}`, {
                    headers: { "content-type": "application/zip" },
                    body: bytes
                })
            );
            if (item.type !== type)
                throw new Error(
                    "Agent Skill response type does not match the request"
                );
            return item;
        });
    }

    async replace(
        ref: AgentSkillRef,
        bytes: Buffer,
        expectedChecksum: string
    ): Promise<AgentSkillMetadata> {
        return afterWrite(async () => {
            const item = assertMetadata(
                await this.client.json(
                    "PUT",
                    agentSkillArchive(ref.type, ref.id),
                    {
                        headers: {
                            "content-type": "application/zip",
                            "if-match": `"${expectedChecksum}"`
                        },
                        body: bytes
                    }
                )
            );
            if (item.id !== ref.id || item.type !== ref.type)
                throw new Error(
                    "Agent Skill response identity does not match the request"
                );
            return item;
        });
    }

    async delete(ref: AgentSkillRef, expectedChecksum: string): Promise<void> {
        await afterWrite(() =>
            this.client.request("DELETE", agentSkill(ref.type, ref.id), {
                headers: { "if-match": `"${expectedChecksum}"` }
            })
        );
    }
}

/**
 * Run one write request. Anything other than a classified HTTP/transport
 * failure happens after the server answered (e.g. an invalid response), so
 * the write may have been applied: report its outcome as unknown.
 */
async function afterWrite<T>(write: () => Promise<T>): Promise<T> {
    try {
        return await write();
    } catch (error) {
        if (error instanceof MgdApiError) throw error;
        throw new MgdApiError(
            `The server's response to this change could not be confirmed: ${
                (error as Error).message
            }`,
            0,
            "response-invalid",
            undefined,
            "unknown"
        );
    }
}
