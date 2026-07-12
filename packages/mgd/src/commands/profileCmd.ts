import { Command } from "commander";
import { UsageError } from "../errors.js";
import { loadConfig, saveConfig } from "../profile.js";
import { note, printData, resolveMode } from "../output.js";
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
            const cfg = await loadConfig();
            if (!cfg.profiles[target])
                throw new UsageError(`No such profile: ${target}`);
            delete cfg.profiles[target];
            // If the removed profile was active, fall back to `default`.
            if (cfg.activeProfile === target) delete cfg.activeProfile;
            await saveConfig(cfg);
            note(`Removed profile "${target}".`);
        });

    profile
        .command("use <name>")
        .description("Set the active profile")
        .action(async (name: string) => {
            const cfg = await loadConfig();
            if (!cfg.profiles[name])
                throw new UsageError(`No such profile: ${name}`);
            cfg.activeProfile = name;
            await saveConfig(cfg);
            note(`Active profile set to "${name}".`);
        });
}
