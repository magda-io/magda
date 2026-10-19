import path from "node:path";
import { readFile, readdir, rm } from "node:fs/promises";
import { sha256Hex, validateAgentSkillArchive } from "./agentSkillArchive.js";
import type {
    AgentSkillSourceIdentity,
    AgentSkillSourceStateV3,
    VerifiedAgentSkillPublication
} from "./agentSkillLocalState.js";
import {
    agentSkillArchivePath,
    agentSkillSourceRoot,
    canonicalMagdaBaseUrl,
    createAgentSkillSourceIdentity,
    loadAgentSkillSourceState,
    loadAgentSkillSourceStateByKey,
    saveAgentSkillSourceState,
    sourceStateKey,
    writeFileAtomically
} from "./agentSkillLocalState.js";
import type { ReconcileOutcome } from "./agentSkillReconcile.js";
import { reconcileAgentSkillInstallations } from "./agentSkillReconcile.js";
import { AgentSkillClient } from "./agentSkillClient.js";
import { clientFor } from "./client.js";
import { UsageError } from "./errors.js";
import {
    ensureRealDirectory,
    withAgentSkillStateLock
} from "./agentSkillState.js";
import type {
    AgentSkillListType,
    AgentSkillMetadata,
    AgentSkillSyncItemResult,
    AgentSkillSyncResult,
    AgentSkillType,
    WorkspaceSkillManifestItem
} from "./agentSkillTypes.js";
import type { Profile } from "./profile.js";
import { loadConfig, resolveProfile, saveConfig } from "./profile.js";
import {
    resolveAgentSkillTargets,
    resolveWorkspaceAgentSkillTarget
} from "./skills.js";

/** Run under the cross-process Agent Skill lock. */
export function withAgentSkillOperationLock<T>(
    fn: () => Promise<T>
): Promise<T> {
    return withAgentSkillStateLock(fn);
}

function emptyCounts() {
    return {
        installed: 0,
        updated: 0,
        unchanged: 0,
        removed: 0,
        skipped: 0,
        failed: 0
    };
}

export function failedSyncResult(
    code = "MANIFEST_UNAVAILABLE"
): AgentSkillSyncResult {
    // An unavailable manifest stops before any installed skill changes.
    const remoteSourceFailed = code === "MANIFEST_UNAVAILABLE";
    return {
        ...(remoteSourceFailed ? { remoteSourceFailed: true as const } : {}),
        status: "failed",
        counts: { ...emptyCounts(), failed: 1 },
        items: [
            {
                ref: { type: "user", id: "manifest" },
                name: "manifest",
                action: "failed",
                code
            }
        ],
        manifestWarnings: 0
    };
}

const SYSTEM_FAILURES = new Set(["UNSAFE_PATH", "OPERATION_FAILED"]);

/**
 * One result format for sync and profile switching. `success` means every
 * eligible target reconciled; `partial` means problems remain (conflicts,
 * held or failed skills, warnings); `failed` means nothing could proceed.
 */
export function reconcileResult(
    outcome: ReconcileOutcome,
    extra: { notes?: AgentSkillSyncItemResult[] } = {}
): AgentSkillSyncResult {
    const recordedFailures = new Set(
        outcome.items
            .filter((item) => item.action === "failed")
            .map((item) => item.path)
    );
    const items = [
        ...(extra.notes || []),
        ...outcome.items,
        ...outcome.problems
            .filter(
                (problem) =>
                    !(
                        problem.reason === "OPERATION_FAILED" &&
                        recordedFailures.has(problem.path)
                    )
            )
            .map(
                (problem): AgentSkillSyncItemResult => ({
                    ref: { type: "user", id: problem.name },
                    name: problem.name,
                    action: SYSTEM_FAILURES.has(problem.reason)
                        ? "failed"
                        : "skipped",
                    code: problem.reason,
                    harness: problem.harness,
                    path: problem.path
                })
            )
    ];
    const counts = emptyCounts();
    for (const item of items) counts[item.action] += 1;
    const progressed =
        counts.installed + counts.updated + counts.removed + counts.unchanged;
    const troubled = outcome.problems.length + counts.skipped > 0;
    const status: AgentSkillSyncResult["status"] = !troubled
        ? "success"
        : progressed === 0 &&
          outcome.problems.some((problem) =>
              SYSTEM_FAILURES.has(problem.reason)
          )
        ? "failed"
        : "partial";
    return {
        status,
        counts,
        items,
        manifestWarnings: 0,
        ...(outcome.problems.length ? { conflicts: outcome.problems } : {})
    };
}

/**
 * Load a content-addressed cached archive and prove it is exactly the
 * expected publication. Returns its tree digest, or undefined if absent or
 * not an exact match (which then requires a fresh authenticated download).
 */
async function verifiedCachedArchive(
    archiveFile: string,
    expected: {
        type: AgentSkillType;
        checksum: string;
        name: string;
        description: string;
    }
): Promise<string | undefined> {
    let bytes: Buffer;
    try {
        bytes = await readFile(archiveFile);
    } catch {
        return undefined;
    }
    if (sha256Hex(bytes) !== expected.checksum) return undefined;
    try {
        const validated = await validateAgentSkillArchive(bytes, expected.type);
        return validated.name === expected.name &&
            validated.description === expected.description
            ? validated.treeDigest
            : undefined;
    } catch {
        return undefined;
    }
}

export type PreparedSnapshot =
    | {
          ok: true;
          state: AgentSkillSourceStateV3;
          desired: VerifiedAgentSkillPublication[];
          reused: number;
          downloaded: number;
      }
    | { ok: false; failures: AgentSkillSyncItemResult[] };

/**
 * Global remote preparation: obtain and verify every publication of the
 * complete current manifest before any installed skill may change. A cached
 * archive is reused only when its checksum exactly matches the manifest
 * (e.g. bytes this machine just published). Any manifest warning, failed
 * download or validation failure aborts the whole online sync and leaves the
 * previous verified snapshot untouched; already validated blobs may remain
 * cached as immutable content, but no partial snapshot is committed.
 */
export async function prepareVerifiedSnapshot(
    client: AgentSkillClient,
    identity: AgentSkillSourceIdentity,
    manifest: {
        items: WorkspaceSkillManifestItem[];
        warnings: Array<{
            sourceKind?: string;
            code?: string;
            recordId?: string;
        }>;
    },
    type?: AgentSkillType
): Promise<PreparedSnapshot> {
    const failures: AgentSkillSyncItemResult[] = manifest.warnings.map(
        (warning) => ({
            ref: { type: "user", id: warning.recordId || "manifest" },
            name: warning.recordId || warning.sourceKind || "manifest",
            action: "failed",
            code: `MANIFEST_WARNING_${warning.code || "UNKNOWN"}`
        })
    );
    if (failures.length) return { ok: false, failures };
    const state = await loadAgentSkillSourceState(identity);
    await ensureRealDirectory(agentSkillSourceRoot(identity));
    const items: Record<string, VerifiedAgentSkillPublication> = {};
    // A type-scoped Workspace sync keeps other types' verified entries.
    for (const [key, item] of Object.entries(state.snapshot?.items || {}))
        if (type && item.ref.type !== type) items[key] = item;
    const now = new Date().toISOString();
    let reused = 0;
    let downloaded = 0;
    for (const item of manifest.items) {
        if (type && item.source.type !== type) continue;
        const ref = { type: item.source.type, id: item.source.id };
        const expected = {
            type: ref.type,
            checksum: item.source.checksum,
            name: item.effectiveName,
            description: item.source.description
        };
        const archiveFile = agentSkillArchivePath(
            identity,
            ref,
            item.source.checksum
        );
        try {
            let treeDigest = await verifiedCachedArchive(archiveFile, expected);
            if (treeDigest) reused += 1;
            else {
                const fetched = await client.download(ref);
                const validated = await validateAgentSkillArchive(
                    fetched.bytes,
                    ref.type
                );
                if (
                    fetched.metadata.checksum !== item.source.checksum ||
                    validated.checksum !== item.source.checksum ||
                    validated.name !== item.effectiveName ||
                    validated.description !== item.source.description ||
                    (item.sourceKind === "own-user-publication" &&
                        fetched.metadata.userId !== identity.userId)
                )
                    throw new Error(
                        "Downloaded Agent Skill does not match manifest"
                    );
                await writeFileAtomically(archiveFile, fetched.bytes);
                treeDigest = validated.treeDigest;
                downloaded += 1;
            }
            items[sourceStateKey(ref)] = {
                ref,
                name: item.effectiveName,
                description: item.source.description,
                sourceKind: item.sourceKind,
                checksum: item.source.checksum,
                treeDigest,
                archiveFile,
                verifiedAt: now
            };
        } catch {
            failures.push({
                ref,
                name: item.effectiveName,
                action: "failed",
                code: "DOWNLOAD_FAILED"
            });
        }
    }
    if (failures.length) return { ok: false, failures };
    state.snapshot = { verifiedAt: now, warnings: 0, items };
    await saveAgentSkillSourceState(state);
    await collectUnreferencedArchives(identity, items);
    return {
        ok: true,
        state,
        desired: Object.values(items).filter(
            (item) => !type || item.ref.type === type
        ),
        reused,
        downloaded
    };
}

/** A remote-source failure: nothing local was changed; retry later. */
export function remoteFailureResult(
    failures: AgentSkillSyncItemResult[]
): AgentSkillSyncResult {
    const counts = emptyCounts();
    counts.failed = failures.length;
    return {
        status: "failed",
        counts,
        items: failures,
        manifestWarnings: failures.filter((item) =>
            item.code?.startsWith("MANIFEST_WARNING_")
        ).length,
        remoteSourceFailed: true
    };
}

/** Archives are an internal immutable cache; drop ones no snapshot uses. */
async function collectUnreferencedArchives(
    identity: AgentSkillSourceIdentity,
    items: Record<string, VerifiedAgentSkillPublication>
): Promise<void> {
    const directory = path.join(agentSkillSourceRoot(identity), "archives");
    const keep = new Set(
        Object.values(items).map((item) => path.resolve(item.archiveFile))
    );
    let names: string[] = [];
    try {
        names = await readdir(directory);
    } catch {
        return;
    }
    for (const name of names) {
        const file = path.join(directory, name);
        if (name.endsWith(".zip") && !keep.has(file))
            await rm(file, { force: true });
    }
}

/**
 * Cache the exact ZIP bytes the server just acknowledged for one publication.
 * Only that publication's entry is updated if a complete snapshot already
 * contains it; the snapshot's own verification time is never advanced and no
 * snapshot is invented from a single publication. Throws on mismatch so the
 * caller can report a local bookkeeping problem separately from the publish.
 */
export async function cacheAcknowledgedPublication(
    state: AgentSkillSourceStateV3,
    metadata: AgentSkillMetadata,
    archive: {
        bytes: Buffer;
        archiveSha256: string;
        treeDigest: string;
        name: string;
    }
): Promise<void> {
    if (
        metadata.checksum !== archive.archiveSha256 ||
        metadata.name !== archive.name
    )
        throw new Error(
            "The server acknowledged different content than was published"
        );
    const ref = { type: metadata.type, id: metadata.id };
    const archiveFile = agentSkillArchivePath(
        state.identity,
        ref,
        metadata.checksum
    );
    await writeFileAtomically(archiveFile, archive.bytes);
    const key = sourceStateKey(ref);
    const existing = state.snapshot?.items[key];
    if (state.snapshot && existing) {
        state.snapshot.items[key] = {
            ...existing,
            description: metadata.description,
            checksum: metadata.checksum,
            treeDigest: archive.treeDigest,
            archiveFile,
            verifiedAt: new Date().toISOString()
        };
        delete state.snapshot.items[key].unresolved;
        await saveAgentSkillSourceState(state);
    }
}

/** Verified desired set from an offline cache, without network access. */
export function cachedDesired(
    state: AgentSkillSourceStateV3 | undefined
): {
    desired: VerifiedAgentSkillPublication[];
    unresolved: Set<string>;
} {
    const items = Object.entries(state?.snapshot?.items || {});
    return {
        desired: items
            .filter(([, item]) => !item.unresolved)
            .map(([, item]) => item),
        unresolved: new Set(
            items.filter(([, item]) => item.unresolved).map(([key]) => key)
        )
    };
}

async function cacheIdentityForProfile(
    profileName: string,
    identity: AgentSkillSourceIdentity
): Promise<void> {
    const cfg = await loadConfig();
    const profile = cfg.profiles[profileName];
    if (
        !profile ||
        canonicalMagdaBaseUrl(profile.baseUrl) !== identity.canonicalBaseUrl
    )
        return;
    profile.agentSkillSource = {
        ...identity,
        verifiedAt: new Date().toISOString()
    };
    await saveConfig(cfg);
}

function credentials(value: Profile | undefined) {
    return value
        ? {
              baseUrl: value.baseUrl,
              apiKeyId: value.apiKeyId,
              apiKey: value.apiKey
          }
        : undefined;
}

/**
 * Online local sync: own-user publications only, installed into every
 * detected harness root when the selected profile is the globally active one.
 */
export async function syncLocalAgentSkills(
    client: AgentSkillClient,
    options: {
        force?: boolean;
        selectedProfile: string;
        activate: boolean;
        persistProfileIdentity?: boolean;
        expectedProfile?: Profile;
    }
): Promise<AgentSkillSyncResult> {
    return withAgentSkillOperationLock(async () => {
        if (options.expectedProfile) {
            const current = (await loadConfig()).profiles[
                options.selectedProfile
            ];
            if (
                JSON.stringify(credentials(current)) !==
                JSON.stringify(credentials(options.expectedProfile))
            )
                return failedSyncResult("PROFILE_CHANGED");
        }
        let manifest;
        try {
            manifest = await client.localManifest();
        } catch {
            return failedSyncResult();
        }
        const identity = createAgentSkillSourceIdentity({
            baseUrl: client.baseUrl,
            tenantId: manifest.identity.tenantId,
            userId: manifest.identity.userId
        });
        if (options.persistProfileIdentity !== false)
            await cacheIdentityForProfile(options.selectedProfile, identity);
        // Phase A: the whole current desired set, verified, or nothing.
        const prepared = await prepareVerifiedSnapshot(
            client,
            identity,
            manifest
        );
        if (!prepared.ok) return remoteFailureResult(prepared.failures);
        const latest = await loadConfig();
        if (
            !options.activate ||
            (latest.activeProfile || "default") !== options.selectedProfile
        ) {
            return reconcileResult(
                { items: [], problems: [] },
                {
                    notes: [
                        {
                            ref: { type: "user", id: "profile" },
                            name: options.selectedProfile,
                            action: "skipped",
                            code: "CACHED_NOT_ACTIVATED"
                        }
                    ]
                }
            );
        }
        // Phase B: independent local reconciliation.
        const outcome = await reconcileAgentSkillInstallations({
            targets: resolveAgentSkillTargets({ env: process.env }),
            sourceKey: identity.key,
            desired: prepared.desired,
            force: !!options.force
        });
        return reconcileResult(outcome);
    });
}

/**
 * Workspace Sandbox sync: visible system + own user publications into the
 * single DSH root. Same engine and conflict semantics as local sync.
 */
export async function syncWorkspaceAgentSkills(
    client: AgentSkillClient,
    selectedType: AgentSkillListType = "all",
    force = false
): Promise<AgentSkillSyncResult> {
    return withAgentSkillOperationLock(async () => {
        let manifest;
        try {
            manifest = await client.manifest();
        } catch {
            return failedSyncResult();
        }
        const identity = createAgentSkillSourceIdentity({
            baseUrl: client.baseUrl,
            tenantId: manifest.identity.tenantId,
            userId: manifest.identity.userId
        });
        const type = selectedType === "all" ? undefined : selectedType;
        const prepared = await prepareVerifiedSnapshot(
            client,
            identity,
            manifest,
            type
        );
        // A remote-source failure blocks every local change, even --force.
        if (!prepared.ok) return remoteFailureResult(prepared.failures);
        const outcome = await reconcileAgentSkillInstallations({
            targets: [resolveWorkspaceAgentSkillTarget(process.env)],
            sourceKey: identity.key,
            desired: prepared.desired,
            force,
            type
        });
        return reconcileResult(outcome);
    });
}

/**
 * Offline reconciliation against a profile's previously verified snapshot,
 * run after the profile selection itself has been saved. Without a verified
 * snapshot nothing is reconciled: an unknown desired set is never treated as
 * an empty one, so no installed skill is removed on that basis.
 */
export async function reconcileCachedAgentSkillProfile(options: {
    identity?: AgentSkillSourceIdentity;
    force: boolean;
}): Promise<AgentSkillSyncResult | undefined> {
    return withAgentSkillOperationLock(async () => {
        const state = options.identity
            ? await loadAgentSkillSourceState(options.identity)
            : undefined;
        if (!state?.snapshot) return undefined;
        const { desired, unresolved } = cachedDesired(state);
        const outcome = await reconcileAgentSkillInstallations({
            targets: resolveAgentSkillTargets({ env: process.env }),
            sourceKey: state.identity.key,
            desired,
            unresolved,
            force: options.force
        });
        return reconcileResult(outcome);
    });
}

/**
 * Credentials for a recorded source account, independent of the active
 * profile. Every configured profile on that canonical MAGDA instance is tried
 * (the one last verified as this account first) and accepted only if it
 * authenticates as exactly that tenant and user. There is no fallback.
 */
export async function clientForSourceAccount(
    sourceKey: string
): Promise<{
    client: AgentSkillClient;
    profileName: string;
    identity: AgentSkillSourceIdentity;
    state: AgentSkillSourceStateV3;
}> {
    const state = await loadAgentSkillSourceStateByKey(sourceKey);
    if (!state)
        throw new UsageError(
            "The account recorded for this skill has never been verified on this computer; mgd will not publish it under another account."
        );
    const { identity } = state;
    const cfg = await loadConfig();
    const onInstance = (profile: Profile) => {
        try {
            return (
                !!profile.baseUrl &&
                canonicalMagdaBaseUrl(profile.baseUrl) ===
                    identity.canonicalBaseUrl
            );
        } catch {
            return false;
        }
    };
    const candidates: Array<[string, Profile]> = Object.entries(cfg.profiles)
        .filter(([, profile]) => onInstance(profile))
        .sort(
            ([, a], [, b]) =>
                Number(b.agentSkillSource?.key === sourceKey) -
                Number(a.agentSkillSource?.key === sourceKey)
        );
    // Explicit one-off credentials (MGD_BASE_URL/MGD_API_KEY*) are also
    // tried, subject to the same identity check.
    const current = resolveProfile(cfg);
    if (current.profile && onInstance(current.profile))
        candidates.push([current.name, current.profile]);
    for (const [profileName, profile] of candidates) {
        const client = new AgentSkillClient(clientFor(profile));
        try {
            const manifest = await client.localManifest();
            if (
                manifest.identity.tenantId === identity.tenantId &&
                manifest.identity.userId === identity.userId
            )
                return { client, profileName, identity, state };
        } catch {
            // Expired, revoked or unreachable credentials: try the next one.
        }
    }
    throw new UsageError(
        `No configured profile currently authenticates as the account that owns this skill (${identity.canonicalBaseUrl}, tenant ${identity.tenantId}, user ${identity.userId}). Create or update a profile for that account; mgd never publishes it under another account.`
    );
}

/** The last online-verified source identity cached on a named profile. */
export function cachedProfileIdentity(
    profile: Profile | undefined
): AgentSkillSourceIdentity | undefined {
    const cached = profile?.agentSkillSource;
    return cached
        ? {
              key: cached.key,
              canonicalBaseUrl: cached.canonicalBaseUrl,
              tenantId: cached.tenantId,
              userId: cached.userId
          }
        : undefined;
}
