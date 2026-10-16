import os from "node:os";
import path from "node:path";
import {
    copyFile,
    open,
    readFile,
    readdir,
    rename,
    stat,
    unlink
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import type { AgentSkillRef, AgentSkillType } from "./agentSkillTypes.js";
import {
    assertRealManagedAncestors,
    ensureRealDirectory
} from "./agentSkillState.js";

export interface AgentSkillSourceIdentity {
    key: string;
    canonicalBaseUrl: string;
    tenantId: string;
    userId: string;
}

export interface CachedAgentSkillEntry {
    ref: AgentSkillRef;
    name: string;
    description: string;
    libraryDir: string;
    archiveFile: string;
    remoteChecksum: string;
    installedTreeDigest: string;
    updatedAt: string;
}

export interface SourceDraftState {
    type: AgentSkillType;
    name: string;
    ref?: AgentSkillRef;
    baseChecksum?: string;
    treeDigest: string;
}

export interface AgentSkillSourceStateV2 {
    version: 2;
    identity: AgentSkillSourceIdentity;
    lastSuccessfulSyncAt?: string;
    entries: Record<string, CachedAgentSkillEntry>;
    drafts: Record<string, SourceDraftState>;
}

export interface AgentSkillProjectionEntry {
    root: string;
    name: string;
    path: string;
    mode: "symlink" | "copy";
    sourceKey: string;
    sourceEntryKey: string;
    sourceDir: string;
    projectedTreeDigest: string;
    ownershipToken: string;
    phase: "planned" | "ready";
    stagingPath?: string;
    symlinkTarget?: string;
    preservationPath?: string;
    preservationDraftDir?: string;
}

export interface AgentSkillProjectionStateV2 {
    version: 2;
    activeSourceKey?: string;
    activeProfile?: string;
    entries: Record<string, AgentSkillProjectionEntry>;
}

const configBase = (env: NodeJS.ProcessEnv = process.env) =>
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim()
        ? env.XDG_CONFIG_HOME
        : path.join(os.homedir(), ".config");

export function agentSkillDataRoot(
    env: NodeJS.ProcessEnv = process.env
): string {
    const base =
        env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim()
            ? env.XDG_DATA_HOME
            : path.join(os.homedir(), ".local", "share");
    return path.resolve(base, "mgd", "agent-skills");
}

export function canonicalMagdaBaseUrl(value: string): string {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    if (
        (url.protocol === "https:" && url.port === "443") ||
        (url.protocol === "http:" && url.port === "80")
    ) {
        url.port = "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
}

export function createAgentSkillSourceIdentity(input: {
    baseUrl: string;
    tenantId: string | number;
    userId: string;
}): AgentSkillSourceIdentity {
    const canonicalBaseUrl = canonicalMagdaBaseUrl(input.baseUrl);
    const tenantId = String(input.tenantId);
    const material = JSON.stringify([canonicalBaseUrl, tenantId, input.userId]);
    return {
        key: createHash("sha256").update(material).digest("hex"),
        canonicalBaseUrl,
        tenantId,
        userId: input.userId
    };
}

export function sourceStateKey(ref: AgentSkillRef): string {
    return `${ref.type}/${ref.id}`;
}

export function agentSkillSourceRoot(
    identity: AgentSkillSourceIdentity,
    env: NodeJS.ProcessEnv = process.env
): string {
    return path.join(agentSkillDataRoot(env), "sources", identity.key);
}

export function agentSkillSourceStatePath(
    identity: AgentSkillSourceIdentity,
    env: NodeJS.ProcessEnv = process.env
): string {
    return path.join(agentSkillSourceRoot(identity, env), "state.json");
}

export function agentSkillProjectionStatePath(
    env: NodeJS.ProcessEnv = process.env
): string {
    return path.join(agentSkillDataRoot(env), "projection.json");
}

async function atomicJson(target: string, value: unknown): Promise<void> {
    await ensureRealDirectory(path.dirname(target));
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
        await handle.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
    await rename(temporary, target);
}

export async function loadAgentSkillSourceState(
    identity: AgentSkillSourceIdentity,
    env: NodeJS.ProcessEnv = process.env
): Promise<AgentSkillSourceStateV2> {
    try {
        await assertRealManagedAncestors(agentSkillSourceRoot(identity, env));
        const value = JSON.parse(
            await readFile(agentSkillSourceStatePath(identity, env), "utf8")
        ) as AgentSkillSourceStateV2;
        if (
            value.version !== 2 ||
            value.identity?.key !== identity.key ||
            value.identity.canonicalBaseUrl !== identity.canonicalBaseUrl ||
            value.identity.tenantId !== identity.tenantId ||
            value.identity.userId !== identity.userId ||
            !value.entries ||
            typeof value.entries !== "object" ||
            !value.drafts ||
            typeof value.drafts !== "object"
        ) {
            throw new Error("Agent Skill source state identity is invalid");
        }
        const root = agentSkillSourceRoot(identity, env);
        for (const [key, entry] of Object.entries(value.entries)) {
            const expectedKey = sourceStateKey(entry.ref);
            const expectedLibrary = path.join(root, "skills", entry.ref.id);
            const expectedArchive = path.join(
                root,
                "archives",
                `${entry.ref.id}.zip`
            );
            if (
                key !== expectedKey ||
                entry.ref.type !== "user" ||
                !/^agent-skill-[a-zA-Z0-9-]+$/.test(entry.ref.id) ||
                !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) ||
                path.resolve(entry.libraryDir) !==
                    path.resolve(expectedLibrary) ||
                path.resolve(entry.archiveFile) !==
                    path.resolve(expectedArchive) ||
                !/^[0-9a-f]{64}$/.test(entry.remoteChecksum) ||
                !/^[0-9a-f]{64}$/.test(entry.installedTreeDigest)
            ) {
                throw new Error(
                    "Agent Skill source state contains an unsafe entry"
                );
            }
        }
        return value;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return {
            version: 2,
            identity,
            entries: {},
            drafts: {}
        };
    }
}

export async function loadAgentSkillSourceStateByKey(
    sourceKey: string,
    env: NodeJS.ProcessEnv = process.env
): Promise<AgentSkillSourceStateV2> {
    if (!/^[0-9a-f]{64}$/.test(sourceKey))
        throw new Error("Invalid Agent Skill source key");
    const sourceRoot = path.join(agentSkillDataRoot(env), "sources", sourceKey);
    await assertRealManagedAncestors(sourceRoot);
    const file = path.join(sourceRoot, "state.json");
    const parsed = JSON.parse(await readFile(file, "utf8")) as {
        identity?: AgentSkillSourceIdentity;
    };
    if (parsed.identity?.key !== sourceKey)
        throw new Error("Agent Skill source state identity is invalid");
    return loadAgentSkillSourceState(parsed.identity, env);
}

export async function saveAgentSkillSourceState(
    state: AgentSkillSourceStateV2,
    env: NodeJS.ProcessEnv = process.env
): Promise<void> {
    await atomicJson(agentSkillSourceStatePath(state.identity, env), state);
}

export async function loadAgentSkillProjectionState(
    env: NodeJS.ProcessEnv = process.env
): Promise<AgentSkillProjectionStateV2> {
    try {
        await assertRealManagedAncestors(agentSkillDataRoot(env));
        const value = JSON.parse(
            await readFile(agentSkillProjectionStatePath(env), "utf8")
        ) as AgentSkillProjectionStateV2;
        if (
            value.version !== 2 ||
            !value.entries ||
            typeof value.entries !== "object"
        ) {
            throw new Error("Agent Skill projection state is invalid");
        }
        const sources = new Map<string, AgentSkillSourceStateV2>();
        for (const entry of Object.values(value.entries)) {
            if (
                !path.isAbsolute(entry.root) ||
                !path.isAbsolute(entry.path) ||
                path.dirname(entry.path) !== path.resolve(entry.root) ||
                path.basename(entry.path) !== entry.name ||
                !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) ||
                (entry.mode !== "copy" && entry.mode !== "symlink") ||
                !/^[0-9a-f]{64}$/.test(entry.sourceKey) ||
                !/^[0-9a-f]{64}$/.test(entry.projectedTreeDigest) ||
                !/^[0-9a-f-]{36}$/.test(entry.ownershipToken) ||
                (entry.phase !== "planned" && entry.phase !== "ready") ||
                (entry.stagingPath !== undefined &&
                    (!path.isAbsolute(entry.stagingPath) ||
                        entry.stagingPath !==
                            `${entry.path}.mgd-stage-${entry.ownershipToken}`)) ||
                (entry.symlinkTarget !== undefined &&
                    entry.symlinkTarget !==
                        path.join(
                            agentSkillDataRoot(env),
                            "projection-links",
                            entry.ownershipToken
                        )) ||
                (entry.preservationPath !== undefined &&
                    entry.preservationPath !==
                        path.join(
                            path.resolve(entry.root),
                            ".mgd-agent-skill-preservation",
                            entry.ownershipToken
                        ))
            ) {
                throw new Error(
                    "Agent Skill projection state contains an unsafe entry"
                );
            }
            let source = sources.get(entry.sourceKey);
            if (!source) {
                source = await loadAgentSkillSourceStateByKey(
                    entry.sourceKey,
                    env
                );
                sources.set(entry.sourceKey, source);
            }
            const sourceEntry = source.entries[entry.sourceEntryKey];
            const primaryRoot = path.join(
                agentSkillDataRoot(env),
                "projection-content",
                entry.sourceKey
            );
            const expectedSourceDir =
                path.resolve(entry.root) === primaryRoot
                    ? sourceEntry?.libraryDir
                    : path.join(primaryRoot, entry.name);
            if (
                !sourceEntry ||
                entry.sourceDir !== expectedSourceDir ||
                (entry.preservationDraftDir !== undefined &&
                    entry.preservationDraftDir !==
                        path.join(
                            agentSkillSourceRoot(source.identity, env),
                            "drafts",
                            "projection",
                            `${entry.name}-${entry.ownershipToken}`
                        ))
            )
                throw new Error(
                    "Agent Skill projection state contains an unsafe source reference"
                );
        }
        return value;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return { version: 2, entries: {} };
    }
}

export async function saveAgentSkillProjectionState(
    state: AgentSkillProjectionStateV2,
    env: NodeJS.ProcessEnv = process.env
): Promise<void> {
    await atomicJson(agentSkillProjectionStatePath(env), state);
}

export async function findTrackedAgentSkillDraft(
    absolutePath: string,
    env: NodeJS.ProcessEnv = process.env
): Promise<{ sourceKey: string; draft: SourceDraftState } | undefined> {
    // V1 did not record a trustworthy instance/tenant/user tuple. Detect its
    // tracked drafts, but deliberately never bind them to the selected profile.
    try {
        const legacy = JSON.parse(
            await readFile(
                path.join(configBase(env), "mgd", "agent-skills-v1.json"),
                "utf8"
            )
        ) as { drafts?: Record<string, SourceDraftState> };
        if (legacy.drafts?.[absolutePath]) {
            return {
                sourceKey: "legacy-unverified",
                draft: legacy.drafts[absolutePath]
            };
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const sources = path.join(agentSkillDataRoot(env), "sources");
    await assertRealManagedAncestors(sources);
    let keys: string[];
    try {
        keys = await readdir(sources);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
        throw error;
    }
    for (const sourceKey of keys) {
        try {
            const value = JSON.parse(
                await readFile(
                    path.join(sources, sourceKey, "state.json"),
                    "utf8"
                )
            ) as AgentSkillSourceStateV2;
            const draft = value.drafts?.[absolutePath];
            if (
                value.version === 2 &&
                value.identity?.key === sourceKey &&
                draft
            )
                return { sourceKey, draft };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }
    return undefined;
}

export async function migrateLegacyAgentSkillState(
    env: NodeJS.ProcessEnv = process.env
): Promise<string | undefined> {
    const legacy = path.join(configBase(env), "mgd", "agent-skills-v1.json");
    try {
        await assertRealManagedAncestors(path.dirname(legacy));
        await stat(legacy);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
        throw error;
    }
    const migrationDir = path.join(agentSkillDataRoot(env), "migration");
    await ensureRealDirectory(migrationDir);
    const destination = path.join(
        migrationDir,
        `agent-skills-v1-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    try {
        await rename(legacy, destination);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        await copyFile(legacy, destination, 0);
        const copied = await open(destination, "r");
        try {
            await copied.sync();
        } finally {
            await copied.close();
        }
        await unlink(legacy);
    }
    return destination;
}
