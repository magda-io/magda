import { Command } from "commander";
import { UsageError } from "../errors.js";
import { loadConfig, saveConfig } from "../profile.js";
import { clientFor } from "../client.js";
import { AgentSkillClient } from "../agentSkillClient.js";
import {
    activateCachedAgentSkillProfile,
    cachedProfileIdentity,
    recoverAgentSkillOperations,
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
            await recoverAgentSkillOperations();
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
        .option(
            "--force",
            "discard conflicting local skill changes when removing the active profile"
        )
        .action(async (name: string | undefined, opts) => {
            const target = requireName(name, "mgd profile remove <name>");
            const deactivation = await withAgentSkillOperationLock(async () => {
                const cfg = await loadConfig();
                if (!cfg.profiles[target])
                    throw new UsageError(`No such profile: ${target}`);
                const removedActive =
                    (cfg.activeProfile || "default") === target;
                delete cfg.profiles[target];
                if (!removedActive) {
                    await saveConfig(cfg);
                    return undefined;
                }
                delete cfg.activeProfile;
                const switched = await activateCachedAgentSkillProfile({
                    profileName: "default",
                    identity: cachedProfileIdentity(cfg.profiles.default),
                    force: !!opts.force,
                    finalConfig: cfg
                });
                return switched.result;
            });
            if (deactivation?.blocked) {
                printAgentSkillSyncResult(deactivation, {}, "Profile removal");
                note(
                    `Profile "${target}" was not removed. Resolve the paths above or rerun with --force.`
                );
                process.exitCode = 1;
                return;
            }
            note(`Removed profile "${target}".`);
        });

    profile
        .command("use <name>")
        .description(
            "Set the active profile and install its verified cached Agent Skills (offline)"
        )
        .option(
            "--force",
            "discard conflicting local skill changes to complete the switch"
        )
        .option(
            "--sync-skills",
            "explicitly fetch Agent Skill updates after the offline switch"
        )
        .action(async (name: string, opts) => {
            let selected!: Awaited<
                ReturnType<typeof loadConfig>
            >["profiles"][string];
            // Same preflight/commit engine as `agent-skill sync`: conflicts
            // abort before the active profile or any installation changes.
            const switched = await withAgentSkillOperationLock(async () => {
                const cfg = await loadConfig();
                selected = cfg.profiles[name];
                if (!selected) throw new UsageError(`No such profile: ${name}`);
                cfg.activeProfile = name;
                return activateCachedAgentSkillProfile({
                    profileName: name,
                    identity: cachedProfileIdentity(selected),
                    force: !!opts.force,
                    finalConfig: cfg
                });
            });
            if (switched.result.blocked) {
                printAgentSkillSyncResult(
                    switched.result,
                    {},
                    "Profile switch"
                );
                note(
                    `Active profile was not changed. Resolve the paths above, or rerun \`mgd profile use ${name} --force\` to discard them.`
                );
                process.exitCode = 1;
                return;
            }
            note(`Active profile set to "${name}".`);
            if (!switched.cached) {
                note(
                    `No verified Agent Skill cache exists for "${name}"; previously managed skills were deactivated. Run \`mgd agent-skill sync\`.`
                );
            } else {
                printAgentSkillSyncResult(
                    switched.result,
                    {},
                    "Offline Agent Skill activation"
                );
            }
            if (opts.syncSkills) {
                const result = await syncLocalAgentSkills(
                    new AgentSkillClient(clientFor(selected)),
                    {
                        selectedProfile: name,
                        activate: true,
                        force: !!opts.force,
                        expectedProfile: { ...selected }
                    }
                );
                printAgentSkillSyncResult(result, {});
                // The offline switch stands; an online failure is degraded,
                // never a rollback to another profile's skills.
                if (result.status === "failed" || result.blocked)
                    process.exitCode = 1;
            }
        });
}
