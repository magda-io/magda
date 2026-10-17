import path from "node:path";
import {
    chmod,
    lstat,
    mkdir,
    open,
    readFile,
    rename,
    rm,
    rmdir,
    writeFile
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
    AGENT_SKILL_INSTALL_MARKER,
    inspectInstalledAgentSkill,
    isReservedAgentSkillName,
    readAgentSkillArchiveFiles,
    sha256Hex
} from "./agentSkillArchive.js";
import type {
    AgentSkillHarness,
    AgentSkillInstallation,
    AgentSkillInstallationIndexV1,
    VerifiedAgentSkillPublication
} from "./agentSkillLocalState.js";
import {
    agentSkillDataRoot,
    installationKey,
    loadAgentSkillInstallationIndex,
    markerMatchesInstallation,
    newInstallationId,
    saveAgentSkillInstallationIndex,
    serializeInstallMarker,
    sourceStateKey,
    writeJsonAtomically
} from "./agentSkillLocalState.js";
import {
    assertRealManagedAncestors,
    ensureRealDirectory,
    managedChildPath
} from "./agentSkillState.js";
import type {
    AgentSkillSyncItemResult,
    AgentSkillType
} from "./agentSkillTypes.js";
import type { ConfigFile } from "./profile.js";
import { saveConfig } from "./profile.js";
import type { AgentSkillTarget } from "./skills.js";

/*
 * One reconciliation engine for local online sync, offline profile switching
 * and Workspace Sandbox sync. Callers differ only in the verified desired
 * snapshot and target roots they supply.
 *
 *   preflight  classify every candidate (desired names + index-tracked names
 *              in every selected root); unrelated names are never inspected
 *   blocked    any unsafe path, or any content conflict without --force,
 *              stops before a single installation/profile write
 *   prepare    verify archives and stage replacement trees on the same
 *              filesystem as each root (hidden .magda-skill-staging/)
 *   commit     journaled per-operation renames; old trees move to temporary
 *              rollback locations; SKILL.md is placed last
 *   complete   index commit point, then optional profile config, then cleanup
 *
 * Recovery rolls back an interrupted `committing` journal (the index still
 * describes the old installations) and rolls forward a `committed` journal.
 * Directory renames are not fsynced; journal, index and config writes are.
 */

export const STAGING_DIRECTORY = ".magda-skill-staging";

/**
 * Test seam for crash-recovery tests only. A hook may throw an error with
 * `simulatedCrash: true` to stop as an abrupt process exit would: without
 * the in-process rollback, leaving the journal for recovery.
 */
export const agentSkillReconcileTestHooks: {
    afterOperation?: (kind: string, state: string) => Promise<void>;
    afterIndexCommit?: () => Promise<void>;
} = {};

export type AgentSkillConflictReason =
    | "LOCAL_MODIFICATION"
    | "UNRECOGNIZED_DIRECTORY"
    | "REMOVED_REMOTE_LOCAL_MODIFICATION"
    | "UNSAFE_PATH";

export interface AgentSkillConflict {
    name: string;
    harness: AgentSkillHarness;
    path: string;
    reason: AgentSkillConflictReason;
    detail?: string;
    remedy: string;
}

export interface ReconcileRequest {
    /** Source that becomes active; undefined means no eligible source. */
    sourceKey?: string;
    /** Complete verified desired publications for that source. */
    desired: VerifiedAgentSkillPublication[];
    /**
     * Same-source publications whose authorization/download status was not
     * reliably resolved. Their existing installations are left untouched.
     */
    unresolved?: Set<string>;
    targets: AgentSkillTarget[];
    force: boolean;
    /** Restrict candidates to one publication type; others stay untouched. */
    type?: AgentSkillType;
    /** Profile alias recorded in the index; `null` clears it. */
    activeProfile?: string | null;
    /** Profile configuration committed only after installations succeed. */
    finalConfig?: ConfigFile;
    env?: NodeJS.ProcessEnv;
}

export interface ReconcileOutcome {
    blocked: boolean;
    items: AgentSkillSyncItemResult[];
    conflicts: AgentSkillConflict[];
    /** Pre-v3 or interrupted-rollback data left in place for the user. */
    retainedPaths: string[];
}

type OpKind = "install" | "replace" | "remove" | "repair" | "forget";

interface JournalOp {
    id: string;
    kind: OpKind;
    harness: AgentSkillHarness;
    root: string;
    name: string;
    path: string;
    ref: { type: AgentSkillType; id: string };
    code?: string;
    /** Existing path content verified at preflight and rechecked at commit. */
    expected?: { kind: "absent" } | { kind: "directory"; digest?: string };
    newInstallation?: AgentSkillInstallation;
    publication?: VerifiedAgentSkillPublication;
    stagedDir?: string;
    stagedSkillFile?: string;
    rollbackPath?: string;
    state: "pending" | "oldMoved" | "newPlaced" | "done";
}

interface OperationJournal {
    version: 1;
    id: string;
    phase: "preparing" | "committing" | "committed";
    createdAt: string;
    stagingDirs: string[];
    ops: JournalOp[];
    finalIndex: AgentSkillInstallationIndexV1;
    finalConfig?: ConfigFile;
}

export function agentSkillOperationJournalPath(
    env: NodeJS.ProcessEnv = process.env
): string {
    return path.join(agentSkillDataRoot(env), "operation-journal.json");
}

async function lstatOrUndefined(target: string) {
    try {
        return await lstat(target);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
        throw error;
    }
}

async function saveJournal(
    journal: OperationJournal,
    env: NodeJS.ProcessEnv
): Promise<void> {
    await writeJsonAtomically(agentSkillOperationJournalPath(env), journal);
}

async function readJournal(
    env: NodeJS.ProcessEnv
): Promise<OperationJournal | undefined> {
    let raw: string;
    try {
        raw = await readFile(agentSkillOperationJournalPath(env), "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
        throw error;
    }
    const journal = JSON.parse(raw) as OperationJournal;
    if (
        journal?.version !== 1 ||
        !["preparing", "committing", "committed"].includes(journal.phase) ||
        !Array.isArray(journal.ops) ||
        !Array.isArray(journal.stagingDirs) ||
        !journal.finalIndex
    ) {
        throw new Error(
            `Agent Skill operation journal is invalid; inspect ${agentSkillOperationJournalPath(
                env
            )}`
        );
    }
    // Only paths derived from a root and a validated skill name are touched.
    for (const op of journal.ops) {
        if (managedChildPath(op.root, op.name) !== op.path)
            throw new Error("Agent Skill operation journal has unsafe paths");
        for (const owned of [op.stagedDir, op.stagedSkillFile, op.rollbackPath])
            if (
                owned &&
                !path
                    .resolve(owned)
                    .startsWith(
                        `${path.join(
                            path.resolve(op.root),
                            STAGING_DIRECTORY
                        )}${path.sep}`
                    )
            )
                throw new Error(
                    "Agent Skill operation journal has unsafe paths"
                );
    }
    return journal;
}

function harnessRemedy(reason: AgentSkillConflictReason): string {
    switch (reason) {
        case "UNSAFE_PATH":
            return "Move or remove this path manually; --force never follows links or replaces special files.";
        case "LOCAL_MODIFICATION":
            return "Publish the edit with `mgd agent-skill publish <path>`, or discard it with `--force`.";
        case "REMOVED_REMOTE_LOCAL_MODIFICATION":
            return "The publication was removed remotely. Copy the edit elsewhere to keep it, then rerun with `--force` to remove this installation.";
        case "UNRECOGNIZED_DIRECTORY":
            return "This directory has the same name as a managed skill but different content. Rename it to keep it, or discard it with `--force`.";
    }
}

interface Candidate {
    target: AgentSkillTarget;
    name: string;
    path: string;
    desired?: VerifiedAgentSkillPublication;
    tracked?: AgentSkillInstallation;
}

type Classification =
    | { kind: "none"; code?: string }
    | {
          kind: OpKind;
          code?: string;
          expected?: JournalOp["expected"];
      }
    | {
          kind: "conflict";
          reason: AgentSkillConflictReason;
          detail?: string;
          /** Operation applied when --force consents to discard content. */
          forced?: { kind: OpKind; expected: JournalOp["expected"] };
      };

async function classify(
    candidate: Candidate,
    sourceKey: string | undefined
): Promise<Classification> {
    const { desired: D, tracked: T } = candidate;
    const type = (D || T)!.ref.type;
    if (isReservedAgentSkillName(candidate.name))
        return {
            kind: "conflict",
            reason: "UNSAFE_PATH",
            detail: "reserved runtime-bundled skill name"
        };
    const found = await lstatOrUndefined(candidate.path);
    if (!found) {
        if (D)
            return {
                kind: "install",
                code: T ? "REINSTALLED" : undefined,
                expected: { kind: "absent" }
            };
        return { kind: "forget", code: "TRACKING_CLEARED" };
    }
    if (found.isSymbolicLink())
        return {
            kind: "conflict",
            reason: "UNSAFE_PATH",
            detail: "symbolic link"
        };
    if (!found.isDirectory())
        return {
            kind: "conflict",
            reason: "UNSAFE_PATH",
            detail: "not a directory"
        };
    const inspected = await inspectInstalledAgentSkill(candidate.path, type);
    if (inspected.kind === "unsafe")
        return {
            kind: "conflict",
            reason: "UNSAFE_PATH",
            detail: inspected.reason
        };
    const digest = inspected.digest;
    const expected = { kind: "directory" as const, digest };
    const recognized =
        T !== undefined && markerMatchesInstallation(inspected.marker, T);
    if (recognized) {
        const clean = digest !== undefined && digest === T!.baselineTreeDigest;
        if (D) {
            if (
                clean &&
                T!.sourceKey === sourceKey &&
                sourceStateKey(T!.ref) === sourceStateKey(D.ref) &&
                T!.baselineChecksum === D.checksum &&
                T!.baselineTreeDigest === D.treeDigest
            )
                return { kind: "none" };
            // Content already equals the desired publication (republished
            // identical tree, or another source with the same skill): only the
            // metadata/baseline changes.
            if (digest !== undefined && digest === D.treeDigest)
                return { kind: "repair", code: "BASELINE_UPDATED", expected };
            if (clean) return { kind: "replace", expected };
            return {
                kind: "conflict",
                reason: "LOCAL_MODIFICATION",
                forced: { kind: "replace", expected }
            };
        }
        if (clean) return { kind: "remove", expected };
        return {
            kind: "conflict",
            reason: "REMOVED_REMOTE_LOCAL_MODIFICATION",
            forced: { kind: "remove", expected }
        };
    }
    // Missing, malformed, stale or foreign metadata: only an exact full-tree
    // match with verified desired content is adopted without --force.
    if (D) {
        if (digest !== undefined && digest === D.treeDigest)
            return {
                kind: "repair",
                code: T ? "METADATA_REPAIRED" : "ADOPTED",
                expected
            };
        return {
            kind: "conflict",
            reason: "UNRECOGNIZED_DIRECTORY",
            detail: inspected.marker
                ? "installation metadata is invalid or stale"
                : "installation metadata is missing",
            forced: { kind: "replace", expected }
        };
    }
    // No desired bytes: only exact equality with the indexed verified
    // baseline proves this is our clean, now-obsolete installation.
    if (digest !== undefined && digest === T!.baselineTreeDigest)
        return { kind: "remove", expected };
    return {
        kind: "conflict",
        reason: "REMOVED_REMOTE_LOCAL_MODIFICATION",
        forced: { kind: "remove", expected }
    };
}

function itemAction(kind: OpKind) {
    switch (kind) {
        case "install":
            return "installed" as const;
        case "replace":
        case "repair":
            return "updated" as const;
        case "remove":
        case "forget":
            return "removed" as const;
    }
}

async function verifiedArchiveFiles(
    publication: VerifiedAgentSkillPublication
) {
    const bytes = await readFile(publication.archiveFile);
    if (sha256Hex(bytes) !== publication.checksum)
        throw new Error(
            `Cached Agent Skill archive does not match its verified checksum: ${publication.archiveFile}`
        );
    const archive = await readAgentSkillArchiveFiles(
        bytes,
        publication.ref.type
    );
    if (
        archive.result.treeDigest !== publication.treeDigest ||
        archive.result.name !== publication.name
    )
        throw new Error(
            `Cached Agent Skill archive does not match its verified publication: ${publication.archiveFile}`
        );
    return archive.files;
}

async function stageInstallation(
    op: JournalOp,
    stagingDir: string
): Promise<void> {
    const files = await verifiedArchiveFiles(op.publication!);
    const stagedDir = path.join(stagingDir, `${op.id}-${op.name}`);
    const stagedSkillFile = path.join(stagingDir, `${op.id}-SKILL.md`);
    await mkdir(stagedDir, { mode: 0o755 });
    for (const file of files) {
        const output =
            file.path === "SKILL.md"
                ? stagedSkillFile
                : path.join(stagedDir, ...file.path.split("/"));
        await mkdir(path.dirname(output), { recursive: true, mode: 0o755 });
        await writeFile(output, file.content, { flag: "wx", mode: file.mode });
        await chmod(output, file.mode);
    }
    await writeFile(
        path.join(stagedDir, AGENT_SKILL_INSTALL_MARKER),
        serializeInstallMarker(op.newInstallation!),
        { flag: "wx", mode: 0o644 }
    );
    await chmod(stagedDir, 0o755);
    op.stagedDir = stagedDir;
    op.stagedSkillFile = stagedSkillFile;
}

export async function writeInstallMarker(
    directory: string,
    installation: AgentSkillInstallation
): Promise<void> {
    const marker = path.join(directory, AGENT_SKILL_INSTALL_MARKER);
    const existing = await lstatOrUndefined(marker);
    if (existing && !existing.isFile())
        throw new Error(`Refusing to replace unsafe marker: ${marker}`);
    // Stage the temporary file in the root's hidden staging directory (same
    // filesystem), never inside the skill: a leftover there after a crash
    // would otherwise count as skill content and turn a clean copy into a
    // conflict.
    const staging = path.join(path.dirname(directory), STAGING_DIRECTORY);
    await ensureRealDirectory(staging, 0o700);
    const temporary = path.join(staging, `marker-${randomUUID()}.json`);
    const handle = await open(temporary, "wx", 0o644);
    try {
        await handle.writeFile(serializeInstallMarker(installation), "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
    try {
        await rename(temporary, marker);
    } catch (error) {
        await rm(temporary, { force: true });
        throw error;
    } finally {
        await rmdir(staging).catch(() => undefined);
    }
}

async function assertExpected(op: JournalOp): Promise<void> {
    const expected = op.expected;
    if (!expected) return;
    const found = await lstatOrUndefined(op.path);
    const changed = () =>
        new Error(
            `Agent Skill path changed during synchronization: ${op.path}`
        );
    if (expected.kind === "absent") {
        if (found) throw changed();
        return;
    }
    if (!found) throw changed();
    if (found.isSymbolicLink() || !found.isDirectory()) throw changed();
    const inspected = await inspectInstalledAgentSkill(op.path, op.ref.type);
    if (inspected.kind !== "content" || inspected.digest !== expected.digest)
        throw changed();
}

async function placeNewTree(op: JournalOp): Promise<void> {
    if (await lstatOrUndefined(op.path))
        throw new Error(`Refusing to replace an unexpected path: ${op.path}`);
    await rename(op.stagedDir!, op.path);
    // SKILL.md is placed last so harnesses rarely observe a partial skill.
    await rename(op.stagedSkillFile!, path.join(op.path, "SKILL.md"));
}

async function moveOldAside(op: JournalOp): Promise<void> {
    await rename(op.path, op.rollbackPath!);
}

async function isOurNewTree(op: JournalOp): Promise<boolean> {
    const found = await lstatOrUndefined(op.path);
    if (!found || found.isSymbolicLink() || !found.isDirectory()) return false;
    try {
        return markerMatchesInstallation(
            await readFile(path.join(op.path, AGENT_SKILL_INSTALL_MARKER)),
            op.newInstallation
        );
    } catch {
        return false;
    }
}

/**
 * Undo operations in reverse order; returns rollback paths that could not be
 * restored. Ownership is proven by the op's unique marker/rollback path, not
 * by the journaled state, so a crash between a rename and the next journal
 * save is still undone.
 */
async function rollback(journal: OperationJournal): Promise<string[]> {
    const retained: string[] = [];
    for (const op of [...journal.ops].reverse()) {
        if (
            (op.kind === "install" || op.kind === "replace") &&
            (await isOurNewTree(op))
        ) {
            await rm(op.path, { recursive: true, force: true });
        }
        if (
            (op.kind === "replace" || op.kind === "remove") &&
            op.rollbackPath &&
            (await lstatOrUndefined(op.rollbackPath))
        ) {
            if (await lstatOrUndefined(op.path)) retained.push(op.rollbackPath);
            else await rename(op.rollbackPath, op.path);
        }
    }
    return retained;
}

async function cleanupStaging(
    journal: OperationJournal,
    keep: string[]
): Promise<void> {
    for (const directory of journal.stagingDirs) {
        if (keep.some((item) => item.startsWith(`${directory}${path.sep}`)))
            continue;
        await rm(directory, { recursive: true, force: true });
        // Remove the hidden staging parent only once nothing else uses it.
        await rmdir(path.dirname(directory)).catch(() => undefined);
    }
}

/**
 * Complete or roll back an interrupted transaction. Callers must hold the
 * Agent Skill lock. Returns retained paths that need the user's attention.
 */
export async function recoverAgentSkillOperation(
    env: NodeJS.ProcessEnv = process.env
): Promise<string[]> {
    const journal = await readJournal(env);
    if (!journal) return [];
    let retained: string[] = [];
    if (journal.phase === "committed") {
        if (journal.finalConfig) await saveConfig(journal.finalConfig, env);
    } else if (journal.phase === "committing") {
        retained = await rollback(journal);
    }
    await cleanupStaging(journal, retained);
    await rm(agentSkillOperationJournalPath(env), { force: true });
    if (retained.length) {
        const index = await loadAgentSkillInstallationIndex(env);
        index.retainedPaths = [
            ...new Set([...(index.retainedPaths || []), ...retained])
        ];
        await saveAgentSkillInstallationIndex(index, env);
    }
    return retained;
}

export async function hasPendingAgentSkillOperation(
    env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
    return !!(await lstatOrUndefined(agentSkillOperationJournalPath(env)));
}

function newInstallation(
    candidate: Candidate,
    publication: VerifiedAgentSkillPublication,
    sourceKey: string,
    now: string
): AgentSkillInstallation {
    return {
        installationId: newInstallationId(),
        harness: candidate.target.harness,
        root: path.resolve(candidate.target.root),
        name: candidate.name,
        path: candidate.path,
        sourceKey,
        ref: publication.ref,
        sourceKind: publication.sourceKind,
        baselineChecksum: publication.checksum,
        baselineTreeDigest: publication.treeDigest,
        installedAt: now,
        updatedAt: now
    };
}

/**
 * Plan, preflight, prepare and commit one reconciliation. Callers must hold
 * the Agent Skill lock and have recovered any earlier journal.
 */
export async function reconcileAgentSkillInstallations(
    request: ReconcileRequest
): Promise<ReconcileOutcome> {
    const env = request.env || process.env;
    const index = await loadAgentSkillInstallationIndex(env);
    const now = new Date().toISOString();
    const desired = request.desired.filter(
        (item) => !request.type || item.ref.type === request.type
    );
    const byName = new Map<string, VerifiedAgentSkillPublication>();
    for (const item of desired) {
        if (byName.has(item.name))
            throw new Error(
                `Agent Skill name collision in desired publications: ${item.name}`
            );
        byName.set(item.name, item);
    }
    if (desired.length && !request.sourceKey)
        throw new Error("Desired Agent Skills require a verified source");

    const candidates: Candidate[] = [];
    const items: AgentSkillSyncItemResult[] = [];
    const conflicts: AgentSkillConflict[] = [];
    for (const target of request.targets) {
        const root = path.resolve(target.root);
        const tracked = Object.values(index.installations).filter(
            (item) =>
                path.resolve(item.root) === root &&
                (!request.type || item.ref.type === request.type)
        );
        const names = new Set([
            ...byName.keys(),
            ...tracked.map((t) => t.name)
        ]);
        let rootError: string | undefined;
        try {
            await assertRealManagedAncestors(root);
            const rootStat = await lstatOrUndefined(root);
            if (
                rootStat &&
                (rootStat.isSymbolicLink() || !rootStat.isDirectory())
            )
                rootError = "skill root is not a real directory";
        } catch (error) {
            rootError = (error as Error).message;
        }
        for (const name of [...names].sort()) {
            const candidate: Candidate = {
                target: { ...target, root },
                name,
                path: managedChildPath(root, name),
                desired: byName.get(name),
                tracked: index.installations[installationKey(root, name)]
            };
            if (rootError) {
                conflicts.push({
                    name,
                    harness: target.harness,
                    path: candidate.path,
                    reason: "UNSAFE_PATH",
                    detail: rootError,
                    remedy: harnessRemedy("UNSAFE_PATH")
                });
                continue;
            }
            candidates.push(candidate);
        }
    }

    const ops: JournalOp[] = [];
    const finalIndex: AgentSkillInstallationIndexV1 = JSON.parse(
        JSON.stringify(index)
    );
    for (const candidate of candidates) {
        const { tracked: T, desired: D } = candidate;
        const ref = (D || T)!.ref;
        if (
            T &&
            T.sourceKey === request.sourceKey &&
            request.unresolved?.has(sourceStateKey(T.ref)) &&
            (!D || sourceStateKey(D.ref) === sourceStateKey(T.ref))
        ) {
            items.push({
                ref,
                name: candidate.name,
                action: "skipped",
                code: "SOURCE_UNRESOLVED",
                harness: candidate.target.harness,
                path: candidate.path
            });
            continue;
        }
        let decision = await classify(candidate, request.sourceKey);
        if (decision.kind === "conflict") {
            if (
                decision.reason === "UNSAFE_PATH" ||
                !request.force ||
                !decision.forced
            ) {
                conflicts.push({
                    name: candidate.name,
                    harness: candidate.target.harness,
                    path: candidate.path,
                    reason: decision.reason,
                    ...(decision.detail ? { detail: decision.detail } : {}),
                    remedy: harnessRemedy(decision.reason)
                });
                continue;
            }
            decision = {
                kind: decision.forced.kind,
                code:
                    decision.forced.kind === "remove"
                        ? "FORCED_REMOVE"
                        : "FORCED_REPLACE",
                expected: decision.forced.expected
            };
        }
        if (decision.kind === "none") {
            items.push({
                ref,
                name: candidate.name,
                action: "unchanged",
                harness: candidate.target.harness,
                path: candidate.path
            });
            continue;
        }
        const key = installationKey(candidate.target.root, candidate.name);
        const op: JournalOp = {
            id: randomUUID(),
            kind: decision.kind,
            harness: candidate.target.harness,
            root: candidate.target.root,
            name: candidate.name,
            path: candidate.path,
            ref,
            ...(decision.code ? { code: decision.code } : {}),
            ...(decision.expected ? { expected: decision.expected } : {}),
            state: "pending"
        };
        if (decision.kind === "install" || decision.kind === "replace") {
            op.publication = D!;
            op.newInstallation = newInstallation(
                candidate,
                D!,
                request.sourceKey!,
                now
            );
            finalIndex.installations[key] = op.newInstallation;
        } else if (decision.kind === "repair") {
            op.newInstallation = {
                ...newInstallation(candidate, D!, request.sourceKey!, now),
                installedAt: T?.installedAt || now
            };
            finalIndex.installations[key] = op.newInstallation;
        } else {
            delete finalIndex.installations[key];
        }
        ops.push(op);
    }

    if (conflicts.length) {
        return {
            blocked: true,
            items,
            conflicts,
            retainedPaths: index.retainedPaths || []
        };
    }

    if (request.activeProfile !== undefined) {
        if (request.activeProfile === null) delete finalIndex.activeProfile;
        else finalIndex.activeProfile = request.activeProfile;
        if (request.sourceKey) finalIndex.activeSourceKey = request.sourceKey;
        else delete finalIndex.activeSourceKey;
    } else if (request.sourceKey) {
        finalIndex.activeSourceKey = request.sourceKey;
    }

    const journal: OperationJournal = {
        version: 1,
        id: randomUUID(),
        phase: "preparing",
        createdAt: now,
        stagingDirs: [],
        ops,
        finalIndex,
        ...(request.finalConfig ? { finalConfig: request.finalConfig } : {})
    };
    const stagingByRoot = new Map<string, string>();
    for (const op of ops) {
        if (
            op.kind !== "install" &&
            op.kind !== "replace" &&
            op.kind !== "remove"
        )
            continue;
        if (!stagingByRoot.has(op.root)) {
            const directory = path.join(op.root, STAGING_DIRECTORY, journal.id);
            stagingByRoot.set(op.root, directory);
            journal.stagingDirs.push(directory);
        }
        if (op.kind !== "install")
            op.rollbackPath = path.join(
                stagingByRoot.get(op.root)!,
                `${op.id}-rollback-${op.name}`
            );
    }

    // Preparation: nothing installed changes and a failure leaves only
    // private staging data, which is removed here or by recovery.
    if (ops.some((op) => op.kind !== "forget")) {
        await saveJournal(journal, env);
        try {
            for (const [root, directory] of stagingByRoot) {
                await ensureRealDirectory(root, 0o755);
                await ensureRealDirectory(path.dirname(directory), 0o700);
                await mkdir(directory, { mode: 0o700 });
            }
            for (const op of ops)
                if (op.kind === "install" || op.kind === "replace")
                    await stageInstallation(op, stagingByRoot.get(op.root)!);
        } catch (error) {
            await cleanupStaging(journal, []);
            await rm(agentSkillOperationJournalPath(env), { force: true });
            throw error;
        }
    }

    journal.phase = "committing";
    await saveJournal(journal, env);
    try {
        for (const op of ops) {
            if (op.kind === "forget") {
                op.state = "done";
                continue;
            }
            await assertExpected(op);
            if (op.kind === "repair") {
                await writeInstallMarker(op.path, op.newInstallation!);
                op.state = "done";
                await saveJournal(journal, env);
                continue;
            }
            if (op.kind === "replace" || op.kind === "remove") {
                await moveOldAside(op);
                op.state = "oldMoved";
                await saveJournal(journal, env);
                await agentSkillReconcileTestHooks.afterOperation?.(
                    op.kind,
                    op.state
                );
            }
            if (op.kind === "install" || op.kind === "replace") {
                await placeNewTree(op);
                op.state = "newPlaced";
            }
            op.state = "done";
            await saveJournal(journal, env);
            await agentSkillReconcileTestHooks.afterOperation?.(
                op.kind,
                op.state
            );
        }
    } catch (error) {
        if ((error as { simulatedCrash?: boolean })?.simulatedCrash)
            throw error;
        const retained = await rollback(journal);
        await cleanupStaging(journal, retained);
        await rm(agentSkillOperationJournalPath(env), { force: true });
        if (retained.length) {
            index.retainedPaths = [
                ...new Set([...(index.retainedPaths || []), ...retained])
            ];
            await saveAgentSkillInstallationIndex(index, env);
        }
        throw error;
    }

    // Commit point: the index now describes the new installations.
    await saveAgentSkillInstallationIndex(finalIndex, env);
    journal.phase = "committed";
    await saveJournal(journal, env);
    await agentSkillReconcileTestHooks.afterIndexCommit?.();
    if (journal.finalConfig) await saveConfig(journal.finalConfig, env);
    await cleanupStaging(journal, []);
    await rm(agentSkillOperationJournalPath(env), { force: true });

    for (const op of ops) {
        items.push({
            ref: op.ref,
            name: op.name,
            action: itemAction(op.kind),
            ...(op.code ? { code: op.code } : {}),
            harness: op.harness,
            path: op.path
        });
    }
    return {
        blocked: false,
        items,
        conflicts: [],
        retainedPaths: finalIndex.retainedPaths || []
    };
}
