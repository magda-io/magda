import path from "node:path";
import {
    chmod,
    lstat,
    mkdir,
    open,
    readFile,
    readdir,
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
    readProjectedAgentSkillArchive,
    sha256Hex
} from "./agentSkillArchive.js";
import type {
    AgentSkillHarness,
    AgentSkillInstallMarker,
    VerifiedAgentSkillPublication
} from "./agentSkillLocalState.js";
import {
    createInstallMarker,
    parseInstallMarker,
    serializeInstallMarker,
    snapshotKey,
    verifiedMarkerSource
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
import { loadConfig } from "./profile.js";
import type { AgentSkillTarget } from "./skills.js";

/*
 * One scan-based reconciliation engine for local online sync, offline profile
 * switching and Workspace Sandbox sync (design 2026-10-18).
 *
 *   recover  per-skill leftovers under <root>/.magda-skill-staging/<op>/
 *   scan     immediate children of every selected root; candidates are desired
 *            names plus directories carrying a valid installation marker
 *   classify each candidate against its marker baseline and the verified
 *            desired publication; collect every predictable conflict first
 *   apply    each skill independently. A conflict blocks only that
 *            installation; clean installs, updates, removals and metadata
 *            repairs elsewhere proceed. An unexpected I/O failure affects
 *            only that skill: completed work in other skills/harnesses stays,
 *            and the next sync converges.
 *
 * Callers run this only after global remote preparation has verified the
 * complete desired set; a remote-source failure never reaches this engine.
 *
 * There is no installation index, global journal or cross-harness rollback.
 * Each replacement stages the complete new tree (marker included) beside the
 * root, moves the old tree to a per-skill backup, renames the new tree into
 * place and drops the backup; a failed rename restores the backup.
 */

export const STAGING_DIRECTORY = ".magda-skill-staging";
const OPERATION_FILE = "operation.json";
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Test seam for crash/I/O tests only. A hook may throw an error with
 * `simulatedCrash: true` to stop as an abrupt process exit would, skipping
 * the in-process restore of that one skill.
 */
export const agentSkillReconcileTestHooks: {
    afterBackup?: (name: string) => Promise<void>;
    beforeOperation?: (kind: string, harness: string) => Promise<void>;
} = {};

export type AgentSkillProblemReason =
    | "LOCAL_MODIFICATION"
    | "UNRECOGNIZED_DIRECTORY"
    | "NOT_DESIRED_LOCAL_MODIFICATION"
    | "UNVERIFIED_SOURCE"
    | "UNSAFE_PATH"
    | "OPERATION_FAILED"
    | "RECOVERY_RETAINED";

export interface AgentSkillSourceDescription {
    key: string;
    baseUrl?: string;
    userId?: string;
    /** Configured profiles last verified as this account. */
    profiles?: string[];
}

export interface AgentSkillProblem {
    name: string;
    harness: AgentSkillHarness;
    path: string;
    reason: AgentSkillProblemReason;
    detail?: string;
    /** Source account recorded by the installation, when known. */
    source?: AgentSkillSourceDescription;
    remedy: string;
}

export interface ReconcileRequest {
    /** Active verified source whose desired set is supplied. */
    sourceKey: string;
    /** Complete verified desired publications for that source. */
    desired: VerifiedAgentSkillPublication[];
    /** Same-source refs whose absence is not authoritative; left untouched. */
    unresolved?: Set<string>;
    targets: AgentSkillTarget[];
    force: boolean;
    /** Restrict candidates to one publication type; others stay untouched. */
    type?: AgentSkillType;
    env?: NodeJS.ProcessEnv;
}

export interface ReconcileOutcome {
    items: AgentSkillSyncItemResult[];
    problems: AgentSkillProblem[];
}

type OpKind = "install" | "replace" | "remove" | "repair";

interface OperationRecord {
    version: 1;
    kind: OpKind;
    name: string;
    /** Marker id of the prepared new tree, when one exists. */
    newInstallationId?: string;
    createdAt: string;
}

async function lstatOrUndefined(target: string) {
    try {
        return await lstat(target);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") return undefined;
        throw error;
    }
}

/** Read a regular, non-link file of bounded size; undefined otherwise. */
async function readRegularFile(file: string): Promise<Buffer | undefined> {
    const found = await lstatOrUndefined(file);
    if (!found || !found.isFile() || found.size > 64 * 1024) return undefined;
    return readFile(file);
}

function remedyFor(reason: AgentSkillProblemReason, target: string): string {
    switch (reason) {
        case "UNSAFE_PATH":
            return "Move or remove this path manually; --force never follows links or replaces special files.";
        case "LOCAL_MODIFICATION":
            return `Publish it with \`mgd agent-skill publish ${target}\`, or discard and reconcile with \`mgd agent-skill sync --force\`.`;
        case "NOT_DESIRED_LOCAL_MODIFICATION":
            return `This edited skill is not part of the current profile's skills (removed remotely or installed by another profile). Publish it with \`mgd agent-skill publish ${target}\`, copy it elsewhere, or remove it with \`mgd agent-skill sync --force\`.`;
        case "UNRECOGNIZED_DIRECTORY":
            return "A directory with this skill's name has different content. Rename it to keep it, or discard it with `mgd agent-skill sync --force`.";
        case "UNVERIFIED_SOURCE":
            return "Its installation metadata names an account this computer has not verified. Sync with that account's profile first, or discard it with `mgd agent-skill sync --force`.";
        case "OPERATION_FAILED":
            return "Fix the reported filesystem error and rerun `mgd agent-skill sync`; completed skills are kept.";
        case "RECOVERY_RETAINED":
            return "An interrupted update left this backup while the skill path is occupied. Compare the two, keep what you need, then delete the backup directory.";
    }
}

async function describeSource(
    key: string,
    state: Awaited<ReturnType<typeof verifiedMarkerSource>>
): Promise<AgentSkillSourceDescription> {
    let profiles: string[] = [];
    try {
        const cfg = await loadConfig();
        profiles = Object.entries(cfg.profiles)
            .filter(([, profile]) => profile.agentSkillSource?.key === key)
            .map(([name]) => name);
    } catch {
        // Descriptive only.
    }
    return {
        key,
        ...(state
            ? {
                  baseUrl: state.identity.canonicalBaseUrl,
                  userId: state.identity.userId
              }
            : {}),
        ...(profiles.length ? { profiles } : {})
    };
}

/* ---------------------------- per-skill staging ---------------------------- */

const stagingRoot = (root: string) => path.join(root, STAGING_DIRECTORY);

async function createOperation(
    root: string,
    record: Omit<OperationRecord, "version" | "createdAt">
): Promise<string> {
    await ensureRealDirectory(stagingRoot(root), 0o700);
    const directory = path.join(stagingRoot(root), randomUUID());
    await mkdir(directory, { mode: 0o700 });
    // Written first, so any leftover operation names its skill.
    await writeFile(
        path.join(directory, OPERATION_FILE),
        JSON.stringify({
            version: 1,
            ...record,
            createdAt: new Date().toISOString()
        }),
        { flag: "wx", mode: 0o600 }
    );
    return directory;
}

async function finishOperation(directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true });
    await rmdir(path.dirname(directory)).catch(() => undefined);
}

async function verifiedArchiveFiles(
    publication: VerifiedAgentSkillPublication
) {
    const bytes = await readFile(publication.archiveFile);
    if (sha256Hex(bytes) !== publication.checksum)
        throw new Error(
            `Cached Agent Skill archive does not match its verified checksum: ${publication.archiveFile}`
        );
    // An installed shared skill under an alias gets a locally renamed
    // SKILL.md; the cached publisher archive itself is never changed.
    const projected = await readProjectedAgentSkillArchive(
        bytes,
        publication.ref.type,
        publication.alias
    );
    if (
        projected.treeDigest !== publication.treeDigest ||
        projected.name !== publication.name
    )
        throw new Error(
            `Cached Agent Skill archive does not match its verified publication: ${publication.archiveFile}`
        );
    return projected.files;
}

/** Stage the complete new skill, marker included, as <operation>/new. */
async function stageNewTree(
    operation: string,
    publication: VerifiedAgentSkillPublication,
    marker: AgentSkillInstallMarker
): Promise<string> {
    const files = await verifiedArchiveFiles(publication);
    const staged = path.join(operation, "new");
    await mkdir(staged, { mode: 0o755 });
    for (const file of files) {
        const output = path.join(staged, ...file.path.split("/"));
        await mkdir(path.dirname(output), { recursive: true, mode: 0o755 });
        await writeFile(output, file.content, { flag: "wx", mode: file.mode });
        await chmod(output, file.mode);
    }
    await writeFile(
        path.join(staged, AGENT_SKILL_INSTALL_MARKER),
        serializeInstallMarker(marker),
        { flag: "wx", mode: 0o644 }
    );
    await chmod(staged, 0o755);
    return staged;
}

/** Atomically (re)write only the root marker of an existing skill. */
export async function writeInstallMarker(
    directory: string,
    marker: AgentSkillInstallMarker
): Promise<void> {
    const target = path.join(directory, AGENT_SKILL_INSTALL_MARKER);
    const existing = await lstatOrUndefined(target);
    if (existing && !existing.isFile())
        throw new Error(`Refusing to replace unsafe marker: ${target}`);
    // The temporary file lives in the staging area, never inside the skill,
    // so a crash cannot leave stray content that turns a copy into a conflict.
    const staging = stagingRoot(path.dirname(directory));
    await ensureRealDirectory(staging, 0o700);
    const temporary = path.join(staging, `marker-${randomUUID()}.json`);
    const handle = await open(temporary, "wx", 0o644);
    try {
        await handle.writeFile(serializeInstallMarker(marker), "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
    try {
        await rename(temporary, target);
    } catch (error) {
        await rm(temporary, { force: true });
        throw error;
    } finally {
        await rmdir(staging).catch(() => undefined);
    }
}

export async function readInstallMarker(
    directory: string,
    name = path.basename(directory)
): Promise<AgentSkillInstallMarker | undefined> {
    return parseInstallMarker(
        await readRegularFile(path.join(directory, AGENT_SKILL_INSTALL_MARKER)),
        name
    );
}

/**
 * Prove an interrupted operation's new tree is the complete installation it
 * staged: a real directory whose valid marker carries the operation's new
 * installation id, names a verified source, and whose full content digest
 * equals the marker baseline. An id match alone is never enough.
 */
async function verifyReplacement(
    final: string,
    name: string,
    newInstallationId: string
): Promise<"complete" | "incomplete" | "other"> {
    const found = await lstatOrUndefined(final);
    if (!found || found.isSymbolicLink() || !found.isDirectory())
        return "other";
    const marker = await readInstallMarker(final, name);
    if (marker?.installationId !== newInstallationId) return "other";
    if (!(await verifiedMarkerSource(marker))) return "incomplete";
    const inspected = await inspectInstalledAgentSkill(
        final,
        marker.source.type
    );
    return inspected.kind === "content" &&
        inspected.digest === marker.baselineTreeDigest
        ? "complete"
        : "incomplete";
}

/**
 * Recover interrupted per-skill operations in one root. Only this tool's
 * reserved staging directory is enumerated, and nothing is followed through
 * a link. A backup is restored when the skill path is free, dropped only when
 * the completed new installation is in place, and otherwise retained.
 */
async function recoverRoot(
    target: AgentSkillTarget
): Promise<ReconcileOutcome> {
    const items: AgentSkillSyncItemResult[] = [];
    const problems: AgentSkillProblem[] = [];
    const staging = stagingRoot(target.root);
    const stagingStat = await lstatOrUndefined(staging);
    if (!stagingStat) return { items, problems };
    if (stagingStat.isSymbolicLink() || !stagingStat.isDirectory()) {
        problems.push({
            name: STAGING_DIRECTORY,
            harness: target.harness,
            path: staging,
            reason: "UNSAFE_PATH",
            detail: "staging path is not a real directory",
            remedy: remedyFor("UNSAFE_PATH", staging)
        });
        return { items, problems };
    }
    for (const entry of await readdir(staging)) {
        const operation = path.join(staging, entry);
        const found = await lstat(operation);
        if (found.isFile() && /^marker-[0-9a-f-]{36}\.json$/.test(entry)) {
            await rm(operation, { force: true });
            continue;
        }
        if (found.isSymbolicLink() || !found.isDirectory()) continue;
        let record: OperationRecord | undefined;
        try {
            const raw = await readRegularFile(
                path.join(operation, OPERATION_FILE)
            );
            record = raw ? JSON.parse(raw.toString("utf8")) : undefined;
        } catch {
            record = undefined;
        }
        const old = path.join(operation, "old");
        const oldStat = await lstatOrUndefined(old);
        const hasOld =
            !!oldStat && oldStat.isDirectory() && !oldStat.isSymbolicLink();
        if (!record || !SKILL_NAME.test(record.name || "")) {
            if (hasOld)
                problems.push({
                    name: entry,
                    harness: target.harness,
                    path: old,
                    reason: "RECOVERY_RETAINED",
                    detail: "unidentifiable interrupted operation",
                    remedy: remedyFor("RECOVERY_RETAINED", old)
                });
            // Without a backup only prepared, never-installed content remains.
            else await finishOperation(operation);
            continue;
        }
        if (!hasOld) {
            // No backup was taken, so the installation (if any) is untouched.
            await finishOperation(operation);
            continue;
        }
        const final = managedChildPath(target.root, record.name);
        const finalStat = await lstatOrUndefined(final);
        const ref = { type: "user" as const, id: record.name };
        const base = {
            ref,
            name: record.name,
            harness: target.harness,
            path: final
        };
        const replacement =
            record.newInstallationId && finalStat
                ? await verifyReplacement(
                      final,
                      record.name,
                      record.newInstallationId
                  )
                : "absent";
        if (replacement === "complete") {
            await finishOperation(operation);
            items.push({
                ...base,
                action: "updated",
                code: "RECOVERED_COMPLETED"
            });
        } else if (!finalStat) {
            await rename(old, final);
            await finishOperation(operation);
            items.push({
                ...base,
                action: "unchanged",
                code: "RECOVERED_RESTORED"
            });
        } else {
            problems.push({
                name: record.name,
                harness: target.harness,
                path: old,
                reason: "RECOVERY_RETAINED",
                detail:
                    replacement === "incomplete"
                        ? `the replacement at ${final} is incomplete or corrupted`
                        : `${final} is occupied by other content`,
                remedy: remedyFor("RECOVERY_RETAINED", old)
            });
        }
    }
    return { items, problems };
}

/* ----------------------------- classification ----------------------------- */

interface Candidate {
    target: AgentSkillTarget;
    name: string;
    path: string;
    desired?: VerifiedAgentSkillPublication;
    marker?: AgentSkillInstallMarker;
}

interface Expected {
    digest?: string;
}

type Decision =
    | { kind: "none"; code?: string }
    | { kind: OpKind; code?: string; expected?: Expected }
    | {
          kind: "problem";
          reason: AgentSkillProblemReason;
          detail?: string;
          source?: AgentSkillSourceDescription;
          forced?: { kind: OpKind; expected: Expected };
      };

async function classify(
    candidate: Candidate,
    request: ReconcileRequest
): Promise<Decision> {
    const { desired: D, marker: M } = candidate;
    const type = (D?.ref.type || M?.source.type)!;
    if (isReservedAgentSkillName(candidate.name))
        return {
            kind: "problem",
            reason: "UNSAFE_PATH",
            detail: "reserved runtime-bundled skill name"
        };
    const found = await lstatOrUndefined(candidate.path);
    if (!found) return D ? { kind: "install" } : { kind: "none" };
    if (found.isSymbolicLink())
        return {
            kind: "problem",
            reason: "UNSAFE_PATH",
            detail: "symbolic link"
        };
    if (!found.isDirectory())
        return {
            kind: "problem",
            reason: "UNSAFE_PATH",
            detail: "not a directory"
        };
    const inspected = await inspectInstalledAgentSkill(candidate.path, type);
    if (inspected.kind === "unsafe")
        return {
            kind: "problem",
            reason: "UNSAFE_PATH",
            detail: inspected.reason
        };
    const digest = inspected.digest;
    const expected = { digest };
    if (M) {
        // A marker is a provenance hint: its account must be verified on
        // this machine before its baseline can prove the copy is clean.
        const verified = await verifiedMarkerSource(M, request.env);
        const source = await describeSource(M.sourceKey, verified);
        const clean =
            !!verified &&
            digest !== undefined &&
            digest === M.baselineTreeDigest;
        const sameSource = M.sourceKey === request.sourceKey;
        if (D) {
            if (
                clean &&
                sameSource &&
                M.source.type === D.ref.type &&
                M.source.id === D.ref.id &&
                M.source.kind === D.sourceKind &&
                M.installationRecordId === D.installationRecordId &&
                M.alias === D.alias &&
                M.baselineChecksum === D.checksum &&
                M.baselineTreeDigest === D.treeDigest
            )
                return { kind: "none" };
            if (digest !== undefined && digest === D.treeDigest)
                return {
                    kind: "repair",
                    code: sameSource ? "BASELINE_UPDATED" : "SOURCE_REBOUND",
                    expected
                };
            if (clean) return { kind: "replace", expected };
            return {
                kind: "problem",
                reason: verified ? "LOCAL_MODIFICATION" : "UNVERIFIED_SOURCE",
                source,
                forced: { kind: "replace", expected }
            };
        }
        if (
            sameSource &&
            request.unresolved?.has(
                snapshotKey({
                    ref: { type: M.source.type, id: M.source.id },
                    sourceKind: M.source.kind,
                    installationRecordId: M.installationRecordId
                })
            )
        )
            return { kind: "none", code: "SOURCE_UNRESOLVED" };
        if (clean) return { kind: "remove", expected };
        return {
            kind: "problem",
            reason: verified
                ? "NOT_DESIRED_LOCAL_MODIFICATION"
                : "UNVERIFIED_SOURCE",
            source,
            forced: { kind: "remove", expected }
        };
    }
    // Missing/invalid metadata: only an exact full-tree match with the
    // verified desired publication is adopted without --force.
    if (!D) return { kind: "none" };
    if (digest !== undefined && digest === D.treeDigest)
        return {
            kind: "repair",
            code: inspected.marker ? "METADATA_REPAIRED" : "ADOPTED",
            expected
        };
    return {
        kind: "problem",
        reason: "UNRECOGNIZED_DIRECTORY",
        detail: inspected.marker
            ? "installation metadata is invalid or stale"
            : "installation metadata is missing",
        forced: { kind: "replace", expected }
    };
}

/** Immediate children of a root that carry a valid installation marker. */
async function scanRoot(
    target: AgentSkillTarget,
    type: AgentSkillType | undefined
): Promise<Map<string, AgentSkillInstallMarker>> {
    const markers = new Map<string, AgentSkillInstallMarker>();
    let names: string[];
    try {
        names = await readdir(target.root);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return markers;
        throw error;
    }
    for (const name of names) {
        if (!SKILL_NAME.test(name)) continue;
        const directory = path.join(target.root, name);
        const found = await lstat(directory);
        if (found.isSymbolicLink() || !found.isDirectory()) continue;
        const marker = await readInstallMarker(directory, name);
        if (marker && (!type || marker.source.type === type))
            markers.set(name, marker);
    }
    return markers;
}

/* --------------------------------- apply ---------------------------------- */

async function assertUnchanged(candidate: Candidate, expected?: Expected) {
    const found = await lstatOrUndefined(candidate.path);
    if (!found || found.isSymbolicLink() || !found.isDirectory())
        throw new Error(
            `Skill path changed during synchronization: ${candidate.path}`
        );
    const type = (candidate.desired?.ref.type ||
        candidate.marker?.source.type)!;
    const inspected = await inspectInstalledAgentSkill(candidate.path, type);
    if (inspected.kind !== "content" || inspected.digest !== expected?.digest)
        throw new Error(
            `Skill content changed during synchronization: ${candidate.path}`
        );
}

async function apply(
    kind: OpKind,
    candidate: Candidate,
    sourceKey: string,
    expected?: Expected
): Promise<void> {
    const root = candidate.target.root;
    await agentSkillReconcileTestHooks.beforeOperation?.(
        kind,
        candidate.target.harness
    );
    if (kind === "repair") {
        await assertUnchanged(candidate, expected);
        await writeInstallMarker(
            candidate.path,
            createInstallMarker(
                sourceKey,
                candidate.desired!,
                candidate.marker?.installedAt
            )
        );
        return;
    }
    await ensureRealDirectory(root, 0o755);
    const marker =
        kind === "remove"
            ? undefined
            : createInstallMarker(sourceKey, candidate.desired!);
    const operation = await createOperation(root, {
        kind,
        name: candidate.name,
        ...(marker ? { newInstallationId: marker.installationId } : {})
    });
    let staged: string | undefined;
    try {
        if (marker)
            staged = await stageNewTree(operation, candidate.desired!, marker);
        if (kind === "install") {
            if (await lstatOrUndefined(candidate.path))
                throw new Error(
                    `Refusing to replace an unexpected path: ${candidate.path}`
                );
        } else {
            await assertUnchanged(candidate, expected);
        }
    } catch (error) {
        // Preparation failed: nothing installed has been touched.
        await finishOperation(operation);
        throw error;
    }
    if (kind === "install") {
        await rename(staged!, candidate.path);
        await finishOperation(operation);
        return;
    }
    const backup = path.join(operation, "old");
    await rename(candidate.path, backup);
    await agentSkillReconcileTestHooks.afterBackup?.(candidate.name);
    if (staged) {
        try {
            await rename(staged, candidate.path);
        } catch (error) {
            // Restore this one skill. If its path is now occupied, keep the
            // operation (and so the backup) for the next sync to report.
            if (!(await lstatOrUndefined(candidate.path))) {
                await rename(backup, candidate.path);
                await finishOperation(operation);
            }
            throw error;
        }
    }
    await finishOperation(operation);
}

/* ------------------------------- reconcile -------------------------------- */

const actionFor = (kind: OpKind) =>
    kind === "install"
        ? "installed"
        : kind === "remove"
        ? "removed"
        : "updated";

/**
 * Reconcile every selected root with a verified desired set. Callers hold the
 * Agent Skill lock and call this only with a trustworthy desired snapshot;
 * absence from it is what authorizes removing a clean marked installation.
 */
export async function reconcileAgentSkillInstallations(
    request: ReconcileRequest
): Promise<ReconcileOutcome> {
    const byName = new Map<string, VerifiedAgentSkillPublication>();
    for (const item of request.desired) {
        if (request.type && item.ref.type !== request.type) continue;
        if (byName.has(item.name))
            throw new Error(
                `Agent Skill name collision in desired publications: ${item.name}`
            );
        byName.set(item.name, item);
    }
    const items: AgentSkillSyncItemResult[] = [];
    const problems: AgentSkillProblem[] = [];
    const planned: Array<{
        candidate: Candidate;
        kind: OpKind;
        code?: string;
        expected?: Expected;
    }> = [];
    const refOf = (candidate: Candidate) =>
        candidate.desired?.ref || {
            type: candidate.marker!.source.type,
            id: candidate.marker!.source.id
        };

    for (const raw of request.targets) {
        const target = { ...raw, root: path.resolve(raw.root) };
        let rootError: string | undefined;
        try {
            await assertRealManagedAncestors(target.root);
            const found = await lstatOrUndefined(target.root);
            if (found && (found.isSymbolicLink() || !found.isDirectory()))
                rootError = "skill root is not a real directory";
        } catch (error) {
            rootError = (error as Error).message;
        }
        if (rootError) {
            problems.push({
                name: "*",
                harness: target.harness,
                path: target.root,
                reason: "UNSAFE_PATH",
                detail: rootError,
                remedy: remedyFor("UNSAFE_PATH", target.root)
            });
            continue;
        }
        const recovered = await recoverRoot(target);
        items.push(...recovered.items);
        problems.push(...recovered.problems);
        const markers = await scanRoot(target, request.type);
        const names = [
            ...new Set([...byName.keys(), ...markers.keys()])
        ].sort();
        for (const name of names) {
            const candidate: Candidate = {
                target,
                name,
                path: managedChildPath(target.root, name),
                desired: byName.get(name),
                marker: markers.get(name)
            };
            let decision: Decision;
            try {
                decision = await classify(candidate, request);
            } catch (error) {
                decision = {
                    kind: "problem",
                    reason: "OPERATION_FAILED",
                    detail: (error as Error).message
                };
            }
            if (decision.kind === "problem") {
                if (request.force && decision.forced) {
                    planned.push({
                        candidate,
                        kind: decision.forced.kind,
                        code:
                            decision.forced.kind === "remove"
                                ? "FORCED_REMOVE"
                                : "FORCED_REPLACE",
                        expected: decision.forced.expected
                    });
                    continue;
                }
                problems.push({
                    name,
                    harness: target.harness,
                    path: candidate.path,
                    reason: decision.reason,
                    ...(decision.detail ? { detail: decision.detail } : {}),
                    ...(decision.source ? { source: decision.source } : {}),
                    remedy: remedyFor(decision.reason, candidate.path)
                });
                continue;
            }
            if (decision.kind === "none") {
                if (candidate.desired || decision.code)
                    items.push({
                        ref: refOf(candidate),
                        name,
                        action: decision.code ? "skipped" : "unchanged",
                        ...(decision.code ? { code: decision.code } : {}),
                        harness: target.harness,
                        path: candidate.path
                    });
                continue;
            }
            planned.push({
                candidate,
                kind: decision.kind,
                code: decision.code,
                expected: decision.expected
            });
        }
    }

    // Every predictable conflict was classified and reported above; each
    // blocks only its own installation. All other safe operations proceed.
    for (const step of planned) {
        const { candidate, kind } = step;
        const base = {
            ref: refOf(candidate),
            name: candidate.name,
            harness: candidate.target.harness,
            path: candidate.path
        };
        try {
            await apply(kind, candidate, request.sourceKey, step.expected);
            items.push({
                ...base,
                action: actionFor(kind),
                ...(step.code ? { code: step.code } : {})
            });
        } catch (error) {
            if ((error as { simulatedCrash?: boolean })?.simulatedCrash)
                throw error;
            items.push({ ...base, action: "failed", code: "OPERATION_FAILED" });
            problems.push({
                name: candidate.name,
                harness: candidate.target.harness,
                path: candidate.path,
                reason: "OPERATION_FAILED",
                detail: (error as Error).message,
                remedy: remedyFor("OPERATION_FAILED", candidate.path)
            });
        }
    }
    return { items, problems };
}
