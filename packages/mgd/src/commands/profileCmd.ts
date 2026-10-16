import { Command } from "commander";
import { UsageError } from "../errors.js";
import type { Profile } from "../profile.js";
import { loadConfig, saveConfig } from "../profile.js";
import type { AgentSkillSourceIdentity } from "../agentSkillLocalState.js";
import { clientFor } from "../client.js";
import { AgentSkillClient } from "../agentSkillClient.js";
import {
    commitAgentSkillProfileTransition,
    recoverAgentSkillProfileTransition
} from "../agentSkillProfileTransition.js";
import { syncLocalAgentSkills } from "../agentSkillLocalSync.js";
import { withAgentSkillStateLock } from "../agentSkillState.js";
import { note, printData, resolveMode } from "../output.js";
import { createProfile, updateProfile } from "./profileSetup.js";

function cachedIdentity(
    profile: Profile | undefined
): AgentSkillSourceIdentity | undefined {
    const cached = profile?.agentSkillSource;
    return cached
        ? {
              key: cached.key,
              canonicalBaseUrl: cached.canonicalBaseUrl,
              tenantId: cached.tenantId,
              userId: cached.userId
          }
        : undefined;
}

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
            await recoverAgentSkillProfileTransition();
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
            await withAgentSkillStateLock(async () => {
                await recoverAgentSkillProfileTransition({
                    alreadyLocked: true
                });
                const cfg = await loadConfig();
                if (!cfg.profiles[target])
                    throw new UsageError(`No such profile: ${target}`);
                const removedActive =
                    (cfg.activeProfile || "default") === target;
                const removedIdentity = cachedIdentity(cfg.profiles[target]);
                delete cfg.profiles[target];
                if (removedActive) {
                    delete cfg.activeProfile;
                    await commitAgentSkillProfileTransition(
                        {
                            fromProfile: target,
                            fromSource: removedIdentity,
                            toProfile: "default",
                            toSource: cachedIdentity(cfg.profiles.default),
                            finalConfig: cfg
                        },
                        { alreadyLocked: true }
                    );
                } else {
                    await saveConfig(cfg);
                }
            });
            note(`Removed profile "${target}".`);
        });

    profile
        .command("use <name>")
        .description(
            "Set the active profile and activate its cached Agent Skills"
        )
        .option(
            "--sync-skills",
            "explicitly fetch Agent Skill updates after offline activation"
        )
        .action(async (name: string, opts) => {
            let selected!: Awaited<
                ReturnType<typeof loadConfig>
            >["profiles"][string];
            let cached: typeof selected.agentSkillSource;
            const activation = await withAgentSkillStateLock(async () => {
                await recoverAgentSkillProfileTransition({
                    alreadyLocked: true
                });
                const cfg = await loadConfig();
                selected = cfg.profiles[name];
                if (!selected) throw new UsageError(`No such profile: ${name}`);
                const previousName = cfg.activeProfile || "default";
                const previousIdentity = cachedIdentity(
                    cfg.profiles[previousName]
                );
                cached = selected.agentSkillSource;
                cfg.activeProfile = name;
                return commitAgentSkillProfileTransition(
                    {
                        fromProfile: previousName,
                        fromSource: previousIdentity,
                        toProfile: name,
                        toSource: cachedIdentity(selected),
                        finalConfig: cfg
                    },
                    { alreadyLocked: true }
                );
            });
            note(`Active profile set to "${name}".`);
            if (!cached) {
                note(
                    `No verified Agent Skill cache exists for "${name}"; previous managed skills were deactivated. Run \`mgd agent-skill sync\`.`
                );
            } else if (activation.conflicts.length) {
                note(
                    `Agent Skill activation was partial: ${activation.conflicts.length} unmanaged or modified path(s) were preserved.`
                );
            }
            if (opts.syncSkills) {
                const result = await syncLocalAgentSkills(
                    new AgentSkillClient(clientFor(selected)),
                    {
                        selectedProfile: name,
                        activate: true,
                        expectedProfile: { ...selected }
                    }
                );
                note(
                    `Agent Skill sync ${result.status}: ${JSON.stringify(
                        result.counts
                    )}`
                );
                if (result.status === "failed") process.exitCode = 1;
            }
        });
}
