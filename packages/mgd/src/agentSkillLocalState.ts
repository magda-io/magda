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
 * Agent Skill state (scan-based design, 2026-10-18). The only durable state is:
 *
 *   - the existing `mgd` profile configuration (active profile);
 *   - <data>/mgd/agent-skills/sources/<source-key>/ — each verified account's
 *     publication snapshot, immutable archives and explicit `pull` provenance;
 *   - `.magda-skill-install.json` inside each installed skill directory, the
 *     sole record of that installation (see AgentSkillInstallMarker).
 *
 * There is no installation index or operation journal: installations are found
 * by scanning harness roots. A marker is a provenance hint that is validated
 * against the verified source cache, never authorization on its own.
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
    /** #3861: the recipient installation that selected a shared source. */
    installationRecordId?: string;
    /** #3861: recipient alias; the local SKILL.md is renamed to it. */
    alias?: string;
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

/** Root-level `.magda-skill-install.json`; never contains credentials. */
export interface AgentSkillInstallMarker {
    format: "magda-agent-skill-installation";
    version: 1;
    /** Random per-installation id; also identifies per-skill staging. */
    installationId: string;
    sourceKey: string;
    source: { type: AgentSkillType; id: string; kind: AgentSkillSourceKind };
    name: string;
    baselineChecksum: string;
    baselineTreeDigest: string;
    installedAt: string;
    /**
     * #3861, kind "installation" only: the recipient's installation record
     * (`agent-skill-<recipient>-<name>`) and, when the local name differs
     * from the publisher's, the recipient alias (equal to `name`).
     */
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

/**
 * Snapshot key of one desired item: a publication by its ref, an installed
 * shared source by its recipient installation (one source may be installed
 * under several aliases).
 */
export function snapshotKey(item: {
    ref: AgentSkillRef;
    sourceKind: AgentSkillSourceKind;
    installationRecordId?: string;
}): string {
    return item.sourceKind === "installation"
        ? `installation/${item.installationRecordId}`
        : sourceStateKey(item.ref);
}

const INSTALLATION_RECORD_ID = /^agent-skill-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Structural identity of an installed shared source: the recipient's own
 * installation of another user's user publication, with a consistent
 * effective name and alias.
 */
export function validInstallationIdentity(
    value: {
        ref: AgentSkillRef;
        name: string;
        installationRecordId?: string;
        alias?: string;
    },
    recipientId?: string
): boolean {
    const installation = INSTALLATION_RECORD_ID.exec(
        value.installationRecordId || ""
    );
    const source = INSTALLATION_RECORD_ID.exec(value.ref.id);
    return (
        value.ref.type === "user" &&
        !!installation &&
        !!source &&
        installation[2] === value.name &&
        (recipientId === undefined || installation[1] === recipientId) &&
        source[1] !== installation[1] &&
        (value.alias === undefined
            ? source[2] === value.name
            : value.alias === value.name && source[2] !== value.name)
    );
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
        key !== snapshotKey(item) ||
        (item.sourceKind === "installation"
            ? !validInstallationIdentity(item, identity.userId)
            : item.installationRecordId !== undefined ||
              item.alias !== undefined) ||
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

export function createInstallMarker(
    sourceKey: string,
    publication: VerifiedAgentSkillPublication,
    installedAt = new Date().toISOString()
): AgentSkillInstallMarker {
    return {
        format: "magda-agent-skill-installation",
        version: 1,
        installationId: randomUUID(),
        sourceKey,
        source: {
            type: publication.ref.type,
            id: publication.ref.id,
            kind: publication.sourceKind
        },
        name: publication.name,
        baselineChecksum: publication.checksum,
        baselineTreeDigest: publication.treeDigest,
        installedAt,
        ...(publication.sourceKind === "installation"
            ? {
                  installationRecordId: publication.installationRecordId,
                  ...(publication.alias ? { alias: publication.alias } : {})
              }
            : {})
    };
}

export function serializeInstallMarker(
    marker: AgentSkillInstallMarker
): string {
    return JSON.stringify(marker, null, 2) + "\n";
}

/**
 * Parse a marker read from `<root>/<directoryName>/`. Returns undefined unless
 * every field is well formed and it describes a skill of exactly that name.
 */
export function parseInstallMarker(
    raw: Buffer | undefined,
    directoryName: string
): AgentSkillInstallMarker | undefined {
    if (!raw) return undefined;
    let value: AgentSkillInstallMarker;
    try {
        value = JSON.parse(raw.toString("utf8"));
    } catch {
        return undefined;
    }
    const ref = { type: value?.source?.type, id: value?.source?.id };
    if (
        value?.format !== "magda-agent-skill-installation" ||
        value.version !== 1 ||
        typeof value.installationId !== "string" ||
        !UUID.test(value.installationId) ||
        typeof value.sourceKey !== "string" ||
        !HEX64.test(value.sourceKey) ||
        !isRef(ref) ||
        !SOURCE_KINDS.has(value.source.kind) ||
        value.name !== directoryName ||
        !SKILL_NAME.test(value.name) ||
        typeof value.baselineChecksum !== "string" ||
        !HEX64.test(value.baselineChecksum) ||
        typeof value.baselineTreeDigest !== "string" ||
        !HEX64.test(value.baselineTreeDigest) ||
        typeof value.installedAt !== "string" ||
        (value.source.kind === "installation"
            ? !validInstallationIdentity({
                  ref,
                  name: value.name,
                  installationRecordId: value.installationRecordId,
                  alias: value.alias
              })
            : value.installationRecordId !== undefined ||
              value.alias !== undefined ||
              // The publication id must name this skill.
              (ref.id !== `agent-skill-${value.name}` &&
                  !ref.id.endsWith(`-${value.name}`)))
    )
        return undefined;
    return value;
}

/**
 * Corroborate a marker with this machine's verified account cache: its source
 * must be a previously verified identity, and an own-user publication must
 * belong to that identity's user.
 */
export async function verifiedMarkerSource(
    marker: AgentSkillInstallMarker,
    env: NodeJS.ProcessEnv = process.env
): Promise<AgentSkillSourceStateV3 | undefined> {
    let state: AgentSkillSourceStateV3 | undefined;
    try {
        state = await loadAgentSkillSourceStateByKey(marker.sourceKey, env);
    } catch {
        return undefined;
    }
    if (!state) return undefined;
    if (
        marker.source.kind === "own-user-publication" &&
        (marker.source.type !== "user" ||
            marker.source.id !==
                `agent-skill-${state.identity.userId}-${marker.name}`)
    )
        return undefined;
    if (
        marker.source.kind === "system-publication" &&
        (marker.source.type !== "system" ||
            marker.source.id !== `agent-skill-${marker.name}`)
    )
        return undefined;
    // An installed shared copy belongs to the recipient account that
    // installed it, never to the original publisher.
    if (
        marker.source.kind === "installation" &&
        !validInstallationIdentity(
            {
                ref: { type: marker.source.type, id: marker.source.id },
                name: marker.name,
                installationRecordId: marker.installationRecordId,
                alias: marker.alias
            },
            state.identity.userId
        )
    )
        return undefined;
    return state;
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
