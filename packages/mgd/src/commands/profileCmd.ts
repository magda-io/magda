import { Command } from "commander";
import { UsageError } from "../errors.js";
import { loadConfig, saveConfig } from "../profile.js";
import { note, printData, resolveMode } from "../output.js";

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
