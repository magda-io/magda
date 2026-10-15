import { MagdaClient } from "./client.js";
import {
    AGENT_SKILLS,
    AGENT_SKILL_WORKSPACE_MANIFEST,
    agentSkill,
    agentSkillArchive
} from "./endpoints.js";
import {
    AgentSkillListType,
    AgentSkillMetadata,
    AgentSkillPage,
    AgentSkillRef,
    AgentSkillType,
    WorkspaceSkillManifest
} from "./agentSkillTypes.js";

const CHECKSUM = /^[0-9a-f]{64}$/;

function assertMetadata(value: unknown): AgentSkillMetadata {
    if (!value || typeof value !== "object")
        throw new Error("Invalid Agent Skill metadata response");
    const item = value as Record<string, unknown>;
    if (
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.description !== "string" ||
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

    async list(
        options: {
            type?: AgentSkillListType;
            limit?: number;
            pageToken?: string;
            q?: string;
        } = {}
    ): Promise<AgentSkillPage> {
        const value = await this.client.json<unknown>("GET", AGENT_SKILLS, {
            query: {
                type: options.type ?? "all",
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

    async manifest(): Promise<WorkspaceSkillManifest> {
        const value = await this.client.json<WorkspaceSkillManifest>(
            "GET",
            AGENT_SKILL_WORKSPACE_MANIFEST
        );
        if (
            !value ||
            value.version !== 1 ||
            value.complete !== true ||
            !Array.isArray(value.items) ||
            !Array.isArray(value.warnings)
        ) {
            throw new Error("Invalid Agent Skill workspace manifest response");
        }
        value.items = value.items.map((item) => {
            const source = assertMetadata(item.source);
            if (
                item.sourceKind === "installation" ||
                (item.sourceKind !== "system-publication" &&
                    item.sourceKind !== "own-user-publication") ||
                item.selectionId !== source.id ||
                item.effectiveName !== source.name ||
                (item.sourceKind === "system-publication") !==
                    (source.type === "system")
            ) {
                throw new Error("Invalid Agent Skill workspace manifest item");
            }
            return { ...item, source };
        });
        return value;
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
    }

    async replace(
        ref: AgentSkillRef,
        bytes: Buffer,
        expectedChecksum: string
    ): Promise<AgentSkillMetadata> {
        const item = assertMetadata(
            await this.client.json("PUT", agentSkillArchive(ref.type, ref.id), {
                headers: {
                    "content-type": "application/zip",
                    "if-match": `"${expectedChecksum}"`
                },
                body: bytes
            })
        );
        if (item.id !== ref.id || item.type !== ref.type)
            throw new Error(
                "Agent Skill response identity does not match the request"
            );
        return item;
    }

    async delete(ref: AgentSkillRef, expectedChecksum: string): Promise<void> {
        await this.client.request("DELETE", agentSkill(ref.type, ref.id), {
            headers: { "if-match": `"${expectedChecksum}"` }
        });
    }
}
