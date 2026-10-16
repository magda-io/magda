import path from "node:path";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { AgentSkillClient } from "./agentSkillClient.js";
import {
    calculateAgentSkillTreeDigest,
    extractAgentSkillArchive,
    validateAgentSkillArchive,
    validateAgentSkillDirectory
} from "./agentSkillArchive.js";
import {
    activateAgentSkillSource,
    restoreCachedAgentSkill
} from "./agentSkillProjection.js";
import type {
    CachedAgentSkillEntry,
    AgentSkillSourceIdentity,
    AgentSkillSourceStateV2
} from "./agentSkillLocalState.js";
import {
    agentSkillSourceRoot,
    canonicalMagdaBaseUrl,
    createAgentSkillSourceIdentity,
    loadAgentSkillSourceState,
    migrateLegacyAgentSkillState,
    saveAgentSkillSourceState,
    sourceStateKey
} from "./agentSkillLocalState.js";
import {
    ensureRealDirectory,
    withAgentSkillStateLock
} from "./agentSkillState.js";
import type {
    AgentSkillSyncItemResult,
    AgentSkillSyncResult
} from "./agentSkillTypes.js";
import type { Profile } from "./profile.js";
import { loadConfig, saveConfig } from "./profile.js";

async function exists(target: string): Promise<boolean> {
    try {
        await stat(target);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
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

async function libraryDraftDestination(
    identity: AgentSkillSourceIdentity,
    name: string
): Promise<string> {
    const root = path.join(agentSkillSourceRoot(identity), "drafts", "library");
    await ensureRealDirectory(root);
    return path.join(root, `${name}-${Date.now()}-${randomUUID().slice(0, 8)}`);
}

async function moveLibraryToTrackedDraft(
    state: AgentSkillSourceStateV2,
    identity: AgentSkillSourceIdentity,
    entry: CachedAgentSkillEntry,
    treeDigest: string,
    detached = false
): Promise<string> {
    const destination = await libraryDraftDestination(identity, entry.name);
    state.drafts[destination] = {
        type: entry.ref.type,
        name: entry.name,
        ref: detached ? undefined : entry.ref,
        baseChecksum: detached ? undefined : entry.remoteChecksum,
        treeDigest
    };
    // Provenance is durable before the only copy is moved. A crash after this
    // save leaves an idempotently recoverable draft reservation.
    await saveAgentSkillSourceState(state);
    try {
        await rename(entry.libraryDir, destination);
    } catch (error) {
        delete state.drafts[destination];
        await saveAgentSkillSourceState(state);
        throw error;
    }
    return destination;
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

function failedResult(): AgentSkillSyncResult {
    return {
        status: "failed",
        counts: {
            installed: 0,
            updated: 0,
            unchanged: 0,
            removed: 0,
            skipped: 0,
            failed: 1
        },
        items: [],
        manifestWarnings: 0
    };
}

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
    return withAgentSkillStateLock(async () => {
        if (options.expectedProfile) {
            const current = (await loadConfig()).profiles[
                options.selectedProfile
            ];
            const credentials = (value: Profile | undefined) =>
                value
                    ? {
                          baseUrl: value.baseUrl,
                          apiKeyId: value.apiKeyId,
                          apiKey: value.apiKey
                      }
                    : undefined;
            if (
                JSON.stringify(credentials(current)) !==
                JSON.stringify(credentials(options.expectedProfile))
            ) {
                return failedResult();
            }
        }
        const legacyBackup = await migrateLegacyAgentSkillState();
        let manifest;
        try {
            manifest = await client.localManifest();
        } catch {
            return failedResult();
        }
        const identity = createAgentSkillSourceIdentity({
            baseUrl: client.baseUrl,
            tenantId: manifest.identity.tenantId,
            userId: manifest.identity.userId
        });
        if (options.persistProfileIdentity !== false) {
            await cacheIdentityForProfile(options.selectedProfile, identity);
        }
        const state = await loadAgentSkillSourceState(identity);
        const results: AgentSkillSyncItemResult[] = [];
        if (legacyBackup) {
            results.push({
                ref: { type: "user", id: "legacy-unverified-state" },
                name: path.basename(legacyBackup),
                action: "skipped",
                code: "LEGACY_STATE_PRESERVED_REVIEW_REQUIRED"
            });
        }
        const desiredKeys = new Set<string>();
        const names = new Set<string>();
        const sourceRoot = agentSkillSourceRoot(identity);
        await ensureRealDirectory(sourceRoot);

        for (const item of manifest.items) {
            const ref = { type: item.source.type, id: item.source.id } as const;
            const key = sourceStateKey(ref);
            desiredKeys.add(key);
            if (names.has(item.effectiveName)) {
                results.push({
                    ref,
                    name: item.effectiveName,
                    action: "failed",
                    code: "NAME_COLLISION"
                });
                continue;
            }
            names.add(item.effectiveName);
            const current = state.entries[key];
            const libraryDir = path.join(sourceRoot, "skills", item.source.id);
            const archiveFile = path.join(
                sourceRoot,
                "archives",
                `${item.source.id}.zip`
            );
            try {
                const currentExists = current
                    ? await exists(current.libraryDir)
                    : false;
                let localChanged = !!current && !currentExists;
                let needsDownload = false;
                let localTreeDigest = current?.installedTreeDigest;
                if (current && currentExists) {
                    try {
                        localTreeDigest = (
                            await validateAgentSkillDirectory(
                                current.libraryDir,
                                "user"
                            )
                        ).treeDigest;
                        localChanged =
                            localTreeDigest !== current.installedTreeDigest;
                    } catch {
                        localChanged = true;
                        localTreeDigest = await calculateAgentSkillTreeDigest(
                            current.libraryDir
                        ).catch(() => current.installedTreeDigest);
                    }
                }
                if (
                    current &&
                    currentExists &&
                    current.remoteChecksum !== item.source.checksum
                ) {
                    // Recover a process exit after the new archive/tree became
                    // durable but before state.json was finalized. Only adopt
                    // the exact manifest checksum, metadata and validated tree.
                    try {
                        const cachedArchive = await validateAgentSkillArchive(
                            await readFile(current.archiveFile),
                            "user"
                        );
                        if (
                            cachedArchive.archiveSha256 ===
                                item.source.checksum &&
                            cachedArchive.name === item.effectiveName &&
                            cachedArchive.description ===
                                item.source.description &&
                            cachedArchive.treeDigest === localTreeDigest
                        ) {
                            state.entries[key] = {
                                ...current,
                                name: item.effectiveName,
                                description: item.source.description,
                                remoteChecksum: item.source.checksum,
                                installedTreeDigest: cachedArchive.treeDigest,
                                updatedAt: new Date().toISOString()
                            };
                            await saveAgentSkillSourceState(state);
                            results.push({
                                ref,
                                name: item.effectiveName,
                                action: "updated",
                                code: "INTERRUPTED_UPDATE_RECOVERED"
                            });
                            continue;
                        }
                    } catch {
                        // An old/corrupt archive is handled by normal download;
                        // a locally changed tree remains protected below.
                    }
                }
                if (
                    current &&
                    current.remoteChecksum === item.source.checksum
                ) {
                    if (!currentExists) {
                        try {
                            current.installedTreeDigest = await restoreCachedAgentSkill(
                                current
                            );
                            await saveAgentSkillSourceState(state);
                            results.push({
                                ref,
                                name: item.effectiveName,
                                action: "updated",
                                code: "MISSING_CACHE_RESTORED"
                            });
                            continue;
                        } catch {
                            // Missing/corrupt archive: fall through to a fresh
                            // authenticated download instead of reporting unchanged.
                            localChanged = false;
                            needsDownload = true;
                        }
                    }
                    if (!localChanged && !needsDownload) {
                        results.push({
                            ref,
                            name: item.effectiveName,
                            action: "unchanged"
                        });
                        continue;
                    }
                    if (!options.force && !needsDownload) {
                        results.push({
                            ref,
                            name: item.effectiveName,
                            action: "skipped",
                            code: "LOCAL_CHANGES"
                        });
                        continue;
                    }
                    if (localChanged) {
                        await moveLibraryToTrackedDraft(
                            state,
                            identity,
                            current,
                            localTreeDigest || current.installedTreeDigest
                        );
                        current.installedTreeDigest = await restoreCachedAgentSkill(
                            current
                        );
                        await saveAgentSkillSourceState(state);
                        results.push({
                            ref,
                            name: item.effectiveName,
                            action: "updated",
                            code: "LOCAL_CHANGES_PRESERVED"
                        });
                        continue;
                    }
                }
                if (
                    current &&
                    currentExists &&
                    localChanged &&
                    !options.force
                ) {
                    results.push({
                        ref,
                        name: item.effectiveName,
                        action: "skipped",
                        code: "LOCAL_CHANGES"
                    });
                    continue;
                }
                if (current && currentExists && localChanged) {
                    await moveLibraryToTrackedDraft(
                        state,
                        identity,
                        current,
                        localTreeDigest || current.installedTreeDigest
                    );
                }
                const downloaded = await client.download(ref);
                const validated = await validateAgentSkillArchive(
                    downloaded.bytes,
                    "user"
                );
                if (
                    downloaded.metadata.userId !== identity.userId ||
                    downloaded.metadata.checksum !== item.source.checksum ||
                    validated.checksum !== item.source.checksum ||
                    validated.name !== item.effectiveName ||
                    validated.description !== item.source.description
                ) {
                    throw new Error(
                        "Downloaded Agent Skill does not match manifest"
                    );
                }
                await writeArchiveAtomically(archiveFile, downloaded.bytes);
                const extracted = await extractAgentSkillArchive(
                    downloaded.bytes,
                    "user",
                    libraryDir
                );
                state.entries[key] = {
                    ref,
                    name: item.effectiveName,
                    description: item.source.description,
                    libraryDir,
                    archiveFile,
                    remoteChecksum: item.source.checksum,
                    installedTreeDigest: extracted.treeDigest,
                    updatedAt: new Date().toISOString()
                };
                await saveAgentSkillSourceState(state);
                results.push({
                    ref,
                    name: item.effectiveName,
                    action: current ? "updated" : "installed"
                });
            } catch {
                results.push({
                    ref,
                    name: item.effectiveName,
                    action: "failed",
                    code: "SYNC_ITEM_FAILED"
                });
            }
        }

        if (manifest.warnings.length === 0) {
            for (const [key, current] of Object.entries(state.entries)) {
                if (desiredKeys.has(key)) continue;
                try {
                    if (await exists(current.libraryDir)) {
                        const currentDigest = await calculateAgentSkillTreeDigest(
                            current.libraryDir
                        );
                        const changed =
                            currentDigest !== current.installedTreeDigest;
                        if (changed) {
                            await moveLibraryToTrackedDraft(
                                state,
                                identity,
                                current,
                                currentDigest,
                                true
                            );
                        } else {
                            await rm(current.libraryDir, {
                                recursive: true,
                                force: true
                            });
                        }
                    }
                    await rm(current.archiveFile, { force: true });
                    delete state.entries[key];
                    await saveAgentSkillSourceState(state);
                    results.push({
                        ref: current.ref,
                        name: current.name,
                        action: "removed"
                    });
                } catch {
                    results.push({
                        ref: current.ref,
                        name: current.name,
                        action: "failed",
                        code: "REMOVE_FAILED"
                    });
                }
            }
        }
        const latestConfig = await loadConfig();
        const shouldActivate =
            options.activate &&
            (latestConfig.activeProfile || "default") ===
                options.selectedProfile;
        if (shouldActivate) {
            const activation = await activateAgentSkillSource(
                identity,
                options.selectedProfile,
                {
                    alreadyLocked: true,
                    forceRefresh: !!options.force
                }
            );
            for (const conflict of activation.conflicts) {
                results.push({
                    ref: { type: "user", id: "local-projection" },
                    name: path.basename(conflict),
                    action: "skipped",
                    code: "UNMANAGED_OR_MODIFIED_PROJECTION"
                });
            }
        }

        const counts = {
            installed: results.filter((x) => x.action === "installed").length,
            updated: results.filter((x) => x.action === "updated").length,
            unchanged: results.filter((x) => x.action === "unchanged").length,
            removed: results.filter((x) => x.action === "removed").length,
            skipped: results.filter((x) => x.action === "skipped").length,
            failed: results.filter((x) => x.action === "failed").length
        };
        const degraded =
            counts.skipped + counts.failed + manifest.warnings.length > 0;
        if (!degraded) {
            state.lastSuccessfulSyncAt = new Date().toISOString();
            await saveAgentSkillSourceState(state);
        }
        return {
            status:
                counts.failed > 0 && manifest.items.length === counts.failed
                    ? "failed"
                    : degraded
                    ? "partial"
                    : "success",
            counts,
            items: results,
            manifestWarnings: manifest.warnings.length
        };
    });
}
