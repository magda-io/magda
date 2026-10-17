import path from "node:path";
import {
    lstat,
    mkdir,
    readFile,
    realpath,
    stat,
    writeFile
} from "node:fs/promises";
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
    cachedDesired,
    reconcileResult,
    recoverAgentSkillOperations,
    syncLocalAgentSkills,
    syncWorkspaceAgentSkills,
    withAgentSkillOperationLock
} from "../agentSkillSync.js";
import {
    reconcileAgentSkillInstallations,
    writeInstallMarker
} from "../agentSkillReconcile.js";
import type { AgentSkillInstallation } from "../agentSkillLocalState.js";
import {
    agentSkillArchivePath,
    canonicalMagdaBaseUrl,
    createAgentSkillSourceIdentity,
    findAgentSkillWorkingDirectory,
    loadAgentSkillInstallationIndex,
    loadAgentSkillSourceState,
    markerMatchesInstallation,
    saveAgentSkillInstallationIndex,
    saveAgentSkillSourceState,
    sourceStateKey,
    writeFileAtomically
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

async function canonicalPath(target: string): Promise<string> {
    return realpath(target).catch(() => path.resolve(target));
}

/**
 * Recognize an installed copy: an indexed path that is a real directory with
 * real ancestors and a regular marker exactly matching the index entry. Only
 * then may the marker be excluded from validation and publication.
 */
async function recognizeInstallation(
    directory: string
): Promise<AgentSkillInstallation | undefined> {
    const absolute = path.resolve(directory);
    const actual = await canonicalPath(absolute);
    const index = await loadAgentSkillInstallationIndex();
    let installation: AgentSkillInstallation | undefined;
    for (const item of Object.values(index.installations)) {
        if (
            item.path === absolute ||
            (await canonicalPath(item.path)) === actual
        ) {
            installation = item;
            break;
        }
    }
    const marker = path.join(absolute, AGENT_SKILL_INSTALL_MARKER);
    const markerStat = await lstat(marker).catch(() => undefined);
    if (!installation || !markerStat) {
        if (markerStat)
            throw new UsageError(
                `${absolute} contains ${AGENT_SKILL_INSTALL_MARKER} but is not a recognized installation. Run \`mgd agent-skill sync\` to repair it, or remove that file from your copy.`
            );
        return undefined;
    }
    await assertRealManagedAncestors(installation.path);
    const directoryStat = await lstat(installation.path);
    if (
        directoryStat.isSymbolicLink() ||
        !directoryStat.isDirectory() ||
        markerStat.isSymbolicLink() ||
        !markerStat.isFile() ||
        !markerMatchesInstallation(await readFile(marker), installation)
    )
        throw new UsageError(
            `${absolute} has stale or unsafe installation metadata. Run \`mgd agent-skill sync\` to repair it before publishing.`
        );
    return installation;
}

async function publishInstallation(
    installation: AgentSkillInstallation,
    opts: { type: AgentSkillType; force?: boolean; json?: boolean }
): Promise<void> {
    if (installation.sourceKind !== "own-user-publication") {
        throw new UsageError(
            installation.ref.type === "system"
                ? `This is an installed copy of ${installation.ref.type}/${installation.ref.id}. Installed system skills are not published from their installation; use \`mgd agent-skill pull ${installation.ref.type}/${installation.ref.id}\` and publish that working directory with --type system.`
                : "Publishing a modified installed shared skill is not supported yet."
        );
    }
    if (opts.type !== "user")
        throw new UsageError(
            "This installed copy is your own user publication; publish it with --type user"
        );
    const candidate = await createAgentSkillArchiveFromInstallation(
        installation.path,
        "user"
    );
    if (candidate.name !== installation.name)
        throw new UsageError(
            `SKILL.md name "${candidate.name}" no longer matches the installed publication "${installation.name}". Copy the directory elsewhere (without ${AGENT_SKILL_INSTALL_MARKER}) to publish it as a new skill.`
        );
    const client = await api();
    const { identity, state } = await verifiedLocalSource(client);
    if (installation.sourceKey !== identity.key)
        throw new UsageError(
            "This installed copy belongs to another MAGDA instance or account; switch to that profile before publishing it"
        );
    let expected = installation.baselineChecksum;
    let metadata;
    try {
        if (opts.force)
            expected = (await client.show(installation.ref)).checksum;
        metadata = await client.replace(
            installation.ref,
            candidate.bytes,
            expected
        );
    } catch (error) {
        if (error instanceof MgdApiError && error.status === 404)
            throw new UsageError(
                `The publication ${installation.ref.type}/${installation.ref.id} no longer exists remotely; it was not recreated. To publish this content as a new skill, copy the directory elsewhere without ${AGENT_SKILL_INSTALL_MARKER} and run \`mgd agent-skill publish <copy>\`.`
            );
        if (error instanceof MgdApiError && error.status === 412)
            throw new UsageError(
                "The publication changed remotely since this copy was installed. Run `mgd agent-skill sync` to review, or rerun with --force to overwrite your newer publication."
            );
        throw error;
    }
    // The server accepted the content. Local bookkeeping failures below must
    // not make a successful publication appear to have failed.
    let localUpdated = false;
    try {
        if (metadata.checksum === candidate.archiveSha256) {
            const ref = { type: metadata.type, id: metadata.id };
            const key = sourceStateKey(ref);
            const archiveFile = agentSkillArchivePath(
                identity,
                ref,
                metadata.checksum
            );
            await writeFileAtomically(archiveFile, candidate.bytes);
            const now = new Date().toISOString();
            if (state.snapshot?.items[key]) {
                state.snapshot.items[key] = {
                    ...state.snapshot.items[key],
                    description: metadata.description,
                    checksum: metadata.checksum,
                    treeDigest: candidate.treeDigest,
                    archiveFile,
                    verifiedAt: now
                };
                delete state.snapshot.items[key].unresolved;
                await saveAgentSkillSourceState(state);
            }
            const index = await loadAgentSkillInstallationIndex();
            const current = Object.values(index.installations).find(
                (item) => item.installationId === installation.installationId
            );
            if (current) {
                current.baselineChecksum = metadata.checksum;
                current.baselineTreeDigest = candidate.treeDigest;
                current.updatedAt = now;
                await saveAgentSkillInstallationIndex(index);
                await writeInstallMarker(current.path, current);
                localUpdated = true;
            }
        }
    } catch {
        localUpdated = false;
    }
    if (opts.json) {
        printData("json", {
            ...metadata,
            installation: {
                harness: installation.harness,
                path: installation.path,
                baselineUpdated: localUpdated
            }
        });
        return;
    }
    note(
        `Published ${metadata.type}/${metadata.id} from ${installation.harness} copy ${installation.path}.`
    );
    if (!localUpdated)
        note(
            "The local installation baseline could not be updated; run `mgd agent-skill sync` to repair it."
        );
    note(
        "Other harness copies were not changed. Run `mgd agent-skill sync` to update them."
    );
}

export function registerAgentSkillCommands(program: Command): void {
    const root = program
        .command("agent-skill")
        .description("Create, publish, inspect, and synchronize Agent Skills")
        .allowUnknownOption(false);

    root.command("list")
        .addOption(typeOption(true))
        .option("--limit <number>", "page size", "20")
        .option("--page-token <token>")
        .option("--query <text>")
        .option("--json")
        .option("--jsonl")
        .action(async (opts, command) => {
            rejectScope(command);
            const limit = Number(opts.limit);
            if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
                throw new UsageError(
                    "--limit must be an integer from 1 to 100"
                );
            const page = await (await api()).list({
                type: opts.type,
                limit,
                pageToken: opts.pageToken,
                q: opts.query
            });
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
            "overwrite your own publication even if it changed remotely"
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
                const globallyTracked = await findAgentSkillWorkingDirectory(
                    absolute
                );
                if (
                    globallyTracked &&
                    globallyTracked.directory.type !== opts.type
                ) {
                    throw new UsageError(
                        `Tracked ${globallyTracked.directory.type} publication requires explicit --type ${globallyTracked.directory.type}`
                    );
                }
                const candidate = await createAgentSkillArchive(
                    absolute,
                    opts.type
                );
                if (!globallyTracked && opts.force) {
                    throw new UsageError(
                        "--force can only be used for a tracked publication"
                    );
                }
                const client = await api();
                const { identity, state } = await verifiedLocalSource(client);
                if (
                    globallyTracked &&
                    globallyTracked.sourceKey !== identity.key
                ) {
                    throw new UsageError(
                        "This working directory is tracked against another MAGDA instance/account; pull or copy it into an untracked directory before publishing here"
                    );
                }
                const tracked = state.workingDirectories[absolute];
                if (tracked?.ref && tracked.type !== opts.type) {
                    throw new UsageError(
                        `Tracked ${tracked.type} publication requires explicit --type ${tracked.type}`
                    );
                }
                let metadata;
                if (tracked?.ref && tracked.baseChecksum) {
                    let expected = tracked.baseChecksum;
                    if (opts.force)
                        expected = (await client.show(tracked.ref)).checksum;
                    metadata = await client.replace(
                        tracked.ref,
                        candidate.bytes,
                        expected
                    );
                } else {
                    metadata = await client.create(opts.type, candidate.bytes);
                }
                const ref = { type: metadata.type, id: metadata.id };
                state.workingDirectories[absolute] = {
                    type: metadata.type,
                    name: metadata.name,
                    ref,
                    baseChecksum: metadata.checksum,
                    treeDigest: candidate.treeDigest
                };
                await saveAgentSkillSourceState(state);
                if (opts.json) printData("json", metadata);
                else {
                    note(`Published ${metadata.type}/${metadata.id}.`);
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
            await recoverAgentSkillOperations();
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
            const local = await withAgentSkillOperationLock(async () => {
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
                await client.delete(ref, expectedChecksum);
                // Working directories stay in place as untracked user data.
                for (const item of Object.values(state.workingDirectories))
                    if (item.ref?.type === ref.type && item.ref.id === ref.id) {
                        delete item.ref;
                        delete item.baseChecksum;
                    }
                if (state.snapshot?.items[key])
                    delete state.snapshot.items[key];
                await saveAgentSkillSourceState(state);
                if (workspaceMode || !selection.mayActivateSkills)
                    return undefined;
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
                return reconcileResult(outcome);
            });
            const result = {
                ref,
                deleted: true,
                ...(local ? { local } : {})
            };
            if (opts.json) printData("json", result);
            else {
                note(`Deleted ${value}.`);
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
                      await recoverAgentSkillOperations();
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
            if (
                (result.status === "failed" || result.blocked) &&
                !opts.workspaceStatus
            ) {
                process.exitCode = 1;
            }
        });
}
