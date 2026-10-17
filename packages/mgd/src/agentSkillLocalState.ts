import os from "node:os";
import path from "node:path";
import { open, readFile, readdir, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import type {
    AgentSkillRef,
    AgentSkillType,
    WorkspaceSkillManifestItem
} from "./agentSkillTypes.js";
import {
    assertRealManagedAncestors,
    ensureRealDirectory
} from "./agentSkillState.js";

/*
 * Copy-only Agent Skill state (design 2026-10-17):
 *
 *   <data>/mgd/agent-skills/
 *     sources/<source-key>/state.json      verified publication snapshot (v3)
 *     sources/<source-key>/archives/*.zip  immutable verified publication ZIPs
 *     installation-index.json              owned installation paths + baselines
 *     operation-journal.json               only while a transaction is incomplete
 *
 * Each installed skill directory additionally carries .magda-skill-install.json
 * (see AgentSkillInstallMarker). Marker presence alone is never authority: the
 * verified snapshot, verified bytes and this index provide provenance.
 */

export interface AgentSkillSourceIdentity {
    key: string;
    canonicalBaseUrl: string;
    tenantId: string;
    userId: string;
}

export type AgentSkillSourceKind = WorkspaceSkillManifestItem["sourceKind"];

/** One publication from the latest complete, authenticated manifest. */
export interface VerifiedAgentSkillPublication {
    ref: AgentSkillRef;
    name: string;
    description: string;
    sourceKind: AgentSkillSourceKind;
    /** SHA-256 of the exact published ZIP bytes. */
    checksum: string;
    /** Content tree digest of the published skill. */
    treeDigest: string;
    archiveFile: string;
    verifiedAt: string;
    /**
     * Retained from an earlier snapshot because a later manifest could not
     * authoritatively confirm or deny it. Never newly installed or removed.
     */
    unresolved?: true;
}

export interface AgentSkillSourceSnapshot {
    verifiedAt: string;
    /** Manifest warnings at verification; absence was then non-authoritative. */
    warnings: number;
    items: Record<string, VerifiedAgentSkillPublication>;
}

/** Explicit, user-controlled `pull`/`publish` working directory. */
export interface AgentSkillWorkingDirectory {
    type: AgentSkillType;
    name: string;
    ref?: AgentSkillRef;
    baseChecksum?: string;
    treeDigest: string;
}

export interface AgentSkillSourceStateV3 {
    version: 3;
    identity: AgentSkillSourceIdentity;
    /** Absent until one complete authenticated manifest has been verified. */
    snapshot?: AgentSkillSourceSnapshot;
    workingDirectories: Record<string, AgentSkillWorkingDirectory>;
}

export type AgentSkillHarness =
    | "claude"
    | "codex"
    | "opencode"
    | "dsh"
    | "custom";

export interface AgentSkillInstallation {
    /** Random token shared with the directory's installation marker. */
    installationId: string;
    harness: AgentSkillHarness;
    root: string;
    name: string;
    path: string;
    /** Verified source identity key. */
    sourceKey: string;
    ref: AgentSkillRef;
    sourceKind: AgentSkillSourceKind;
    /** Previous installed baseline: published checksum and content digest. */
    baselineChecksum: string;
    baselineTreeDigest: string;
    installedAt: string;
    updatedAt: string;
    /** Future #3861: Registry installation record and recipient alias. */
    installationRecordId?: string;
    alias?: string;
}

export interface AgentSkillInstallationIndexV1 {
    version: 1;
    activeProfile?: string;
    activeSourceKey?: string;
    installations: Record<string, AgentSkillInstallation>;
    /** Rollback data an interrupted commit could not restore; never deleted. */
    retainedPaths?: string[];
}

export interface AgentSkillInstallMarker {
    format: "magda-agent-skill-installation";
    version: 1;
    installationId: string;
    sourceKey: string;
    source: { type: AgentSkillType; id: string; kind: AgentSkillSourceKind };
    name: string;
    baselineChecksum: string;
    baselineTreeDigest: string;
    installedAt: string;
    installationRecordId?: string;
    alias?: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RECORD_ID = /^agent-skill-[a-zA-Z0-9-]+$/;
const SOURCE_KINDS = new Set([
    "system-publication",
    "own-user-publication",
    "installation"
]);

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

export function installationKey(root: string, name: string): string {
    return `${path.resolve(root)}\0${name}`;
}

export function agentSkillSourceRoot(
    identity: Pick<AgentSkillSourceIdentity, "key">,
    env: NodeJS.ProcessEnv = process.env
): string {
    return path.join(agentSkillDataRoot(env), "sources", identity.key);
}

export function agentSkillSourceStatePath(
    identity: Pick<AgentSkillSourceIdentity, "key">,
    env: NodeJS.ProcessEnv = process.env
): string {
    return path.join(agentSkillSourceRoot(identity, env), "state.json");
}

export function agentSkillArchivePath(
    identity: Pick<AgentSkillSourceIdentity, "key">,
    ref: AgentSkillRef,
    checksum: string,
    env: NodeJS.ProcessEnv = process.env
): string {
    return path.join(
        agentSkillSourceRoot(identity, env),
        "archives",
        `${ref.id}-${checksum}.zip`
    );
}

export function agentSkillInstallationIndexPath(
    env: NodeJS.ProcessEnv = process.env
): string {
    return path.join(agentSkillDataRoot(env), "installation-index.json");
}

/** Write JSON through an fsynced private temporary file and atomic rename. */
export async function writeJsonAtomically(
    target: string,
    value: unknown
): Promise<void> {
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

async function readJsonIfPresent(file: string): Promise<unknown | undefined> {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
        throw error;
    }
}

function isRef(value: unknown): value is AgentSkillRef {
    const ref = value as AgentSkillRef;
    return (
        !!ref &&
        (ref.type === "system" || ref.type === "user") &&
        typeof ref.id === "string" &&
        RECORD_ID.test(ref.id)
    );
}

function assertPublication(
    key: string,
    item: VerifiedAgentSkillPublication,
    identity: AgentSkillSourceIdentity,
    env: NodeJS.ProcessEnv
): void {
    const expectedArchive = agentSkillArchivePath(
        identity,
        item.ref,
        item.checksum,
        env
    );
    if (
        !isRef(item.ref) ||
        key !== sourceStateKey(item.ref) ||
        !SKILL_NAME.test(item.name) ||
        typeof item.description !== "string" ||
        !SOURCE_KINDS.has(item.sourceKind) ||
        !HEX64.test(item.checksum) ||
        !HEX64.test(item.treeDigest) ||
        path.resolve(item.archiveFile) !== path.resolve(expectedArchive)
    ) {
        throw new Error("Agent Skill source state contains an unsafe entry");
    }
}

function emptySourceState(
    identity: AgentSkillSourceIdentity
): AgentSkillSourceStateV3 {
    return { version: 3, identity, workingDirectories: {} };
}

function sameIdentity(
    left: AgentSkillSourceIdentity | undefined,
    right: AgentSkillSourceIdentity
): boolean {
    return (
        !!left &&
        left.key === right.key &&
        left.canonicalBaseUrl === right.canonicalBaseUrl &&
        left.tenantId === right.tenantId &&
        left.userId === right.userId
    );
}

export async function loadAgentSkillSourceState(
    identity: AgentSkillSourceIdentity,
    env: NodeJS.ProcessEnv = process.env
): Promise<AgentSkillSourceStateV3> {
    await assertRealManagedAncestors(agentSkillSourceRoot(identity, env));
    const value = (await readJsonIfPresent(
        agentSkillSourceStatePath(identity, env)
    )) as any;
    // Pre-release (v1/v2) state is intentionally not migrated: it is ignored
    // and replaced on the next save. Files it referenced are never deleted.
    if (value === undefined || value?.version !== 3)
        return emptySourceState(identity);
    if (!sameIdentity(value?.identity, identity)) {
        throw new Error("Agent Skill source state identity is invalid");
    }
    if (
        !value.workingDirectories ||
        typeof value.workingDirectories !== "object" ||
        (value.snapshot !== undefined &&
            (typeof value.snapshot !== "object" ||
                !value.snapshot.items ||
                typeof value.snapshot.items !== "object"))
    ) {
        throw new Error("Agent Skill source state has an unsupported format");
    }
    const state = value as AgentSkillSourceStateV3;
    for (const [key, item] of Object.entries(state.snapshot?.items || {}))
        assertPublication(key, item, identity, env);
    return state;
}

export async function loadAgentSkillSourceStateByKey(
    sourceKey: string,
    env: NodeJS.ProcessEnv = process.env
): Promise<AgentSkillSourceStateV3 | undefined> {
    if (!HEX64.test(sourceKey)) return undefined;
    const sourceRoot = path.join(agentSkillDataRoot(env), "sources", sourceKey);
    await assertRealManagedAncestors(sourceRoot);
    const parsed = (await readJsonIfPresent(
        path.join(sourceRoot, "state.json")
    )) as { identity?: AgentSkillSourceIdentity } | undefined;
    if (!parsed) return undefined;
    if (parsed.identity?.key !== sourceKey)
        throw new Error("Agent Skill source state identity is invalid");
    return loadAgentSkillSourceState(parsed.identity, env);
}

export async function saveAgentSkillSourceState(
    state: AgentSkillSourceStateV3,
    env: NodeJS.ProcessEnv = process.env
): Promise<void> {
    await writeJsonAtomically(agentSkillSourceStatePath(state.identity, env), {
        ...state,
        version: 3
    });
}

function assertInstallation(key: string, item: AgentSkillInstallation): void {
    if (
        !item ||
        !UUID.test(item.installationId) ||
        !["claude", "codex", "opencode", "dsh", "custom"].includes(
            item.harness
        ) ||
        typeof item.root !== "string" ||
        !path.isAbsolute(item.root) ||
        !SKILL_NAME.test(item.name) ||
        item.path !== path.join(path.resolve(item.root), item.name) ||
        key !== installationKey(item.root, item.name) ||
        !HEX64.test(item.sourceKey) ||
        !isRef(item.ref) ||
        !SOURCE_KINDS.has(item.sourceKind) ||
        !HEX64.test(item.baselineChecksum) ||
        !HEX64.test(item.baselineTreeDigest)
    ) {
        throw new Error(
            "Agent Skill installation index contains an unsafe entry"
        );
    }
}

export function emptyInstallationIndex(): AgentSkillInstallationIndexV1 {
    return { version: 1, installations: {} };
}

export async function loadAgentSkillInstallationIndex(
    env: NodeJS.ProcessEnv = process.env
): Promise<AgentSkillInstallationIndexV1> {
    await assertRealManagedAncestors(agentSkillDataRoot(env));
    const value = (await readJsonIfPresent(
        agentSkillInstallationIndexPath(env)
    )) as AgentSkillInstallationIndexV1 | undefined;
    if (value === undefined) return emptyInstallationIndex();
    if (
        value.version !== 1 ||
        !value.installations ||
        typeof value.installations !== "object" ||
        (value.activeSourceKey !== undefined &&
            !HEX64.test(value.activeSourceKey))
    ) {
        throw new Error("Agent Skill installation index is invalid");
    }
    for (const [key, item] of Object.entries(value.installations))
        assertInstallation(key, item);
    return value;
}

export async function saveAgentSkillInstallationIndex(
    index: AgentSkillInstallationIndexV1,
    env: NodeJS.ProcessEnv = process.env
): Promise<void> {
    await writeJsonAtomically(agentSkillInstallationIndexPath(env), index);
}

export function markerForInstallation(
    item: AgentSkillInstallation
): AgentSkillInstallMarker {
    return {
        format: "magda-agent-skill-installation",
        version: 1,
        installationId: item.installationId,
        sourceKey: item.sourceKey,
        source: { type: item.ref.type, id: item.ref.id, kind: item.sourceKind },
        name: item.name,
        baselineChecksum: item.baselineChecksum,
        baselineTreeDigest: item.baselineTreeDigest,
        installedAt: item.installedAt,
        ...(item.installationRecordId
            ? { installationRecordId: item.installationRecordId }
            : {}),
        ...(item.alias ? { alias: item.alias } : {})
    };
}

export function serializeInstallMarker(item: AgentSkillInstallation): string {
    return JSON.stringify(markerForInstallation(item), null, 2) + "\n";
}

/** True only when the marker exactly describes this indexed installation. */
export function markerMatchesInstallation(
    raw: Buffer | undefined,
    item: AgentSkillInstallation | undefined
): boolean {
    if (!raw || !item) return false;
    let parsed: AgentSkillInstallMarker;
    try {
        parsed = JSON.parse(raw.toString("utf8"));
    } catch {
        return false;
    }
    const expected = markerForInstallation(item);
    return (
        parsed?.format === expected.format &&
        parsed.version === expected.version &&
        parsed.installationId === expected.installationId &&
        parsed.sourceKey === expected.sourceKey &&
        parsed.source?.type === expected.source.type &&
        parsed.source?.id === expected.source.id &&
        parsed.source?.kind === expected.source.kind &&
        parsed.name === expected.name &&
        parsed.baselineChecksum === expected.baselineChecksum &&
        parsed.baselineTreeDigest === expected.baselineTreeDigest
    );
}

export function newInstallationId(): string {
    return randomUUID();
}

/** Write bytes through an fsynced private temporary file and atomic rename. */
export async function writeFileAtomically(
    target: string,
    bytes: Buffer
): Promise<void> {
    await ensureRealDirectory(path.dirname(target));
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
        await handle.writeFile(bytes);
        await handle.sync();
    } finally {
        await handle.close();
    }
    await rename(temporary, target);
}

/**
 * Find the source account that tracks an explicit `pull`/`publish` working
 * directory, so it is never published under another account.
 */
export async function findAgentSkillWorkingDirectory(
    absolutePath: string,
    env: NodeJS.ProcessEnv = process.env
): Promise<
    { sourceKey: string; directory: AgentSkillWorkingDirectory } | undefined
> {
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
        const value = (await readJsonIfPresent(
            path.join(sources, sourceKey, "state.json")
        ).catch(() => undefined)) as any;
        if (value?.identity?.key !== sourceKey) continue;
        const directory =
            value.version === 3
                ? value.workingDirectories?.[absolutePath]
                : undefined;
        if (directory) return { sourceKey, directory };
    }
    return undefined;
}
