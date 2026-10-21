import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentSkillClient } from "../agentSkillClient.js";
import {
    AGENT_SKILL_INSTALL_MARKER,
    createAgentSkillArchive
} from "../agentSkillArchive.js";
import type { AgentSkillMetadata, AgentSkillType } from "../agentSkillTypes.js";
import type { MockRoute } from "./mockServer.js";

export const USER_ID = "00000000-0000-4000-8000-000000000123";

export const skillMarkdown = (name: string, body: string) => `---
name: ${name}
description: Skill ${name}
---

# ${name}

${body}
`;

interface RemoteItem {
    meta: AgentSkillMetadata;
    bytes: Buffer;
}

/** In-memory MAGDA Agent Skill source for one instance/account. */
export class FakeAgentSkillRemote {
    items = new Map<string, RemoteItem>();
    warnings: Array<{ sourceKind: string; code: string }> = [];
    failManifest = false;
    failDownloads = new Set<string>();
    downloads = 0;

    constructor(
        public baseUrl: string,
        private readonly scratch: string,
        public userId = USER_ID,
        public tenantId = "7"
    ) {}

    idFor(name: string, type: AgentSkillType = "user"): string {
        return type === "system"
            ? `agent-skill-${name}`
            : `agent-skill-${this.userId}-${name}`;
    }

    async publish(
        name: string,
        body: string,
        extraFiles: Record<string, string> = {},
        type: AgentSkillType = "user"
    ) {
        const directory = path.join(this.scratch, `publish-${randomUUID()}`);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(
            path.join(directory, "SKILL.md"),
            skillMarkdown(name, body)
        );
        for (const [file, content] of Object.entries(extraFiles)) {
            await fs.mkdir(path.dirname(path.join(directory, file)), {
                recursive: true
            });
            await fs.writeFile(path.join(directory, file), content);
        }
        const archive = await createAgentSkillArchive(directory, type);
        const meta: AgentSkillMetadata = {
            id: this.idFor(name, type),
            name,
            description: `Skill ${name}`,
            type,
            ...(type === "user" ? { userId: this.userId } : {}),
            ownerId: this.userId,
            createdAt: "2025-01-01T00:00:00.000Z",
            createdBy: this.userId,
            updatedAt: "2025-01-01T00:00:00.000Z",
            updatedBy: this.userId,
            checksum: archive.archiveSha256
        };
        this.items.set(meta.id, { meta, bytes: archive.bytes });
        return { meta, archive };
    }

    remove(name: string, type: AgentSkillType = "user"): void {
        this.items.delete(this.idFor(name, type));
    }

    private manifestItems(types: AgentSkillType[]) {
        return [...this.items.values()]
            .filter(({ meta }) => types.includes(meta.type))
            .map(({ meta }) => ({
                selectionId: meta.id,
                effectiveName: meta.name,
                sourceKind:
                    meta.type === "system"
                        ? ("system-publication" as const)
                        : ("own-user-publication" as const),
                source: meta
            }));
    }

    localManifest() {
        return {
            version: 1 as const,
            complete: true as const,
            identity: { tenantId: this.tenantId, userId: this.userId },
            items: this.manifestItems(["user"]),
            warnings: this.warnings
        };
    }

    workspaceManifest() {
        return {
            ...this.localManifest(),
            items: this.manifestItems(["system", "user"])
        };
    }

    client(): AgentSkillClient {
        return ({
            baseUrl: this.baseUrl,
            localManifest: async () => {
                if (this.failManifest) throw new Error("outage");
                return this.localManifest();
            },
            manifest: async () => {
                if (this.failManifest) throw new Error("outage");
                return this.workspaceManifest();
            },
            download: async (ref: { type: AgentSkillType; id: string }) => {
                this.downloads += 1;
                const item = this.items.get(ref.id);
                if (!item || this.failDownloads.has(item.meta.name))
                    throw new Error("download failed");
                return { metadata: item.meta, bytes: item.bytes };
            }
        } as unknown) as AgentSkillClient;
    }

    /** HTTP routes for commands that build their own client. */
    routes(): MockRoute[] {
        return [
            {
                method: "GET",
                path: "/api/v0/agent/skills/local-sync-manifest",
                handler: (_req, res) => {
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(JSON.stringify(this.localManifest()));
                }
            },
            {
                method: "GET",
                path: /^\/api\/v0\/agent\/skills\/(user|system)\/[^/]+\/archive$/,
                handler: (req, res) => {
                    const id = (req.url || "").split("/").slice(-2)[0];
                    const item = this.items.get(id);
                    if (!item) {
                        res.writeHead(404, {
                            "content-type": "application/json"
                        });
                        res.end("{}");
                        return;
                    }
                    res.writeHead(200, { "content-type": "application/zip" });
                    res.end(item.bytes);
                }
            },
            {
                method: "GET",
                path: /^\/api\/v0\/agent\/skills\/(user|system)\/[^/]+$/,
                handler: (req, res) => {
                    const id = (req.url || "").split("?")[0].split("/").pop()!;
                    const item = this.items.get(id);
                    res.writeHead(item ? 200 : 404, {
                        "content-type": "application/json"
                    });
                    res.end(JSON.stringify(item ? item.meta : {}));
                }
            }
        ];
    }
}

export interface HarnessEnvironment {
    tmp: string;
    roots: Record<"claude" | "codex" | "opencode" | "dsh", string>;
    restore: () => Promise<void>;
}

const ENV_KEYS = [
    "HOME",
    "PATH",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "MGD_AGENT_SKILL_DIR",
    "DSH_HOME",
    "MGD_PROFILE",
    "MGD_BASE_URL",
    "MGD_API_KEY_ID",
    "MGD_API_KEY"
];

/**
 * Isolated HOME with detected Claude Code, Codex, OpenCode and DSH roots.
 * PATH is an empty directory, so neither python3 nor harness binaries exist.
 */
export async function createHarnessEnvironment(
    prefix: string
): Promise<HarnessEnvironment> {
    const tmp = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), prefix))
    );
    const original: Record<string, string | undefined> = {};
    for (const key of ENV_KEYS) {
        original[key] = process.env[key];
        delete process.env[key];
    }
    process.env.HOME = path.join(tmp, "home");
    process.env.XDG_CONFIG_HOME = path.join(tmp, "config");
    process.env.XDG_DATA_HOME = path.join(tmp, "data");
    process.env.DSH_HOME = path.join(tmp, "dsh");
    process.env.PATH = path.join(tmp, "empty-bin");
    for (const directory of [
        path.join(tmp, "empty-bin"),
        path.join(tmp, "home", ".claude"),
        path.join(tmp, "home", ".agents"),
        path.join(tmp, "config", "opencode"),
        path.join(tmp, "dsh")
    ])
        await fs.mkdir(directory, { recursive: true });
    return {
        tmp,
        roots: {
            claude: path.join(tmp, "home", ".claude", "skills"),
            codex: path.join(tmp, "home", ".agents", "skills"),
            opencode: path.join(tmp, "config", "opencode", "skills"),
            dsh: path.join(tmp, "dsh", "skills")
        },
        restore: async () => {
            for (const [key, value] of Object.entries(original)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
            await fs.rm(tmp, { recursive: true, force: true });
        }
    };
}

export async function readSkill(directory: string): Promise<string> {
    return fs.readFile(path.join(directory, "SKILL.md"), "utf8");
}

export async function readMarker(directory: string): Promise<any> {
    return JSON.parse(
        await fs.readFile(
            path.join(directory, AGENT_SKILL_INSTALL_MARKER),
            "utf8"
        )
    );
}

export async function pathExists(target: string): Promise<boolean> {
    try {
        await fs.lstat(target);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}
