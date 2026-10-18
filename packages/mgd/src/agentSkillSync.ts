import path from "node:path";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
    sourceStateKey
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
    return {
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
    extra: {
        failures?: AgentSkillSyncItemResult[];
        manifestWarnings?: number;
        desiredCount?: number;
        notes?: AgentSkillSyncItemResult[];
    } = {}
): AgentSkillSyncResult {
    const recordedFailures = new Set(
        outcome.items
            .filter((item) => item.action === "failed")
            .map((item) => item.path)
    );
    const items = [
        ...(extra.notes || []),
        ...(extra.failures || []),
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
    const downloadFailures = extra.failures?.length || 0;
    const troubled =
        outcome.problems.length +
            downloadFailures +
            counts.skipped +
            (extra.manifestWarnings || 0) >
        0;
    const status: AgentSkillSyncResult["status"] = !troubled
        ? "success"
        : progressed === 0 &&
          ((downloadFailures > 0 && downloadFailures === extra.desiredCount) ||
              outcome.problems.some((problem) =>
                  SYSTEM_FAILURES.has(problem.reason)
              ))
        ? "failed"
        : "partial";
    return {
        status,
        counts,
        items,
        manifestWarnings: extra.manifestWarnings || 0,
        ...(outcome.problems.length ? { conflicts: outcome.problems } : {})
    };
}

async function writeArchiveAtomically(
    target: string,
    bytes: Buffer
): Promise<void> {
    await ensureRealDirectory(path.dirname(target));
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, target);
}

async function archiveMatches(
    item: VerifiedAgentSkillPublication
): Promise<boolean> {
    try {
        return sha256Hex(await readFile(item.archiveFile)) === item.checksum;
    } catch {
        return false;
    }
}

export interface RefreshedSnapshot {
    state: AgentSkillSourceStateV3;
    desired: VerifiedAgentSkillPublication[];
    unresolved: Set<string>;
    failures: AgentSkillSyncItemResult[];
    desiredCount: number;
}

/**
 * Download and verify every manifest publication not already cached, then
 * persist the new verified snapshot. No installation is touched here. A
 * failed download keeps the previously verified version (if any); manifest
 * warnings keep prior absent entries as unresolved instead of deleting them.
 */
export async function refreshVerifiedSnapshot(
    client: AgentSkillClient,
    identity: AgentSkillSourceIdentity,
    manifest: { items: WorkspaceSkillManifestItem[]; warnings: unknown[] },
    type?: AgentSkillType
): Promise<RefreshedSnapshot> {
    const state = await loadAgentSkillSourceState(identity);
    await ensureRealDirectory(agentSkillSourceRoot(identity));
    const previous = state.snapshot?.items || {};
    const items: Record<string, VerifiedAgentSkillPublication> = {};
    const failures: AgentSkillSyncItemResult[] = [];
    const now = new Date().toISOString();
    const selected = manifest.items.filter(
        (item) => !type || item.source.type === type
    );
    for (const [key, item] of Object.entries(previous))
        if (type && item.ref.type !== type) items[key] = item;
    for (const item of selected) {
        const ref = { type: item.source.type, id: item.source.id };
        const key = sourceStateKey(ref);
        const prior = previous[key];
        if (
            prior &&
            prior.checksum === item.source.checksum &&
            prior.name === item.effectiveName &&
            (await archiveMatches(prior))
        ) {
            items[key] = {
                ...prior,
                description: item.source.description,
                sourceKind: item.sourceKind
            };
            delete items[key].unresolved;
            continue;
        }
        try {
            const downloaded = await client.download(ref);
            const validated = await validateAgentSkillArchive(
                downloaded.bytes,
                ref.type
            );
            if (
                downloaded.metadata.checksum !== item.source.checksum ||
                validated.checksum !== item.source.checksum ||
                validated.name !== item.effectiveName ||
                validated.description !== item.source.description ||
                (item.sourceKind === "own-user-publication" &&
                    downloaded.metadata.userId !== identity.userId)
            )
                throw new Error(
                    "Downloaded Agent Skill does not match manifest"
                );
            const archiveFile = agentSkillArchivePath(
                identity,
                ref,
                item.source.checksum
            );
            await writeArchiveAtomically(archiveFile, downloaded.bytes);
            items[key] = {
                ref,
                name: item.effectiveName,
                description: item.source.description,
                sourceKind: item.sourceKind,
                checksum: item.source.checksum,
                treeDigest: validated.treeDigest,
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
            if (prior && (await archiveMatches(prior))) items[key] = prior;
        }
    }
    // A publication still listed but not downloadable is not a deletion.
    const unresolved = new Set<string>(
        failures
            .map((item) => sourceStateKey(item.ref))
            .filter((key) => !items[key])
    );
    if (manifest.warnings.length > 0) {
        for (const [key, item] of Object.entries(previous)) {
            if (items[key] || (type && item.ref.type !== type)) continue;
            items[key] = { ...item, unresolved: true };
        }
    }
    for (const [key, item] of Object.entries(items))
        if (item.unresolved && (!type || item.ref.type === type))
            unresolved.add(key);
    state.snapshot = {
        verifiedAt: now,
        warnings: manifest.warnings.length,
        items
    };
    await saveAgentSkillSourceState(state);
    await collectUnreferencedArchives(identity, items);
    return {
        state,
        desired: Object.values(items).filter(
            (item) => !item.unresolved && (!type || item.ref.type === type)
        ),
        unresolved,
        failures,
        desiredCount: selected.length
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
        const refreshed = await refreshVerifiedSnapshot(
            client,
            identity,
            manifest
        );
        const latest = await loadConfig();
        if (
            !options.activate ||
            (latest.activeProfile || "default") !== options.selectedProfile
        ) {
            const result = reconcileResult(
                { items: [], problems: [] },
                {
                    failures: refreshed.failures,
                    manifestWarnings: manifest.warnings.length,
                    desiredCount: refreshed.desiredCount,
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
            return result;
        }
        const outcome = await reconcileAgentSkillInstallations({
            targets: resolveAgentSkillTargets({ env: process.env }),
            sourceKey: identity.key,
            desired: refreshed.desired,
            unresolved: refreshed.unresolved,
            force: !!options.force
        });
        return reconcileResult(outcome, {
            failures: refreshed.failures,
            manifestWarnings: manifest.warnings.length,
            desiredCount: refreshed.desiredCount
        });
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
        const refreshed = await refreshVerifiedSnapshot(
            client,
            identity,
            manifest,
            type
        );
        const outcome = await reconcileAgentSkillInstallations({
            targets: [resolveWorkspaceAgentSkillTarget(process.env)],
            sourceKey: identity.key,
            desired: refreshed.desired,
            unresolved: refreshed.unresolved,
            force,
            type
        });
        return reconcileResult(outcome, {
            failures: refreshed.failures,
            manifestWarnings: manifest.warnings.length,
            desiredCount: refreshed.desiredCount
        });
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
        return reconcileResult(outcome, { desiredCount: desired.length });
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
