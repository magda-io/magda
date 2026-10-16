import path from "node:path";
import { rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { AgentSkillClient } from "./agentSkillClient.js";
import {
    ensureRealDirectory,
    loadAgentSkillState,
    managedChildPath,
    saveAgentSkillState,
    stateKey,
    withAgentSkillStateLock
} from "./agentSkillState.js";
import {
    AgentSkillListType,
    AgentSkillRef,
    AgentSkillSyncItemResult,
    AgentSkillSyncResult
} from "./agentSkillTypes.js";
import {
    calculateAgentSkillTreeDigest,
    extractAgentSkillArchive,
    validateAgentSkillArchive,
    validateAgentSkillDirectory
} from "./agentSkillArchive.js";

const exists = async (target: string) => {
    try {
        await stat(target);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
};

export async function syncAgentSkills(
    client: AgentSkillClient,
    selectedType: AgentSkillListType = "all",
    force = false
): Promise<AgentSkillSyncResult> {
    return await withAgentSkillStateLock(async () => {
        const state = await loadAgentSkillState();
        const results: AgentSkillSyncItemResult[] = [];
        let manifest;
        try {
            manifest = await client.manifest();
        } catch {
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
        const desired = manifest.items.filter(
            (item) =>
                selectedType === "all" || item.source.type === selectedType
        );
        const desiredKeys = new Set<string>();
        await ensureRealDirectory(state.managedRoot);
        const draftsRoot = managedChildPath(state.managedRoot, ".local-drafts");
        for (const item of desired) {
            const ref: AgentSkillRef = {
                type: item.source.type,
                id: item.source.id
            };
            const key = stateKey(ref);
            desiredKeys.add(key);
            const current = state.entries[key];
            if (
                current &&
                path.resolve(current.dir) !==
                    managedChildPath(state.managedRoot, current.name)
            ) {
                results.push({
                    ref,
                    name: item.effectiveName,
                    action: "failed",
                    code: "INVALID_MANAGED_STATE"
                });
                continue;
            }
            const destination = managedChildPath(
                state.managedRoot,
                item.effectiveName
            );
            try {
                const currentExists = current
                    ? await exists(current.dir)
                    : false;
                const destinationExists = await exists(destination);
                let localChanged = false;
                let currentTreeDigest = current?.installedTreeDigest;
                if (current && currentExists) {
                    currentTreeDigest = await validateAgentSkillDirectory(
                        current.dir,
                        ref.type
                    ).then(
                        (inspected) => inspected.treeDigest,
                        () => calculateAgentSkillTreeDigest(current.dir)
                    );
                    localChanged =
                        currentTreeDigest !== current.installedTreeDigest;
                }
                if (
                    current &&
                    currentExists &&
                    current.remoteChecksum === item.source.checksum &&
                    (!localChanged || !force)
                ) {
                    results.push({
                        ref,
                        name: item.effectiveName,
                        action: localChanged ? "skipped" : "unchanged",
                        ...(localChanged ? { code: "LOCAL_CHANGES" } : {})
                    });
                    continue;
                }
                const downloaded = await client.download(ref);
                if (downloaded.metadata.checksum !== item.source.checksum) {
                    throw new Error(
                        "Manifest and archive metadata checksums differ"
                    );
                }
                const validated = await validateAgentSkillArchive(
                    downloaded.bytes,
                    ref.type
                );
                if (validated.checksum !== item.source.checksum) {
                    throw new Error(
                        "Downloaded archive checksum does not match manifest"
                    );
                }
                if (
                    validated.name !== item.effectiveName ||
                    validated.description !== item.source.description
                ) {
                    throw new Error("Archive metadata does not match manifest");
                }
                if (!current && destinationExists) {
                    const orphan = await validateAgentSkillDirectory(
                        destination,
                        ref.type
                    ).catch(() => undefined);
                    if (orphan?.treeDigest !== validated.treeDigest) {
                        results.push({
                            ref,
                            name: item.effectiveName,
                            action: "skipped",
                            code: "NAME_COLLISION"
                        });
                        continue;
                    }
                    state.entries[key] = {
                        ref,
                        name: item.effectiveName,
                        dir: destination,
                        remoteChecksum: item.source.checksum,
                        installedTreeDigest: orphan.treeDigest,
                        updatedAt: new Date().toISOString()
                    };
                    await saveAgentSkillState(state);
                    results.push({
                        ref,
                        name: item.effectiveName,
                        action: "installed"
                    });
                    continue;
                }
                if (current && localChanged) {
                    if (currentTreeDigest === validated.treeDigest) {
                        state.entries[key] = {
                            ...current,
                            remoteChecksum: item.source.checksum,
                            installedTreeDigest: validated.treeDigest,
                            updatedAt: new Date().toISOString()
                        };
                        await saveAgentSkillState(state);
                        results.push({
                            ref,
                            name: item.effectiveName,
                            action: "updated"
                        });
                        continue;
                    }
                    if (!force) {
                        results.push({
                            ref,
                            name: item.effectiveName,
                            action: "skipped",
                            code: "LOCAL_CHANGES"
                        });
                        continue;
                    }
                    await ensureRealDirectory(draftsRoot);
                    const draftDir = path.join(
                        draftsRoot,
                        `${current.name}-${Date.now()}-${randomUUID().slice(
                            0,
                            8
                        )}`
                    );
                    state.drafts[draftDir] = {
                        type: current.ref.type,
                        name: current.name,
                        ref: current.ref,
                        baseChecksum: current.remoteChecksum,
                        treeDigest:
                            currentTreeDigest || current.installedTreeDigest
                    };
                    await saveAgentSkillState(state);
                    try {
                        await rename(current.dir, draftDir);
                    } catch (error) {
                        delete state.drafts[draftDir];
                        await saveAgentSkillState(state);
                        throw error;
                    }
                }
                const extracted = await extractAgentSkillArchive(
                    downloaded.bytes,
                    ref.type,
                    destination
                );
                state.entries[key] = {
                    ref,
                    name: item.effectiveName,
                    dir: destination,
                    remoteChecksum: item.source.checksum,
                    installedTreeDigest: extracted.treeDigest,
                    updatedAt: new Date().toISOString()
                };
                await saveAgentSkillState(state);
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
        for (const [key, current] of Object.entries(state.entries)) {
            if (
                path.resolve(current.dir) !==
                managedChildPath(state.managedRoot, current.name)
            ) {
                results.push({
                    ref: current.ref,
                    name: current.name,
                    action: "failed",
                    code: "INVALID_MANAGED_STATE"
                });
                continue;
            }
            if (
                desiredKeys.has(key) ||
                (selectedType !== "all" && current.ref.type !== selectedType)
            )
                continue;
            // A warning means at least one selected source was omitted. Its
            // absence is not authoritative, so preserve every otherwise-stale
            // managed copy until a warning-free manifest confirms deletion.
            if (manifest.warnings.length > 0) {
                results.push({
                    ref: current.ref,
                    name: current.name,
                    action: "skipped",
                    code: "MANIFEST_WARNING_PRESERVED"
                });
                continue;
            }
            try {
                if (await exists(current.dir)) {
                    const currentTreeDigest = await validateAgentSkillDirectory(
                        current.dir,
                        current.ref.type
                    ).then(
                        (inspected) => inspected.treeDigest,
                        () => calculateAgentSkillTreeDigest(current.dir)
                    );
                    if (currentTreeDigest !== current.installedTreeDigest) {
                        await ensureRealDirectory(draftsRoot);
                        const draftDir = path.join(
                            draftsRoot,
                            `${current.name}-${Date.now()}-${randomUUID().slice(
                                0,
                                8
                            )}`
                        );
                        state.drafts[draftDir] = {
                            type: current.ref.type,
                            name: current.name,
                            treeDigest: currentTreeDigest
                        };
                        await saveAgentSkillState(state);
                        try {
                            await rename(current.dir, draftDir);
                        } catch (error) {
                            delete state.drafts[draftDir];
                            await saveAgentSkillState(state);
                            throw error;
                        }
                        results.push({
                            ref: current.ref,
                            name: current.name,
                            action: "skipped",
                            code: "DELETED_REMOTE_LOCAL_DRAFT_PRESERVED"
                        });
                        delete state.entries[key];
                        await saveAgentSkillState(state);
                        continue;
                    }
                    await rm(current.dir, { recursive: true, force: true });
                }
                delete state.entries[key];
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
        await saveAgentSkillState(state);
        const counts = {
            installed: results.filter((item) => item.action === "installed")
                .length,
            updated: results.filter((item) => item.action === "updated").length,
            unchanged: results.filter((item) => item.action === "unchanged")
                .length,
            removed: results.filter((item) => item.action === "removed").length,
            skipped: results.filter((item) => item.action === "skipped").length,
            failed: results.filter((item) => item.action === "failed").length
        };
        const degraded =
            counts.skipped + counts.failed + manifest.warnings.length;
        const allDesiredFailed =
            desired.length > 0 && counts.failed === desired.length;
        return {
            status: allDesiredFailed
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
