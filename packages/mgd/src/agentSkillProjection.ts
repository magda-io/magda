import path from "node:path";
import {
    cp,
    lstat,
    mkdir,
    readFile,
    readdir,
    readlink,
    rename,
    rm,
    symlink,
    writeFile
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
    extractAgentSkillArchive,
    validateAgentSkillArchive,
    validateAgentSkillDirectory
} from "./agentSkillArchive.js";
import type {
    AgentSkillProjectionEntry,
    AgentSkillSourceIdentity
} from "./agentSkillLocalState.js";
import {
    agentSkillDataRoot,
    loadAgentSkillProjectionState,
    loadAgentSkillSourceState,
    loadAgentSkillSourceStateByKey,
    saveAgentSkillProjectionState,
    saveAgentSkillSourceState
} from "./agentSkillLocalState.js";
import {
    assertRealManagedAncestors,
    ensureRealDirectory,
    managedChildPath,
    withAgentSkillStateLock
} from "./agentSkillState.js";
import { resolveAgentSkillProjectionTargets } from "./skills.js";

export interface AgentSkillActivationResult {
    activated: number;
    deactivated: number;
    preservedDrafts: number;
    conflicts: string[];
}

async function pathExists(target: string): Promise<boolean> {
    try {
        await lstat(target);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

function projectionKey(root: string, name: string): string {
    return `${path.resolve(root)}\0${name}`;
}

function ownershipMarker(entry: AgentSkillProjectionEntry): string {
    return path.join(
        entry.root,
        ".mgd-agent-skill-ownership",
        `${entry.name}.json`
    );
}

async function ownershipReservation(
    entry: AgentSkillProjectionEntry
): Promise<boolean | undefined> {
    const marker = ownershipMarker(entry);
    const script = String.raw`
import json, os, sys
parent, name, token, source, source_entry = sys.argv[1:]
try:
    parent_fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        marker_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        try:
            with os.fdopen(marker_fd, "r") as handle:
                value = json.load(handle)
        finally:
            marker_fd = -1
    finally:
        os.close(parent_fd)
except (FileNotFoundError, OSError, ValueError, json.JSONDecodeError):
    sys.exit(44)
if value.get("token") != token or value.get("sourceKey") != source or value.get("sourceEntryKey") != source_entry or type(value.get("reserved")) is not bool:
    sys.exit(44)
sys.exit(11 if value["reserved"] else 10)
`;
    try {
        const code = await runProjectionPython(script, [
            path.dirname(marker),
            path.basename(marker),
            entry.ownershipToken,
            entry.sourceKey,
            entry.sourceEntryKey
        ]);
        return code === 11 ? true : code === 10 ? false : undefined;
    } catch {
        return undefined;
    }
}

async function ownershipMatches(
    entry: AgentSkillProjectionEntry
): Promise<boolean> {
    return (await ownershipReservation(entry)) !== undefined;
}

async function writeOwnershipMarker(
    entry: AgentSkillProjectionEntry,
    reserved = false,
    exclusive = true
): Promise<void> {
    await assertRealManagedAncestors(entry.root);
    const marker = ownershipMarker(entry);
    await ensureRealDirectory(path.dirname(marker));
    const payload = JSON.stringify({
        token: entry.ownershipToken,
        sourceKey: entry.sourceKey,
        sourceEntryKey: entry.sourceEntryKey,
        reserved
    });
    const script = String.raw`
import json, os, sys
parent, name, payload, exclusive, nonce = sys.argv[1:]
expected = json.loads(payload)
parent_fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    if exclusive == "1":
        marker_fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent_fd)
        try:
            os.write(marker_fd, payload.encode("utf-8"))
            os.fsync(marker_fd)
        finally:
            os.close(marker_fd)
    else:
        existing_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        try:
            with os.fdopen(existing_fd, "r") as handle:
                existing = json.load(handle)
        finally:
            existing_fd = -1
        for key in ("token", "sourceKey", "sourceEntryKey"):
            if existing.get(key) != expected.get(key):
                sys.exit(44)
        temporary = f".{name}.{nonce}.tmp"
        temp_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent_fd)
        try:
            os.write(temp_fd, payload.encode("utf-8"))
            os.fsync(temp_fd)
        finally:
            os.close(temp_fd)
        try:
            os.replace(temporary, name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
        finally:
            try:
                os.unlink(temporary, dir_fd=parent_fd)
            except FileNotFoundError:
                pass
finally:
    os.close(parent_fd)
`;
    const code = await runProjectionPython(script, [
        path.dirname(marker),
        path.basename(marker),
        payload,
        exclusive ? "1" : "0",
        randomUUID()
    ]);
    if (code !== 0)
        throw new Error(
            `Safe Agent Skill ownership marker write failed (${code})`
        );
}

async function runProjectionPython(
    script: string,
    args: string[]
): Promise<number> {
    if (process.platform !== "darwin" && process.platform !== "linux") {
        throw new Error(
            "Safe Agent Skill copy projection is supported on macOS and Linux only"
        );
    }
    return new Promise<number>((resolve, reject) => {
        const child = spawn("python3", ["-c", script, ...args], {
            stdio: "ignore"
        });
        child.once("error", (error) =>
            reject(
                (error as NodeJS.ErrnoException).code === "ENOENT"
                    ? new Error(
                          "Agent Skill projection requires Python 3 for safe filesystem operations; install `python3` and retry"
                      )
                    : error
            )
        );
        child.once("exit", (value) => resolve(value ?? 1));
    });
}

async function removeOwnershipMarker(
    entry: AgentSkillProjectionEntry
): Promise<boolean> {
    const marker = ownershipMarker(entry);
    const script = String.raw`
import errno, os, sys
parent, name = sys.argv[1], sys.argv[2]
try:
    fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
except FileNotFoundError:
    sys.exit(0)
except OSError:
    sys.exit(44)
try:
    try:
        os.unlink(name, dir_fd=fd)
    except FileNotFoundError:
        pass
finally:
    os.close(fd)
`;
    const code = await runProjectionPython(script, [
        path.dirname(marker),
        path.basename(marker)
    ]);
    // unlinkat via an O_NOFOLLOW directory descriptor cannot be redirected by
    // replacing the sidecar directory between validation and cleanup.
    return code === 0;
}

async function directoryChanged(
    directory: string,
    expected: string
): Promise<boolean> {
    try {
        return (
            (await validateAgentSkillDirectory(directory, "user"))
                .treeDigest !== expected
        );
    } catch {
        return true;
    }
}

async function rawPreservationDigest(directory: string): Promise<string> {
    const hash = createHash("sha256");
    const walk = async (current: string, relative: string): Promise<void> => {
        const names = (await readdir(current)).sort();
        for (const name of names) {
            const child = path.join(current, name);
            const childRelative = relative ? `${relative}/${name}` : name;
            const found = await lstat(child);
            if (found.isDirectory()) {
                hash.update(`d\0${childRelative}\0${found.mode & 0o777}\0`);
                await walk(child, childRelative);
            } else if (found.isSymbolicLink()) {
                hash.update(`l\0${childRelative}\0${await readlink(child)}\0`);
            } else if (found.isFile()) {
                hash.update(`f\0${childRelative}\0${found.mode & 0o777}\0`);
                hash.update(await readFile(child));
                hash.update("\0");
            } else {
                hash.update(`s\0${childRelative}\0${found.mode}\0`);
            }
        }
    };
    await walk(directory, "");
    return hash.digest("hex");
}

async function preserveCopy(
    entry: AgentSkillProjectionEntry,
    recordDraft?: (draft: {
        directory: string;
        treeDigest: string;
    }) => Promise<void>,
    persistIntent?: () => Promise<void>
): Promise<{ directory: string; treeDigest: string }> {
    const drafts = path.join(
        agentSkillDataRoot(),
        "sources",
        entry.sourceKey,
        "drafts",
        "projection"
    );
    await ensureRealDirectory(drafts);
    const destination = managedChildPath(
        drafts,
        `${entry.name}-${entry.ownershipToken}`
    );
    const beforeMove = await rawPreservationDigest(entry.path);
    entry.preservationDraftDir = destination;
    await persistIntent?.();
    await recordDraft?.({ directory: destination, treeDigest: beforeMove });
    try {
        // Moving the live directory makes preservation and deactivation one
        // atomic filesystem operation, and works even for invalid local edits.
        await rename(entry.path, destination);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        const holdingRoot = path.join(
            entry.root,
            ".mgd-agent-skill-preservation"
        );
        await ensureRealDirectory(holdingRoot);
        const holding = managedChildPath(holdingRoot, entry.ownershipToken);
        entry.preservationPath = holding;
        entry.preservationDraftDir = destination;
        await persistIntent?.();
        // Remove the tree from the harness's immediate scan root atomically,
        // then copy from a hidden, durably tracked holding directory.
        await rename(entry.path, holding);
        await cp(holding, destination, {
            recursive: true,
            errorOnExist: true,
            force: false,
            verbatimSymlinks: true
        });
        const copiedDigest = await rawPreservationDigest(destination);
        const heldDigest = await rawPreservationDigest(holding);
        if (copiedDigest !== heldDigest)
            throw new Error(
                `Cross-filesystem Agent Skill draft verification failed; original retained at ${holding}`
            );
        if (copiedDigest !== beforeMove)
            await recordDraft?.({
                directory: destination,
                treeDigest: copiedDigest
            });
        await rm(holding, { recursive: true, force: true });
        delete entry.preservationPath;
        delete entry.preservationDraftDir;
        await persistIntent?.();
        return { directory: destination, treeDigest: copiedDigest };
    }
    const preservedDigest = await rawPreservationDigest(destination);
    if (preservedDigest !== beforeMove)
        await recordDraft?.({
            directory: destination,
            treeDigest: preservedDigest
        });
    delete entry.preservationDraftDir;
    await persistIntent?.();
    return { directory: destination, treeDigest: preservedDigest };
}

async function removeProjectionStaging(
    entry: AgentSkillProjectionEntry
): Promise<void> {
    if (!entry.stagingPath) return;
    if (path.dirname(entry.stagingPath) !== path.resolve(entry.root)) return;
    await assertRealManagedAncestors(entry.root);
    await rm(entry.stagingPath, { recursive: true, force: true });
    delete entry.stagingPath;
}

async function removeOwnedSymlinkTarget(
    entry: AgentSkillProjectionEntry
): Promise<void> {
    if (!entry.symlinkTarget) return;
    const root = path.resolve(agentSkillDataRoot(), "projection-links");
    const target = path.resolve(entry.symlinkTarget);
    if (
        !target.startsWith(`${root}${path.sep}`) ||
        path.basename(target) !== entry.ownershipToken
    )
        return;
    await assertRealManagedAncestors(path.dirname(target));
    await rm(target, { force: true });
    delete entry.symlinkTarget;
}

async function symlinkProjectionMatches(
    entry: AgentSkillProjectionEntry
): Promise<boolean> {
    const expected = entry.symlinkTarget || entry.sourceDir;
    const linked = path.resolve(
        path.dirname(entry.path),
        await readlink(entry.path)
    );
    if (linked !== path.resolve(expected)) return false;
    if (!entry.symlinkTarget) return true;
    try {
        const alias = await lstat(entry.symlinkTarget);
        if (!alias.isSymbolicLink()) return false;
        const target = path.resolve(
            path.dirname(entry.symlinkTarget),
            await readlink(entry.symlinkTarget)
        );
        return target === path.resolve(entry.sourceDir);
    } catch {
        return false;
    }
}

async function updatePreservationDraftState(
    entry: AgentSkillProjectionEntry,
    treeDigest?: string
): Promise<boolean> {
    const draft = entry.preservationDraftDir;
    if (!draft) return false;
    const source = await loadAgentSkillSourceStateByKey(entry.sourceKey);
    const tracked = source.drafts[draft];
    if (treeDigest === undefined) {
        if (tracked) {
            delete source.drafts[draft];
            await saveAgentSkillSourceState(source);
        }
        return true;
    }
    if (!tracked) return false;
    tracked.treeDigest = treeDigest;
    await saveAgentSkillSourceState(source);
    return true;
}

async function recoverPreservation(
    entry: AgentSkillProjectionEntry
): Promise<"none" | "recovered" | "conflict"> {
    if (!entry.preservationDraftDir) return "none";
    const draft = path.resolve(entry.preservationDraftDir);
    if (await pathExists(entry.path)) {
        if (await pathExists(draft)) return "conflict";
        await updatePreservationDraftState(entry);
        delete entry.preservationPath;
        delete entry.preservationDraftDir;
        return "none";
    }
    const draftRoot = path.resolve(
        agentSkillDataRoot(),
        "sources",
        entry.sourceKey,
        "drafts",
        "projection"
    );
    if (draft !== path.join(draftRoot, `${entry.name}-${entry.ownershipToken}`))
        return "conflict";
    if (entry.preservationPath) {
        const holdingRoot = path.resolve(
            entry.root,
            ".mgd-agent-skill-preservation"
        );
        const holding = path.resolve(entry.preservationPath);
        if (
            path.dirname(holding) !== holdingRoot ||
            path.basename(holding) !== entry.ownershipToken
        )
            return "conflict";
        if (await pathExists(holding)) {
            const holdingDigest = await rawPreservationDigest(holding);
            if (await pathExists(draft)) {
                if ((await rawPreservationDigest(draft)) !== holdingDigest)
                    await rm(draft, { recursive: true, force: true });
            }
            if (!(await pathExists(draft))) {
                await cp(holding, draft, {
                    recursive: true,
                    errorOnExist: true,
                    force: false,
                    verbatimSymlinks: true
                });
            }
            if ((await rawPreservationDigest(draft)) !== holdingDigest)
                return "conflict";
            await rm(holding, { recursive: true, force: true });
        } else if (!(await pathExists(draft))) {
            return "conflict";
        }
    } else if (!(await pathExists(draft))) {
        return "conflict";
    }
    const recoveredDigest = await rawPreservationDigest(draft);
    if (!(await updatePreservationDraftState(entry, recoveredDigest)))
        return "conflict";
    delete entry.preservationPath;
    delete entry.preservationDraftDir;
    return "recovered";
}

async function reconcileProjectionEntry(
    entry: AgentSkillProjectionEntry
): Promise<"valid" | "missing" | "conflict"> {
    const preservation = await recoverPreservation(entry);
    if (preservation === "conflict") return "conflict";
    let found;
    try {
        found = await lstat(entry.path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            if (
                (entry.phase === "planned" || preservation === "recovered") &&
                (await ownershipMatches(entry))
            ) {
                await removeProjectionStaging(entry);
                await removeOwnedSymlinkTarget(entry);
                await removeOwnershipMarker(entry);
            } else if (preservation === "recovered") {
                return "conflict";
            }
            return "missing";
        }
        throw error;
    }
    const reserved = await ownershipReservation(entry);
    if (reserved === undefined) return "conflict";
    let valid = false;
    if (found.isSymbolicLink()) {
        valid = await symlinkProjectionMatches(entry);
    } else if (found.isDirectory()) {
        valid = !(await directoryChanged(
            entry.path,
            entry.projectedTreeDigest
        ));
        if (valid) entry.mode = "copy";
    }
    if (valid) {
        if (!reserved) await writeOwnershipMarker(entry, true, false);
        entry.phase = "ready";
        await removeProjectionStaging(entry);
        return "valid";
    }
    if (entry.phase === "planned" && reserved) {
        await rm(entry.path, { recursive: true, force: true });
        await removeProjectionStaging(entry);
        await removeOwnedSymlinkTarget(entry);
        await removeOwnershipMarker(entry);
        return "missing";
    }
    return "conflict";
}

async function removeOwnedProjection(
    entry: AgentSkillProjectionEntry,
    preserveChanges: boolean,
    recordDraft?: (draft: {
        directory: string;
        treeDigest: string;
    }) => Promise<void>,
    persistIntent?: () => Promise<void>
): Promise<{
    action: "removed" | "preserved" | "conflict" | "absent";
    draft?: { directory: string; treeDigest: string };
}> {
    let found;
    try {
        found = await lstat(entry.path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            await removeOwnedSymlinkTarget(entry);
            return (await removeOwnershipMarker(entry))
                ? { action: "absent" }
                : { action: "conflict" };
        }
        throw error;
    }
    if ((await ownershipReservation(entry)) !== true)
        return { action: "conflict" };
    if (entry.mode === "symlink") {
        if (!found.isSymbolicLink()) return { action: "conflict" };
        if (!(await symlinkProjectionMatches(entry)))
            return { action: "conflict" };
        await rm(entry.path, { force: true });
        await removeOwnedSymlinkTarget(entry);
        await removeOwnershipMarker(entry);
        return { action: "removed" };
    }
    if (found.isSymbolicLink() || !found.isDirectory())
        return { action: "conflict" };
    if (
        preserveChanges &&
        (await directoryChanged(entry.path, entry.projectedTreeDigest))
    ) {
        const draft = await preserveCopy(entry, recordDraft, persistIntent);
        await rm(entry.path, { recursive: true, force: true });
        await removeOwnershipMarker(entry);
        return { action: "preserved", draft };
    }
    await rm(entry.path, { recursive: true, force: true });
    await removeOwnershipMarker(entry);
    return { action: "removed" };
}

async function moveDirectoryNoClobber(
    source: string,
    destination: string
): Promise<void> {
    const script = String.raw`
import ctypes, errno, os, sys
src, dst = os.fsencode(sys.argv[1]), os.fsencode(sys.argv[2])
libc = ctypes.CDLL(None, use_errno=True)
if sys.platform == "darwin":
    result = libc.renamex_np(src, dst, 4)  # RENAME_EXCL
elif sys.platform.startswith("linux"):
    result = libc.renameat2(-100, src, -100, dst, 1)  # RENAME_NOREPLACE
else:
    sys.exit(95)
if result != 0:
    value = ctypes.get_errno()
    if value in (errno.EEXIST, errno.ENOTEMPTY):
        sys.exit(17)
    raise OSError(value, os.strerror(value))
`;
    // Python ctypes exposes the platform's exclusive rename syscall, which
    // Node's fs API does not currently provide for directories.
    const code = await runProjectionPython(script, [source, destination]);
    if (code === 17) {
        const error = new Error(
            `Agent Skill projection destination already exists: ${destination}`
        ) as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
    }
    if (code !== 0) throw new Error(`Atomic projection move failed (${code})`);
}

export async function createAgentSkillProjection(
    destination: string,
    sourceDir: string,
    preferredMode: "symlink" | "copy",
    createLink: typeof symlink = symlink,
    onDestinationCreated?: () => Promise<void>,
    expectedDigest?: string,
    stagingPath?: string,
    symlinkSourceDir?: string
): Promise<"symlink" | "copy"> {
    const temporary =
        stagingPath || `${destination}.mgd-${process.pid}-${randomUUID()}`;
    if (preferredMode === "symlink") {
        await writeFile(temporary, "symlink-attempt\n", {
            encoding: "utf8",
            mode: 0o600,
            flag: "wx"
        });
        try {
            // Direct creation is an atomic no-clobber operation: EEXIST never
            // replaces an unmanaged path that appeared after preflight.
            await createLink(
                path.relative(
                    path.dirname(destination),
                    symlinkSourceDir || sourceDir
                ),
                destination,
                "dir"
            );
            await onDestinationCreated?.();
            await rm(temporary, { force: true });
            if (
                expectedDigest &&
                (await directoryChanged(sourceDir, expectedDigest))
            )
                throw new Error(
                    "Projected Agent Skill changed during link creation"
                );
            return "symlink";
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (
                !["EPERM", "EACCES", "EOPNOTSUPP", "ENOSYS", "EINVAL"].includes(
                    code || ""
                )
            ) {
                await rm(temporary, { force: true });
                throw error;
            }
            await rm(temporary, { force: true });
        }
    }
    try {
        await cp(sourceDir, temporary, {
            recursive: true,
            errorOnExist: true,
            force: false
        });
        const staged = await validateAgentSkillDirectory(temporary, "user");
        if (expectedDigest && staged.treeDigest !== expectedDigest)
            throw new Error(
                "Agent Skill source changed during projection staging"
            );
        await moveDirectoryNoClobber(temporary, destination);
        await onDestinationCreated?.();
        const projected = await validateAgentSkillDirectory(
            destination,
            "user"
        );
        if (projected.treeDigest !== (expectedDigest || staged.treeDigest))
            throw new Error("Agent Skill projection copy failed verification");
        return "copy";
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

export async function activateAgentSkillSource(
    identity: AgentSkillSourceIdentity | undefined,
    profileName: string,
    opts: {
        alreadyLocked?: boolean;
        env?: NodeJS.ProcessEnv;
        forceRefresh?: boolean;
    } = {}
): Promise<AgentSkillActivationResult> {
    const run = async (): Promise<AgentSkillActivationResult> => {
        const env = opts.env || process.env;
        const projection = await loadAgentSkillProjectionState(env);
        const source = identity
            ? await loadAgentSkillSourceState(identity, env)
            : undefined;
        const targets = resolveAgentSkillProjectionTargets({ env });
        if (targets.length)
            await runProjectionPython("import sys; sys.exit(0)", []);
        const desired = new Map<
            string,
            {
                root: string;
                mode: "symlink" | "copy";
                name: string;
                sourceKey: string;
                sourceEntryKey: string;
                sourceDir: string;
                digest: string;
                isPrimary: boolean;
            }
        >();
        if (source && targets.length) {
            const names = new Set<string>();
            const primaryRoot = path.join(
                agentSkillDataRoot(env),
                "projection-content",
                identity!.key
            );
            for (const [entryKey, entry] of Object.entries(source.entries)) {
                if (names.has(entry.name)) {
                    throw new Error(
                        `Agent Skill name collision in cached profile: ${entry.name}`
                    );
                }
                names.add(entry.name);
                const primaryProjection = managedChildPath(
                    primaryRoot,
                    entry.name
                );
                desired.set(projectionKey(primaryRoot, entry.name), {
                    root: primaryRoot,
                    mode: "copy",
                    name: entry.name,
                    sourceKey: identity!.key,
                    sourceEntryKey: entryKey,
                    sourceDir: entry.libraryDir,
                    digest: entry.installedTreeDigest,
                    isPrimary: true
                });
                for (const target of targets) {
                    desired.set(projectionKey(target.root, entry.name), {
                        root: target.root,
                        mode: target.mode,
                        name: entry.name,
                        sourceKey: identity!.key,
                        sourceEntryKey: entryKey,
                        // Harness links point only to the separately owned real
                        // projection, never to the authoritative source cache.
                        sourceDir: primaryProjection,
                        digest: entry.installedTreeDigest,
                        isPrimary: false
                    });
                }
            }
        }

        const blockedPrimaryEntries = new Set<string>();
        const result: AgentSkillActivationResult = {
            activated: 0,
            deactivated: 0,
            preservedDrafts: 0,
            conflicts: []
        };
        const recordProjectionDraft = (
            entry: AgentSkillProjectionEntry
        ) => async (draft: { directory: string; treeDigest: string }) => {
            const originalSource = await loadAgentSkillSourceStateByKey(
                entry.sourceKey,
                env
            );
            const cached = originalSource.entries[entry.sourceEntryKey];
            originalSource.drafts[draft.directory] = {
                type: cached?.ref.type || "user",
                name: entry.name,
                ref: cached?.ref,
                baseChecksum: cached?.remoteChecksum,
                treeDigest: draft.treeDigest
            };
            await saveAgentSkillSourceState(originalSource, env);
        };
        for (const [key, entry] of Object.entries(projection.entries)) {
            const wanted = desired.get(key);
            if (
                wanted &&
                !wanted.isPrimary &&
                blockedPrimaryEntries.has(wanted.sourceEntryKey)
            ) {
                const action = await removeOwnedProjection(
                    entry,
                    true,
                    recordProjectionDraft(entry),
                    () => saveAgentSkillProjectionState(projection, env)
                );
                if (action.action === "conflict")
                    result.conflicts.push(entry.path);
                else {
                    if (action.action === "preserved")
                        result.preservedDrafts += 1;
                    delete projection.entries[key];
                    result.deactivated += 1;
                    await saveAgentSkillProjectionState(projection, env);
                }
                desired.delete(key);
                continue;
            }
            if (
                wanted &&
                entry.sourceKey === wanted.sourceKey &&
                entry.sourceEntryKey === wanted.sourceEntryKey &&
                entry.sourceDir === wanted.sourceDir &&
                entry.projectedTreeDigest === wanted.digest &&
                !opts.forceRefresh
            ) {
                const recovered = await reconcileProjectionEntry(entry);
                if (recovered === "missing") continue;
                if (recovered === "conflict") {
                    result.conflicts.push(entry.path);
                    if (wanted.isPrimary)
                        blockedPrimaryEntries.add(wanted.sourceEntryKey);
                } else if (
                    entry.mode === "copy" &&
                    (await directoryChanged(
                        entry.path,
                        entry.projectedTreeDigest
                    ))
                ) {
                    result.conflicts.push(entry.path);
                    if (wanted.isPrimary)
                        blockedPrimaryEntries.add(wanted.sourceEntryKey);
                }
                await saveAgentSkillProjectionState(projection, env);
                desired.delete(key);
                continue;
            }
            const action = await removeOwnedProjection(
                entry,
                true,
                recordProjectionDraft(entry),
                () => saveAgentSkillProjectionState(projection, env)
            );
            if (action.action === "conflict") {
                result.conflicts.push(entry.path);
                if (wanted?.isPrimary)
                    blockedPrimaryEntries.add(wanted.sourceEntryKey);
                continue;
            }
            if (action.action === "preserved") {
                result.preservedDrafts += 1;
            }
            delete projection.entries[key];
            result.deactivated += 1;
            await saveAgentSkillProjectionState(projection, env);
        }

        for (const [key, item] of desired) {
            const destination = managedChildPath(item.root, item.name);
            if (
                !item.isPrimary &&
                blockedPrimaryEntries.has(item.sourceEntryKey)
            ) {
                result.conflicts.push(destination);
                continue;
            }
            let destinationOwned = false;
            let markerOwned = false;
            try {
                await ensureRealDirectory(item.root);
                if (await pathExists(destination)) {
                    result.conflicts.push(destination);
                    if (item.isPrimary)
                        blockedPrimaryEntries.add(item.sourceEntryKey);
                    continue;
                }
                // The source is either the canonical validated cache (internal
                // primary) or that primary real projection (harness target).
                const inspected = await validateAgentSkillDirectory(
                    item.sourceDir,
                    "user"
                );
                if (inspected.treeDigest !== item.digest) {
                    throw new Error(
                        `Agent Skill projection source was modified: ${item.sourceDir}`
                    );
                }
                const ownershipToken = randomUUID();
                const symlinkTarget =
                    item.mode === "symlink"
                        ? path.join(
                              agentSkillDataRoot(env),
                              "projection-links",
                              ownershipToken
                          )
                        : undefined;
                projection.entries[key] = {
                    root: path.resolve(item.root),
                    name: item.name,
                    path: destination,
                    mode: item.mode,
                    sourceKey: item.sourceKey,
                    sourceEntryKey: item.sourceEntryKey,
                    sourceDir: item.sourceDir,
                    projectedTreeDigest: item.digest,
                    ownershipToken,
                    phase: "planned",
                    stagingPath: `${destination}.mgd-stage-${ownershipToken}`,
                    symlinkTarget
                };
                // Persist intent first. If the process exits after filesystem
                // creation, the next activation can verify and adopt only this
                // exact planned path/source/digest rather than an arbitrary orphan.
                await saveAgentSkillProjectionState(projection, env);
                await writeOwnershipMarker(projection.entries[key]);
                markerOwned = true;
                if (symlinkTarget) {
                    await ensureRealDirectory(path.dirname(symlinkTarget));
                    await symlink(
                        path.relative(
                            path.dirname(symlinkTarget),
                            item.sourceDir
                        ),
                        symlinkTarget,
                        "dir"
                    );
                }
                projection.entries[key].mode = await createAgentSkillProjection(
                    destination,
                    item.sourceDir,
                    item.mode,
                    symlink,
                    async () => {
                        destinationOwned = true;
                        await writeOwnershipMarker(
                            projection.entries[key],
                            true,
                            false
                        );
                    },
                    item.digest,
                    projection.entries[key].stagingPath,
                    symlinkTarget
                );
                if (projection.entries[key].mode === "copy")
                    await removeOwnedSymlinkTarget(projection.entries[key]);
                projection.entries[key].phase = "ready";
                delete projection.entries[key].stagingPath;
                result.activated += 1;
                await saveAgentSkillProjectionState(projection, env);
            } catch (error) {
                const planned = projection.entries[key];
                if (planned) {
                    if (destinationOwned)
                        await rm(destination, { recursive: true, force: true });
                    await removeOwnedSymlinkTarget(planned);
                    if (markerOwned) await removeOwnershipMarker(planned);
                }
                delete projection.entries[key];
                await saveAgentSkillProjectionState(projection, env);
                result.conflicts.push(destination);
                if (item.isPrimary)
                    blockedPrimaryEntries.add(item.sourceEntryKey);
            }
        }
        projection.activeSourceKey = identity?.key;
        projection.activeProfile = identity ? profileName : undefined;
        await saveAgentSkillProjectionState(projection, env);
        return result;
    };
    return opts.alreadyLocked ? run() : withAgentSkillStateLock(run);
}

/** Restore a modified canonical cache from its immutable validated source ZIP. */
export async function restoreCachedAgentSkill(entry: {
    archiveFile: string;
    libraryDir: string;
    name: string;
    remoteChecksum: string;
    ref: { type: "system" | "user"; id: string };
}): Promise<string> {
    const bytes = await readFile(entry.archiveFile);
    const validated = await validateAgentSkillArchive(bytes, entry.ref.type);
    if (
        validated.archiveSha256 !== entry.remoteChecksum ||
        validated.name !== entry.name
    ) {
        throw new Error(
            "Cached Agent Skill archive does not match publication"
        );
    }
    const restored = await extractAgentSkillArchive(
        bytes,
        entry.ref.type,
        entry.libraryDir
    );
    return restored.treeDigest;
}
