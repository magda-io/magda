import { Command } from "commander";
import { UsageError } from "../errors.js";
import { loadConfig, saveConfig } from "../profile.js";
import { clientFor } from "../client.js";
import { AgentSkillClient } from "../agentSkillClient.js";
import {
    cachedProfileIdentity,
    reconcileCachedAgentSkillProfile,
    syncLocalAgentSkills,
    withAgentSkillOperationLock
} from "../agentSkillSync.js";
import { note, printData, resolveMode } from "../output.js";
import { printAgentSkillSyncResult } from "./agentSkillOutput.js";
import { createProfile, updateProfile } from "./profileSetup.js";

function requireName(name: string | undefined, usage: string): string {
    if (!name) {
        throw new UsageError(`Profile name is required. Usage: ${usage}`);
    }
    return name;
}

export function registerProfileCommands(program: Command): void {
    const profile = program.command("profile").description("Manage profiles");

    profile
        .command("list")
        .description("List profiles")
        .option("--json", "output JSON")
        .action(async (opts) => {
            const cfg = await loadConfig();
            const rows = Object.entries(cfg.profiles).map(([name, p]) => ({
                name,
                baseUrl: p.baseUrl,
                hasCredentials: Boolean(p.apiKeyId),
                active: name === (cfg.activeProfile || "default")
            }));
            const mode = resolveMode(opts);
            if (mode === "human") {
                for (const r of rows) {
                    process.stdout.write(
                        `${r.active ? "*" : " "} ${r.name}\t${r.baseUrl}\t${
                            r.hasCredentials ? "api-key" : "anonymous"
                        }\n`
                    );
                }
            } else {
                printData(mode, rows);
            }
        });

    profile
        .command("create [name]")
        .description("Create a new profile with credentials")
        .option("--url <url>", "MAGDA site or API base URL")
        .option("--key-id <id>", "API key ID")
        .option("--key <key>", "API key")
        .action(async (name: string | undefined, opts) => {
            const target = requireName(name, "mgd profile create <name>");
            await createProfile(target, {
                url: opts.url,
                keyId: opts.keyId,
                key: opts.key
            });
        });

    profile
        .command("update [name]")
        .description("Update an existing profile's credentials")
        .option("--url <url>", "MAGDA site or API base URL")
        .option("--key-id <id>", "API key ID")
        .option("--key <key>", "API key")
        .action(async (name: string | undefined, opts) => {
            const target = requireName(name, "mgd profile update <name>");
            await updateProfile(target, {
                url: opts.url,
                keyId: opts.keyId,
                key: opts.key
            });
        });

    profile
        .command("remove [name]")
        .description("Delete a profile")
        .action(async (name: string | undefined) => {
            const target = requireName(name, "mgd profile remove <name>");
            const removedActive = await withAgentSkillOperationLock(
                async () => {
                    const cfg = await loadConfig();
                    if (!cfg.profiles[target])
                        throw new UsageError(`No such profile: ${target}`);
                    const active = (cfg.activeProfile || "default") === target;
                    delete cfg.profiles[target];
                    if (active) delete cfg.activeProfile;
                    await saveConfig(cfg);
                    return active;
                }
            );
            note(`Removed profile "${target}".`);
            // Installed skills are never deleted for a config change; the next
            // sync of the active profile reconciles them.
            if (removedActive)
                note(
                    "Agent Skills installed for it remain until the next `mgd agent-skill sync` or `mgd profile use` reconciles them."
                );
        });

    profile
        .command("use <name>")
        .description(
            "Set the active profile, then reconcile its verified cached Agent Skills offline"
        )
        .option(
            "--force",
            "discard conflicting local skill changes while reconciling"
        )
        .option(
            "--sync-skills",
            "also fetch Agent Skill updates online after switching"
        )
        .action(async (name: string, opts) => {
            // The selection write and its reconciliation run under the one
            // cross-process operation lock, so two profile operations cannot
            // interleave. A concurrent operation fails fast with a retryable
            // lock error; the socket lock is released even on a crash.
            const incomplete = await withAgentSkillOperationLock(async () => {
                // Step 1: the profile selection is committed first and is
                // never rolled back because of skill synchronization.
                const cfg = await loadConfig();
                const selected = cfg.profiles[name];
                if (!selected) throw new UsageError(`No such profile: ${name}`);
                cfg.activeProfile = name;
                await saveConfig(cfg);
                note(`Active profile: ${name}`);
                // Step 2: ordinary (or --force) offline reconciliation.
                const offline = await reconcileCachedAgentSkillProfile({
                    identity: cachedProfileIdentity(selected),
                    force: !!opts.force
                });
                let unfinished = false;
                if (!offline) {
                    note(
                        `No verified Agent Skill cache exists for "${name}", so its skills cannot be synchronized offline yet. Installed skills were left unchanged; run \`mgd agent-skill sync\`.`
                    );
                    unfinished = !opts.syncSkills;
                } else {
                    printAgentSkillSyncResult(offline, {}, "Agent Skill sync");
                    if (offline.status !== "success") {
                        unfinished = true;
                        note(
                            `The active profile is "${name}", but synchronization is incomplete: skills from a previous profile may still be visible to your coding agents until the paths above are resolved.`
                        );
                    }
                }
                if (opts.syncSkills) {
                    const online = await syncLocalAgentSkills(
                        new AgentSkillClient(clientFor(selected)),
                        {
                            selectedProfile: name,
                            activate: true,
                            force: !!opts.force,
                            expectedProfile: { ...selected }
                        }
                    );
                    printAgentSkillSyncResult(
                        online,
                        {},
                        "Online Agent Skill sync"
                    );
                    unfinished = online.status !== "success";
                }
                return unfinished;
            });
            if (incomplete) process.exitCode = 1;
        });
}
