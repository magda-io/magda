import path from "node:path";
import { lstat, mkdir, stat, writeFile } from "node:fs/promises";
import { Command, Option } from "commander";
import { clientFor, clientFromProfile } from "../client.js";
import { AgentSkillClient } from "../agentSkillClient.js";
import {
    AgentSkillListType,
    AgentSkillType,
    parseAgentSkillRef
} from "../agentSkillTypes.js";
import {
    AGENT_SKILL_INSTALL_MARKER,
    createAgentSkillArchive,
    createAgentSkillArchiveFromInstallation,
    extractAgentSkillArchive,
    validateAgentSkillArchive,
    validateAgentSkillDirectory,
    validateAgentSkillNameForType
} from "../agentSkillArchive.js";
import { assertRealManagedAncestors } from "../agentSkillState.js";
import {
    cacheAcknowledgedPublication,
    cacheForkedPublication,
    cachedDesired,
    clientForSourceAccount,
    reconcileResult,
    syncLocalAgentSkills,
    syncWorkspaceAgentSkills,
    withAgentSkillOperationLock
} from "../agentSkillSync.js";
import {
    readInstallMarker,
    reconcileAgentSkillInstallations,
    writeInstallMarker
} from "../agentSkillReconcile.js";
import type { AgentSkillInstallMarker } from "../agentSkillLocalState.js";
import {
    canonicalMagdaBaseUrl,
    createAgentSkillSourceIdentity,
    findAgentSkillWorkingDirectory,
    loadAgentSkillSourceState,
    saveAgentSkillSourceState,
    sourceStateKey,
    verifiedMarkerSource
} from "../agentSkillLocalState.js";
import { resolveAgentSkillTargets } from "../skills.js";
import {
    loadConfig,
    noProfileError,
    resolveProfileSelection,
    saveConfig
} from "../profile.js";
import { MgdApiError, UsageError } from "../errors.js";
import { note, printData, resolveMode } from "../output.js";
import { printAgentSkillSyncResult } from "./agentSkillOutput.js";

const typeOption = (includeAll = false) =>
    new Option("--type <type>", "published Agent Skill type")
        .choices(includeAll ? ["all", "system", "user"] : ["system", "user"])
        .default(includeAll ? "all" : "user");

function rejectScope(command: Command): void {
    if (command.args.includes("--scope") || process.argv.includes("--scope")) {
        throw new UsageError(
            "--scope was replaced by --type; use --type system|user|all"
        );
    }
}

async function api(): Promise<AgentSkillClient> {
    return new AgentSkillClient(await clientFromProfile());
}

async function verifiedLocalSource(
    client: AgentSkillClient,
    captured?: {
        selection: ReturnType<typeof resolveProfileSelection>;
        expectedStoredProfile?: ReturnType<
            typeof resolveProfileSelection
        >["profile"];
    }
) {
    const manifest = await client.localManifest();
    const identity = createAgentSkillSourceIdentity({
        baseUrl: client.baseUrl,
        tenantId: manifest.identity.tenantId,
        userId: manifest.identity.userId
    });
    const cfg = await loadConfig();
    const selection = captured?.selection || resolveProfileSelection(cfg);
    const profile = cfg.profiles[selection.name];
    if (captured?.expectedStoredProfile) {
        const credentials = (value: typeof profile) =>
            value
                ? {
                      baseUrl: value.baseUrl,
                      apiKeyId: value.apiKeyId,
                      apiKey: value.apiKey
                  }
                : undefined;
        if (
            JSON.stringify(credentials(profile)) !==
            JSON.stringify(credentials(captured.expectedStoredProfile))
        ) {
            throw new UsageError(
                "Profile credentials changed while the Agent Skill operation was running; retry"
            );
        }
    }
    if (
        profile &&
        selection.mayPersistAgentSkillIdentity &&
        canonicalMagdaBaseUrl(profile.baseUrl) === identity.canonicalBaseUrl
    ) {
        profile.agentSkillSource = {
            ...identity,
            verifiedAt: new Date().toISOString()
        };
        await saveConfig(cfg);
    }
    return {
        identity,
        state: await loadAgentSkillSourceState(identity),
        selection
    };
}

const WORKSPACE_RUNTIME_MARKER = "/etc/magda-agent/workspace-runtime";

async function isTrustedWorkspaceRuntime(): Promise<boolean> {
    try {
        const marker = await lstat(WORKSPACE_RUNTIME_MARKER);
        return (
            marker.isFile() && marker.uid === 0 && (marker.mode & 0o022) === 0
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

interface RecognizedInstallation {
    path: string;
    marker: AgentSkillInstallMarker;
}

/**
 * Recognize an installed copy from its own marker: a real directory with real
 * ancestors and a regular, valid `.magda-skill-install.json` naming a source
 * account verified on this computer. Only then may the marker be excluded
 * from validation and publication.
 */
async function recognizeInstallation(
    directory: string
): Promise<RecognizedInstallation | undefined> {
    const absolute = path.resolve(directory);
    const markerPath = path.join(absolute, AGENT_SKILL_INSTALL_MARKER);
    const markerStat = await lstat(markerPath).catch(() => undefined);
    if (!markerStat) return undefined;
    await assertRealManagedAncestors(absolute);
    const directoryStat = await lstat(absolute);
    const marker =
        !directoryStat.isSymbolicLink() &&
        directoryStat.isDirectory() &&
        !markerStat.isSymbolicLink() &&
        markerStat.isFile()
            ? await readInstallMarker(absolute)
            : undefined;
    if (!marker || !(await verifiedMarkerSource(marker)))
        throw new UsageError(
            `${absolute} contains ${AGENT_SKILL_INSTALL_MARKER} but it is not valid installation metadata for a verified account. Run \`mgd agent-skill sync\` to repair it, or remove that file from your copy.`
        );
    return { path: absolute, marker };
}

async function publishInstallation(
    installation: RecognizedInstallation,
    opts: { type: AgentSkillType; force?: boolean; json?: boolean }
): Promise<void> {
    const { marker } = installation;
    const ref = { type: marker.source.type, id: marker.source.id };
    if (marker.source.kind === "installation") {
        if (!opts.force)
            throw new UsageError(
                `This is your installed copy of ${ref.id}, a skill shared with you by another user. Publishing it creates your own user skill named "${marker.name}" from this copy (a fork): your installation of the shared skill is removed and replaced by your publication, and the original publisher's skill is never changed. If that is what you want, rerun with \`mgd agent-skill publish ${installation.path} --force\`.`,
                "SHARED_INSTALLATION_FORK_REQUIRED"
            );
        await forkInstallation(installation, opts);
        return;
    }
    if (marker.source.kind !== "own-user-publication")
        throw new UsageError(
            `This is an installed copy of ${ref.type}/${ref.id}. Installed system skills are not published from their installation; use \`mgd agent-skill pull ${ref.type}/${ref.id}\` and publish that working directory with --type system.`
        );
    if (opts.type !== "user")
        throw new UsageError(
            "This installed copy is your own user publication; publish it with --type user"
        );
    const candidate = await createAgentSkillArchiveFromInstallation(
        installation.path,
        "user"
    );
    if (candidate.name !== marker.name)
        throw new UsageError(
            `SKILL.md name "${candidate.name}" no longer matches the installed publication "${marker.name}". Copy the directory elsewhere (without ${AGENT_SKILL_INSTALL_MARKER}) to publish it as a new skill.`
        );
    // The recorded source account, not the active profile, is the target.
    const source = await clientForSourceAccount(marker.sourceKey);
    let metadata;
    try {
        const expected = opts.force
            ? (await source.client.show(ref)).checksum
            : marker.baselineChecksum;
        metadata = await source.client
            .replace(ref, candidate.bytes, expected)
            .catch((error) => {
                throw withWriteTarget(error, {
                    operation: "replace",
                    type: ref.type,
                    id: ref.id,
                    name: candidate.name,
                    checksum: candidate.checksum
                });
            });
    } catch (error) {
        if (error instanceof MgdApiError && error.status === 404)
            throw new UsageError(
                `The publication ${ref.type}/${ref.id} no longer exists remotely; it was not recreated. To publish this content as a new skill, copy the directory elsewhere without ${AGENT_SKILL_INSTALL_MARKER} and run \`mgd agent-skill publish <copy>\`.`
            );
        if (error instanceof MgdApiError && error.status === 412)
            throw new UsageError(
                "The publication changed remotely since this copy was installed. Run `mgd agent-skill sync` to review, or rerun with --force to overwrite your newer publication."
            );
        throw error;
    }
    // The server accepted the content. Local bookkeeping failures below must
    // not make a successful publication appear to have failed.
    const local = await recordAcknowledgedPublication(
        source.state,
        metadata,
        candidate
    );
    let baselineUpdated = false;
    if (local.cache === "updated")
        try {
            await writeInstallMarker(installation.path, {
                ...marker,
                baselineChecksum: metadata.checksum,
                baselineTreeDigest: candidate.treeDigest
            });
            baselineUpdated = true;
        } catch (error) {
            local.error = local.error || (error as Error).message;
        }
    if (opts.json) {
        printData("json", {
            ...metadata,
            localCache: local.cache,
            installation: {
                path: installation.path,
                sourceProfile: source.profileName,
                baselineUpdated
            }
        });
        return;
    }
    note(
        `Published ${metadata.type}/${metadata.id} from ${installation.path} using profile "${source.profileName}" (the account that installed it).`
    );
    if (local.cache !== "updated" || !baselineUpdated)
        note(
            `The remote publication succeeded, but local bookkeeping failed (${local.error}). Do not publish it again as a new skill; run \`mgd agent-skill sync\` with that profile to repair the local copy and cache.`
        );
    note(
        "Other harness copies were not changed. Run `mgd agent-skill sync` to update them."
    );
}

/**
 * `publish --force` of an installed shared copy: publish it as the recipient's
 * own user skill in the installation's place (#3861). `--force` is the
 * explicit consent; there is no second prompt. The recipient account recorded
 * in the marker is authenticated (never the active profile by default), and
 * the publisher's original is never written. Edited local files are kept on
 * every failure.
 */
async function forkInstallation(
    installation: RecognizedInstallation,
    opts: { type: AgentSkillType; json?: boolean }
): Promise<void> {
    const { marker } = installation;
    const installationRecordId = marker.installationRecordId!;
    if (opts.type !== "user")
        throw new UsageError(
            "An installed shared skill can only be published as your own user skill (--type user)"
        );
    const candidate = await createAgentSkillArchiveFromInstallation(
        installation.path,
        "user"
    );
    if (candidate.name !== marker.name)
        throw new UsageError(
            `SKILL.md name "${candidate.name}" no longer matches the installed name "${marker.name}". Copy the directory elsewhere (without ${AGENT_SKILL_INSTALL_MARKER}) to publish it under a new name.`
        );
    const source = await clientForSourceAccount(marker.sourceKey);
    if (
        installationRecordId !==
        `agent-skill-${source.identity.userId}-${marker.name}`
    )
        throw new UsageError(
            "This installed copy's metadata does not belong to its recorded account; mgd will not publish it."
        );
    let result;
    try {
        result = await source.client
            .publishInstallation(installationRecordId, candidate.bytes)
            .catch((error) => {
                throw withWriteTarget(error, {
                    operation: "create",
                    type: "user",
                    id: installationRecordId,
                    name: candidate.name,
                    checksum: candidate.checksum
                });
            });
    } catch (error) {
        if (
            error instanceof MgdApiError &&
            error.code === "AGENT_SKILL_FORK_INCOMPLETE"
        )
            throw new UsageError(
                `Your installation of the shared skill was removed, but your own publication was not created yet (${error.message}). Your local files were not changed. Rerun \`mgd agent-skill publish ${installation.path} --force\` to finish.`
            );
        throw error;
    }
    const { publication: metadata } = result;
    if (
        metadata.checksum !== candidate.checksum ||
        metadata.userId !== source.identity.userId
    )
        throw new Error(
            "The server acknowledged a different publication than was sent; run `mgd agent-skill sync` and review before retrying"
        );
    // The server accepted the fork. Local bookkeeping failures below must not
    // make it appear to have failed.
    let cacheError: string | undefined;
    try {
        await cacheForkedPublication(
            source.state,
            installationRecordId,
            metadata,
            candidate
        );
    } catch (error) {
        cacheError = (error as Error).message;
    }
    let rebound = false;
    if (!cacheError)
        try {
            const {
                installationRecordId: _installation,
                alias: _alias,
                ...rest
            } = marker;
            await writeInstallMarker(installation.path, {
                ...rest,
                source: {
                    type: "user",
                    id: metadata.id,
                    kind: "own-user-publication"
                },
                baselineChecksum: metadata.checksum,
                baselineTreeDigest: candidate.treeDigest
            });
            rebound = true;
        } catch (error) {
            cacheError = (error as Error).message;
        }
    if (opts.json) {
        printData("json", {
            ...metadata,
            forkedFrom: { source: marker.source.id, installationRecordId },
            installationRemoved: result.installationRemoved,
            localCache: cacheError ? "failed" : "updated",
            installation: {
                path: installation.path,
                sourceProfile: source.profileName,
                rebound
            }
        });
        return;
    }
    note(
        `Published your own user skill ${metadata.type}/${metadata.id} from ${installation.path} using profile "${source.profileName}" (the account that installed it). Your installation of ${marker.source.id} was replaced; the original publisher's skill was not changed.`
    );
    if (cacheError)
        note(
            `The remote publication succeeded, but local bookkeeping failed (${cacheError}). Do not publish it again; run \`mgd agent-skill sync\` with that profile to repair the local copy and cache.`
        );
    note(
        "Other harness copies were not changed. Run `mgd agent-skill sync` to update them to your publication."
    );
}

/**
 * After server acknowledgement, cache the exact published ZIP in the account's
 * verified cache. Failures are reported, never turned into publish failures.
 */
async function recordAcknowledgedPublication(
    state: Parameters<typeof cacheAcknowledgedPublication>[0],
    metadata: Parameters<typeof cacheAcknowledgedPublication>[1],
    archive: Parameters<typeof cacheAcknowledgedPublication>[2]
): Promise<{ cache: "updated" | "failed"; error?: string }> {
    try {
        await cacheAcknowledgedPublication(state, metadata, archive);
        return { cache: "updated" };
    } catch (error) {
        return { cache: "failed", error: (error as Error).message };
    }
}

/** The deterministic ID Agent Services assigns to a new publication. */
function expectedPublicationId(
    type: AgentSkillType,
    name: string,
    userId: string
): string {
    return type === "system"
        ? `agent-skill-${name}`
        : `agent-skill-${userId}-${name}`;
}

/**
 * Name the publication a write targeted when its outcome is unknown, so it
 * can be verified later (type, ID and expected archive checksum) instead of
 * being resent.
 */
function withWriteTarget(
    error: unknown,
    target: {
        operation: "create" | "replace" | "delete";
        type: AgentSkillType;
        id: string;
        name?: string;
        checksum: string;
    }
): unknown {
    return error instanceof MgdApiError && error.outcome === "unknown"
        ? error.withDetails({ target })
        : error;
}

function pageLimit(value: string): number {
    const limit = Number(value);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new UsageError("--limit must be an integer from 1 to 100");
    return limit;
}

/** A shared user publication: `user/<id>` or a bare publication ID. */
function sharedRef(value: string) {
    const ref = value.includes("/")
        ? parseAgentSkillRef(value)
        : { type: "user" as const, id: value };
    if (ref.type !== "user")
        throw new UsageError(
            "Only user skills shared with you can be installed; system skills reach Agent Workspaces through their access settings"
        );
    return ref;
}

/** Resolve an installed name (or installation ID) of the current account. */
async function installationIdFor(
    client: AgentSkillClient,
    value: string
): Promise<string> {
    if (value.startsWith("agent-skill-")) return value;
    let pageToken: string | undefined;
    do {
        const page = await client.installations({ limit: 100, pageToken });
        const found = page.items.find(
            (item) => "effectiveName" in item && item.effectiveName === value
        );
        if (found) return found.id;
        pageToken = page.hasMore ? page.nextPageToken : undefined;
    } while (pageToken);
    throw new UsageError(
        `No installed shared skill is named "${value}". List them with \`mgd agent-skill installations\`.`
    );
}

export function registerAgentSkillCommands(program: Command): void {
    const root = program
        .command("agent-skill")
        .description("Create, publish, inspect, and synchronize Agent Skills")
        .allowUnknownOption(false);

    root.command("list")
        .addOption(typeOption(true))
        .option(
            "--shared",
            "other users' published skills shared with you (not installed until `install`)"
        )
        .option("--limit <number>", "page size", "20")
        .option("--page-token <token>")
        .option("--query <text>")
        .option("--json")
        .option("--jsonl")
        .action(async (opts, command) => {
            rejectScope(command);
            const limit = pageLimit(opts.limit);
            if (opts.shared && opts.type === "system")
                throw new UsageError(
                    "--shared lists user skills shared with you; it cannot be combined with --type system"
                );
            const client = await api();
            const query = { limit, pageToken: opts.pageToken, q: opts.query };
            const page = opts.shared
                ? await client.listShared(query)
                : await client.list({ ...query, type: opts.type });
            const mode = resolveMode(opts);
            if (mode === "human") {
                for (const item of page.items)
                    process.stdout.write(
                        `${item.type}/${item.id}\t${item.name}\t${item.description}\n`
                    );
                if (page.nextPageToken)
                    note(`Next page token: ${page.nextPageToken}`);
            } else printData(mode, page, page.items);
        });

    root.command("show <ref>")
        .option("--json")
        .action(async (value: string) => {
            printData(
                "json",
                await (await api()).show(parseAgentSkillRef(value))
            );
        });

    root.command("init <name>")
        .addOption(typeOption())
        .option("-o, --output <directory>")
        .option("--description <text>", "skill description")
        .option("--json")
        .action(async (name: string, opts) => {
            const type = opts.type as AgentSkillType;
            validateAgentSkillNameForType(name, type);
            const directory = path.resolve(opts.output || name);
            try {
                await stat(directory);
                throw new UsageError(
                    `Destination already exists: ${directory}`
                );
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                    throw error;
            }
            await mkdir(directory, { recursive: false });
            const description = opts.description || `Instructions for ${name}`;
            await writeFile(
                path.join(directory, "SKILL.md"),
                `---\nname: ${name}\ndescription: ${JSON.stringify(
                    description
                )}\n---\n\n# ${name}\n\nAdd skill instructions here.\n`,
                "utf8"
            );
            const result = { type, name, directory, published: false };
            if (opts.json) printData("json", result);
            else
                note(
                    `Created local Agent Skill working directory at ${directory}. It has not been published.`
                );
        });

    root.command("validate <local-dir>")
        .addOption(typeOption())
        .option("--json")
        .action(async (directory: string, opts) => {
            const installation = await recognizeInstallation(directory);
            const result = installation
                ? await createAgentSkillArchiveFromInstallation(
                      installation.path,
                      opts.type
                  ).then(({ bytes, ...rest }) => rest)
                : await validateAgentSkillDirectory(
                      path.resolve(directory),
                      opts.type
                  );
            if (opts.json) printData("json", result);
            else
                note(
                    `Valid ${opts.type} Agent Skill "${result.name}" (tree ${result.treeDigest}).`
                );
        });

    root.command("publish <local-dir>")
        .addOption(typeOption())
        .option(
            "--force",
            "overwrite your own publication even if it changed remotely; for an installed shared skill, publish it as your own skill in place of the installation"
        )
        .option("--json")
        .action(async (directory: string, opts) => {
            await withAgentSkillOperationLock(async () => {
                const absolute = path.resolve(directory);
                const installation = await recognizeInstallation(absolute);
                if (installation) {
                    await publishInstallation(installation, opts);
                    return;
                }
                const tracked = await findAgentSkillWorkingDirectory(absolute);
                if (tracked && tracked.directory.type !== opts.type) {
                    throw new UsageError(
                        `Tracked ${tracked.directory.type} publication requires explicit --type ${tracked.directory.type}`
                    );
                }
                const candidate = await createAgentSkillArchive(
                    absolute,
                    opts.type
                );
                const trackedRef =
                    tracked?.directory.ref && tracked.directory.baseChecksum
                        ? tracked.directory
                        : undefined;
                if (!trackedRef && opts.force) {
                    throw new UsageError(
                        "--force can only be used for a tracked publication"
                    );
                }
                // A pulled/published working directory goes back to the
                // account it came from; only a new skill uses the active one.
                const source = tracked
                    ? await clientForSourceAccount(tracked.sourceKey)
                    : await (async () => {
                          const client = await api();
                          const local = await verifiedLocalSource(client);
                          return { client, state: local.state };
                      })();
                const { client, state } = source;
                let metadata;
                if (trackedRef) {
                    let expected = trackedRef.baseChecksum!;
                    if (opts.force)
                        expected = (await client.show(trackedRef.ref!))
                            .checksum;
                    metadata = await client
                        .replace(trackedRef.ref!, candidate.bytes, expected)
                        .catch((error) => {
                            throw withWriteTarget(error, {
                                operation: "replace",
                                type: trackedRef.ref!.type,
                                id: trackedRef.ref!.id,
                                name: candidate.name,
                                checksum: candidate.checksum
                            });
                        });
                } else {
                    metadata = await client
                        .create(opts.type, candidate.bytes)
                        .catch((error) => {
                            throw withWriteTarget(error, {
                                operation: "create",
                                type: opts.type,
                                id: expectedPublicationId(
                                    opts.type,
                                    candidate.name,
                                    state.identity.userId
                                ),
                                name: candidate.name,
                                checksum: candidate.checksum
                            });
                        });
                }
                const local = await recordAcknowledgedPublication(
                    state,
                    metadata,
                    candidate
                );
                try {
                    state.workingDirectories[absolute] = {
                        type: metadata.type,
                        name: metadata.name,
                        ref: { type: metadata.type, id: metadata.id },
                        baseChecksum: metadata.checksum,
                        treeDigest: candidate.treeDigest
                    };
                    await saveAgentSkillSourceState(state);
                } catch (error) {
                    local.cache = "failed";
                    local.error = local.error || (error as Error).message;
                }
                if (opts.json)
                    printData("json", { ...metadata, localCache: local.cache });
                else {
                    note(`Published ${metadata.type}/${metadata.id}.`);
                    if (local.cache !== "updated")
                        note(
                            `The remote publication succeeded, but local bookkeeping failed (${local.error}). Do not publish it again as a new skill; a later \`mgd agent-skill sync\` downloads it normally.`
                        );
                    note(
                        "Run `mgd agent-skill sync` to install or update it in your coding-agent harnesses."
                    );
                }
            });
        });

    root.command("pull <ref>")
        .option("-o, --output <directory>")
        .option("--json")
        .action(async (value: string, opts) => {
            const ref = parseAgentSkillRef(value);
            const initialConfig = await loadConfig();
            const selection = resolveProfileSelection(initialConfig);
            if (!selection.profile) throw noProfileError(initialConfig);
            const expectedStoredProfile = !selection.oneOffOverride
                ? { ...selection.profile }
                : undefined;
            const client = new AgentSkillClient(clientFor(selection.profile));
            const downloaded = await client.download(ref);
            const destination = path.resolve(
                opts.output || downloaded.metadata.name
            );
            const validated = await validateAgentSkillArchive(
                downloaded.bytes,
                ref.type
            );
            if (
                validated.checksum !== downloaded.metadata.checksum ||
                validated.name !== downloaded.metadata.name ||
                validated.description !== downloaded.metadata.description
            ) {
                throw new Error(
                    "Downloaded archive does not match Agent Skill metadata"
                );
            }
            await withAgentSkillOperationLock(async () => {
                if (
                    await stat(destination).then(
                        () => true,
                        (error) => {
                            if (
                                (error as NodeJS.ErrnoException).code ===
                                "ENOENT"
                            )
                                return false;
                            throw error;
                        }
                    )
                )
                    throw new UsageError(
                        `Destination already exists: ${destination}`
                    );
                const { state } = await verifiedLocalSource(client, {
                    selection,
                    expectedStoredProfile
                });
                const extracted = await extractAgentSkillArchive(
                    downloaded.bytes,
                    ref.type,
                    destination
                );
                state.workingDirectories[destination] = {
                    type: ref.type,
                    name: downloaded.metadata.name,
                    ref,
                    baseChecksum: downloaded.metadata.checksum,
                    treeDigest: extracted.treeDigest
                };
                await saveAgentSkillSourceState(state);
            });
            const result = { ...downloaded.metadata, directory: destination };
            if (opts.json) printData("json", result);
            else
                note(
                    `Pulled ${value} to ${destination}. It is a separate working directory: edits stay local until you publish it.`
                );
        });

    root.command("delete <ref>")
        .option("--force", "delete even if the publication changed remotely")
        .option("--json")
        .action(async (value: string, opts) => {
            const ref = parseAgentSkillRef(value);
            const workspaceMode = await isTrustedWorkspaceRuntime();
            const deletion = await withAgentSkillOperationLock(async () => {
                const client = await api();
                const {
                    identity,
                    state,
                    selection
                } = await verifiedLocalSource(client);
                const key = sourceStateKey(ref);
                const trackedChecksum =
                    Object.values(state.workingDirectories).find(
                        (item) =>
                            item.ref?.type === ref.type &&
                            item.ref.id === ref.id &&
                            item.baseChecksum
                    )?.baseChecksum || state.snapshot?.items[key]?.checksum;
                const expectedChecksum =
                    opts.force || !trackedChecksum
                        ? (await client.show(ref)).checksum
                        : trackedChecksum;
                await client.delete(ref, expectedChecksum).catch((error) => {
                    throw withWriteTarget(error, {
                        operation: "delete",
                        type: ref.type,
                        id: ref.id,
                        checksum: expectedChecksum
                    });
                });
                // The server deleted it. Local bookkeeping failures below
                // must not make the deletion appear to have failed.
                try {
                    // Working directories stay in place as untracked user data.
                    for (const item of Object.values(state.workingDirectories))
                        if (
                            item.ref?.type === ref.type &&
                            item.ref.id === ref.id
                        ) {
                            delete item.ref;
                            delete item.baseChecksum;
                        }
                    if (state.snapshot?.items[key])
                        delete state.snapshot.items[key];
                    await saveAgentSkillSourceState(state);
                } catch (error) {
                    return { cacheError: (error as Error).message };
                }
                if (
                    workspaceMode ||
                    !selection.mayActivateSkills ||
                    !state.snapshot
                )
                    return {};
                // Retire installed copies through the shared engine; edited
                // copies are conflicts and stay in place without --force.
                const { desired, unresolved } = cachedDesired(state);
                const outcome = await reconcileAgentSkillInstallations({
                    sourceKey: identity.key,
                    desired,
                    unresolved,
                    force: false,
                    targets: resolveAgentSkillTargets({ env: process.env })
                });
                return { local: reconcileResult(outcome) };
            });
            const { local, cacheError } = deletion as {
                local?: ReturnType<typeof reconcileResult>;
                cacheError?: string;
            };
            const result = {
                ref,
                deleted: true,
                localCache: cacheError ? "failed" : "updated",
                ...(local ? { local } : {})
            };
            if (opts.json) printData("json", result);
            else {
                note(`Deleted ${value}.`);
                if (cacheError)
                    note(
                        `The remote deletion succeeded, but local bookkeeping failed (${cacheError}). A later \`mgd agent-skill sync\` repairs it.`
                    );
                if (local)
                    printAgentSkillSyncResult(
                        local,
                        {},
                        "Local installation cleanup"
                    );
                else
                    note(
                        "Run `mgd agent-skill sync` to remove installed copies of this skill."
                    );
            }
        });

    root.command("sync")
        .addOption(typeOption(true))
        .option(
            "--force",
            "discard conflicting local changes in matching skill directories"
        )
        .option("--json")
        .option("--jsonl")
        .addOption(
            new Option(
                "--workspace-status",
                "return structured failure status to Agent Manager"
            ).hideHelp()
        )
        .action(async (opts, command) => {
            rejectScope(command);
            // The root-owned image marker selects the Workspace system+own-user
            // contract. The hidden flag only requests Manager's bounded summary
            // and exit semantics; it must not change what a manual Sandbox sync
            // reconciles.
            const workspaceMode = await isTrustedWorkspaceRuntime();
            if (opts.workspaceStatus && !workspaceMode) {
                throw new UsageError(
                    "--workspace-status is reserved for the root-provisioned MAGDA Agent Workspace runtime"
                );
            }
            if (!workspaceMode && opts.type === "system") {
                throw new UsageError(
                    "Local synchronization never auto-installs system skills; use `mgd agent-skill pull system/<id>` to inspect one explicitly"
                );
            }
            const result = workspaceMode
                ? await syncWorkspaceAgentSkills(
                      await api(),
                      opts.type as AgentSkillListType,
                      !!opts.force
                  )
                : await (async () => {
                      const cfg = await loadConfig();
                      const selection = resolveProfileSelection(cfg);
                      if (!selection.profile?.baseUrl)
                          throw noProfileError(cfg);
                      // Bind authentication, activation alias and credential
                      // comparison to one profile snapshot. A concurrent
                      // profile switch must not mix two accounts.
                      const client = new AgentSkillClient(
                          clientFor(selection.profile)
                      );
                      return syncLocalAgentSkills(client, {
                          force: !!opts.force,
                          selectedProfile: selection.name,
                          activate: selection.mayActivateSkills,
                          persistProfileIdentity:
                              selection.mayPersistAgentSkillIdentity,
                          expectedProfile: !selection.oneOffOverride
                              ? { ...selection.profile }
                              : undefined
                      });
                  })();
            printAgentSkillSyncResult(result, opts);
            // Any unresolved conflict, partial or failed result is nonzero so
            // scripts never treat a partly reconciled source as installed.
            if (result.status !== "success" && !opts.workspaceStatus) {
                process.exitCode = 1;
            }
        });

    root.command("installations")
        .description(
            "List the shared skills you installed, with their source status"
        )
        .option("--limit <number>", "page size", "20")
        .option("--page-token <token>")
        .option("--json")
        .option("--jsonl")
        .action(async (opts) => {
            const page = await (await api()).installations({
                limit: pageLimit(opts.limit),
                pageToken: opts.pageToken
            });
            const mode = resolveMode(opts);
            if (mode !== "human") {
                printData(mode, page, page.items);
                return;
            }
            for (const item of page.items) {
                if ("problem" in item) {
                    process.stdout.write(
                        `${item.id}\tinvalid installation record (uninstall it)\n`
                    );
                    continue;
                }
                const source =
                    item.source.status === "available"
                        ? `shared by ${item.source.skill.userId}`
                        : item.source.status === "pending"
                        ? "source is being updated"
                        : "source unavailable (revoked or deleted): uninstall it";
                process.stdout.write(
                    `${item.effectiveName}\t${item.sourceSkillId}\t${source}\n`
                );
            }
            if (page.nextPageToken)
                note(`Next page token: ${page.nextPageToken}`);
        });

    root.command("install <ref>")
        .description(
            "Install a user skill shared with you into your account (user/<id>)"
        )
        .option(
            "--as <alias>",
            "install under a different name, e.g. when the name is already used"
        )
        .option("--json")
        .action(async (value: string, opts) => {
            const ref = sharedRef(value);
            const installed = await (await api())
                .install(ref.id, opts.as)
                .catch((error) => {
                    if (
                        error instanceof MgdApiError &&
                        error.code === "AGENT_SKILL_NAME_CONFLICT"
                    ) {
                        const suggestion = (error.details?.server as {
                            suggestedAlias?: string;
                        })?.suggestedAlias;
                        throw new UsageError(
                            `${error.message}${
                                suggestion
                                    ? ` Rerun with \`--as ${suggestion}\`.`
                                    : " Rerun with `--as <name>`."
                            }`
                        );
                    }
                    throw error;
                });
            if (opts.json) {
                printData("json", installed);
                return;
            }
            note(
                `Installed ${ref.id} as "${installed.effectiveName}" (${
                    installed.id
                }).${
                    installed.source.status === "available"
                        ? ` Shared by ${installed.source.skill.userId}.`
                        : ""
                }`
            );
            note(
                "Nothing was copied to this computer yet: run `mgd agent-skill sync` to install it in your coding-agent harnesses. Running Agent Workspaces receive it at their next skill sync."
            );
        });

    root.command("uninstall <name>")
        .description(
            "Uninstall a shared skill you installed (by its installed name or installation ID); the publisher's skill is unchanged"
        )
        .option("--json")
        .action(async (value: string, opts) => {
            const client = await api();
            const id = await installationIdFor(client, value);
            await client.uninstall(id);
            if (opts.json) {
                printData("json", { id, uninstalled: true });
                return;
            }
            note(
                `Uninstalled ${id}. Run \`mgd agent-skill sync\` to remove its installed copies; edited copies are kept until \`sync --force\`.`
            );
        });

    root.command("share <ref> <user-id>")
        .description(
            "Let another MAGDA user (by user ID) read one of your published skills; they install it explicitly"
        )
        .option("--json")
        .action(async (value: string, userId: string, opts) => {
            const ref = parseAgentSkillRef(value);
            const result = await (await api()).share(ref, userId);
            if (opts.json) printData("json", { ref, userId, ...result });
            else
                note(
                    result.added
                        ? `Shared ${value} with ${userId}. They can now find it with \`mgd agent-skill list --shared\` or Settings > Shared Skills, and install it explicitly.`
                        : `${userId} already had access to ${value}.`
                );
        });

    root.command("unshare <ref> <user-id>")
        .description(
            "Stop sharing a published skill with a user; their future syncs remove clean copies"
        )
        .option("--json")
        .action(async (value: string, userId: string, opts) => {
            const ref = parseAgentSkillRef(value);
            const result = await (await api()).unshare(ref, userId);
            if (opts.json) printData("json", { ref, userId, ...result });
            else
                note(
                    result.removed
                        ? `Stopped sharing ${value} with ${userId}. They can no longer read or download it; copies already on their computers are removed by their next successful sync (edited copies are kept as conflicts).`
                        : `${value} was not shared with ${userId}.`
                );
        });

    root.command("recipients <ref>")
        .description("List the users a published skill is shared with")
        .option("--offset <number>", "first result", "0")
        .option("--limit <number>", "page size", "20")
        .option("--keyword <text>", "match user ID or display name")
        .option("--json")
        .option("--jsonl")
        .action(async (value: string, opts) => {
            const offset = Number(opts.offset);
            if (!Number.isSafeInteger(offset) || offset < 0)
                throw new UsageError("--offset must be a non-negative integer");
            const page = await (await api()).recipients(
                parseAgentSkillRef(value),
                {
                    offset,
                    limit: pageLimit(opts.limit),
                    keyword: opts.keyword
                }
            );
            const mode = resolveMode(opts);
            if (mode !== "human") printData(mode, page, page.items);
            else {
                for (const item of page.items)
                    process.stdout.write(
                        `${item.id}\t${item.displayName || ""}\n`
                    );
                note(`${page.total} recipient(s).`);
            }
        });

    root.command("access <ref>")
        .description(
            "Show or change who can read a system skill (Public skill and organisation); access paths are additive"
        )
        .option(
            "--public",
            "available to every user with a system-skill read permission that allows public access (not anonymous)"
        )
        .option(
            "--no-public",
            "restrict to the organisation and selected users"
        )
        .option("--org-unit <id>", "grant to one organisation unit")
        .option("--clear-org-unit", "remove the organisation unit grant")
        .option("--json")
        .action(async (value: string, opts) => {
            const ref = parseAgentSkillRef(value);
            if (opts.orgUnit && opts.clearOrgUnit)
                throw new UsageError(
                    "--org-unit and --clear-org-unit cannot be combined"
                );
            const settings = {
                ...(opts.public !== undefined ? { public: opts.public } : {}),
                ...(opts.orgUnit ? { orgUnitId: opts.orgUnit } : {}),
                ...(opts.clearOrgUnit ? { orgUnitId: null } : {})
            };
            const client = await api();
            const access = Object.keys(settings).length
                ? await client.updateAccess(ref, settings)
                : await client.access(ref);
            if (opts.json) {
                printData("json", access);
                return;
            }
            if (access.type === "system")
                note(
                    `${value}: Public skill ${
                        access.public ? "on" : "off"
                    }; organisation ${access.orgUnitId || "none"}; ${
                        access.recipients.count
                    } selected user(s).${
                        access.public
                            ? " While public, the organisation and selected users do not restrict access."
                            : ""
                    }`
                );
            else
                note(
                    `${value}: private to its user; shared with ${access.recipients.count} selected user(s).`
                );
        });
}
