import path from "node:path";
import { lstat, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Command, Option } from "commander";
import { clientFor, clientFromProfile } from "../client.js";
import { AgentSkillClient } from "../agentSkillClient.js";
import {
    AgentSkillListType,
    AgentSkillRef,
    AgentSkillType,
    parseAgentSkillRef
} from "../agentSkillTypes.js";
import {
    createAgentSkillArchive,
    extractAgentSkillArchive,
    validateAgentSkillArchive,
    validateAgentSkillDirectory,
    validateAgentSkillNameForType
} from "../agentSkillArchive.js";
import {
    ensureRealDirectory,
    withAgentSkillStateLock
} from "../agentSkillState.js";
import { syncAgentSkills as syncWorkspaceAgentSkills } from "../agentSkillSync.js";
import { syncLocalAgentSkills } from "../agentSkillLocalSync.js";
import { recoverAgentSkillProfileTransition } from "../agentSkillProfileTransition.js";
import {
    loadConfig,
    noProfileError,
    resolveProfileSelection,
    saveConfig
} from "../profile.js";
import {
    canonicalMagdaBaseUrl,
    createAgentSkillSourceIdentity,
    findTrackedAgentSkillDraft,
    loadAgentSkillSourceState,
    saveAgentSkillSourceState,
    sourceStateKey
} from "../agentSkillLocalState.js";
import { activateAgentSkillSource } from "../agentSkillProjection.js";
import { UsageError } from "../errors.js";
import { note, printData, resolveMode } from "../output.js";

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

async function pathExists(target: string): Promise<boolean> {
    try {
        await stat(target);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

async function reconcileDeletedAgentSkill(
    ref: AgentSkillRef,
    context: Awaited<ReturnType<typeof verifiedLocalSource>>
): Promise<void> {
    const { identity, state, selection } = context;
    const key = sourceStateKey(ref);
    const current = state.entries[key];
    if (current && (await pathExists(current.libraryDir))) {
        let treeDigest = current.installedTreeDigest;
        let localChanged = true;
        try {
            const inspected = await validateAgentSkillDirectory(
                current.libraryDir,
                ref.type
            );
            treeDigest = inspected.treeDigest;
            localChanged = treeDigest !== current.installedTreeDigest;
        } catch {
            // Invalid local content remains user data and is preserved.
        }
        if (localChanged) {
            const draftsRoot = path.join(
                path.dirname(path.dirname(current.libraryDir)),
                "drafts",
                "deleted"
            );
            await ensureRealDirectory(draftsRoot);
            const draftDir = path.join(
                draftsRoot,
                `${current.name}-${Date.now()}-${randomUUID().slice(0, 8)}`
            );
            await rename(current.libraryDir, draftDir);
            state.drafts[draftDir] = {
                type: current.ref.type,
                name: current.name,
                treeDigest
            };
        } else {
            await rm(current.libraryDir, { recursive: true, force: true });
        }
        await rm(current.archiveFile, { force: true });
    }
    delete state.entries[key];
    for (const draft of Object.values(state.drafts)) {
        if (draft.ref?.type === ref.type && draft.ref.id === ref.id) {
            delete draft.ref;
            delete draft.baseChecksum;
        }
    }
    await saveAgentSkillSourceState(state);
    if (selection.mayActivateSkills) {
        await activateAgentSkillSource(identity, selection.name, {
            alreadyLocked: true
        });
    }
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
                    `Created local Agent Skill draft at ${directory}. It has not been published.`
                );
        });

    root.command("validate <local-dir>")
        .addOption(typeOption())
        .option("--json")
        .action(async (directory: string, opts) => {
            const result = await validateAgentSkillDirectory(
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
        .option("--force", "replace a remotely changed tracked publication")
        .option("--json")
        .action(async (directory: string, opts) => {
            await withAgentSkillStateLock(async () => {
                const absolute = path.resolve(directory);
                const globallyTracked = await findTrackedAgentSkillDraft(
                    absolute
                );
                if (
                    globallyTracked &&
                    globallyTracked.draft.type !== opts.type
                ) {
                    throw new UsageError(
                        `Tracked ${globallyTracked.draft.type} publication requires explicit --type ${globallyTracked.draft.type}`
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
                        "This draft is tracked against another MAGDA instance/account; pull or copy it into an untracked directory before publishing here"
                    );
                }
                const draft = state.drafts[absolute];
                if (draft?.ref && draft.type !== opts.type) {
                    throw new UsageError(
                        `Tracked ${draft.type} publication requires explicit --type ${draft.type}`
                    );
                }
                const tracked = !!draft?.ref && !!draft.baseChecksum;
                let metadata;
                if (draft?.ref && draft.baseChecksum) {
                    let expected = draft.baseChecksum;
                    if (opts.force)
                        expected = (await client.show(draft.ref)).checksum;
                    metadata = await client.replace(
                        draft.ref,
                        candidate.bytes,
                        expected
                    );
                } else {
                    metadata = await client.create(opts.type, candidate.bytes);
                }
                const ref = { type: metadata.type, id: metadata.id };
                state.drafts[absolute] = {
                    type: metadata.type,
                    name: metadata.name,
                    ref,
                    baseChecksum: metadata.checksum,
                    treeDigest: candidate.treeDigest
                };
                await saveAgentSkillSourceState(state);
                if (opts.json) printData("json", metadata);
                else note(`Published ${metadata.type}/${metadata.id}.`);
            });
        });

    root.command("pull <ref>")
        .option("-o, --output <directory>")
        .option("--json")
        .action(async (value: string, opts) => {
            const ref = parseAgentSkillRef(value);
            await recoverAgentSkillProfileTransition();
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
            await withAgentSkillStateLock(async () => {
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
                state.drafts[destination] = {
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
                    `Pulled ${value} to ${destination}. Local edits remain drafts until publish.`
                );
        });

    root.command("delete <ref>")
        .option("--force")
        .option("--json")
        .action(async (value: string, opts) => {
            await withAgentSkillStateLock(async () => {
                const ref = parseAgentSkillRef(value);
                const client = await api();
                const context = await verifiedLocalSource(client);
                const { state } = context;
                const trackedChecksum =
                    Object.values(state.drafts).find(
                        (draft) =>
                            draft.ref?.type === ref.type &&
                            draft.ref.id === ref.id &&
                            draft.baseChecksum
                    )?.baseChecksum ||
                    state.entries[sourceStateKey(ref)]?.remoteChecksum;
                const expectedChecksum =
                    opts.force || !trackedChecksum
                        ? (await client.show(ref)).checksum
                        : trackedChecksum;
                await client.delete(ref, expectedChecksum);
                await reconcileDeletedAgentSkill(ref, context);
                const result = {
                    ref,
                    deleted: true,
                    localDraftsPreserved: true
                };
                if (opts.json) printData("json", result);
                else note(`Deleted ${value}; local drafts were preserved.`);
            });
        });

    root.command("sync")
        .addOption(typeOption(true))
        .option("--force")
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
                      await recoverAgentSkillProfileTransition();
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
            const mode = resolveMode(opts);
            if (mode === "human") {
                note(
                    `Agent Skill sync ${result.status}: ${JSON.stringify(
                        result.counts
                    )}`
                );
            } else if (mode === "jsonl") {
                printData(mode, result, [
                    {
                        kind: "summary",
                        status: result.status,
                        counts: result.counts,
                        manifestWarnings: result.manifestWarnings
                    },
                    ...result.items
                ]);
            } else {
                printData(
                    mode,
                    opts.workspaceStatus
                        ? {
                              status: result.status,
                              counts: result.counts,
                              manifestWarnings: result.manifestWarnings
                          }
                        : result,
                    result.items
                );
            }
            if (result.status === "failed" && !opts.workspaceStatus) {
                process.exitCode = 1;
            }
        });
}
