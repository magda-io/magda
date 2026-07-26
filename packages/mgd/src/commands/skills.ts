import { Command } from "commander";
import {
    installSkill,
    uninstallSkill,
    packageSkillsDir,
    parseAgents,
    AGENT_NAMES,
    InstallResult,
    Scope
} from "../skills.js";
import { note, printData, resolveMode } from "../output.js";

// --project absent => global; --project (bare) => cwd; --project <dir> => <dir>.
function scopeAndDir(opts: {
    project?: string | boolean;
}): {
    scope: Scope;
    projectDir: string;
} {
    if (opts.project === undefined) {
        return { scope: "global", projectDir: process.cwd() };
    }
    const projectDir =
        typeof opts.project === "string" ? opts.project : process.cwd();
    return { scope: "project", projectDir };
}

function reportHuman(results: InstallResult[], verb: string): void {
    for (const r of results) {
        note(`${verb} ${r.agent} (${r.scope}): ${r.action} ${r.dir}`);
    }
}

export function registerSkillsCommands(program: Command): void {
    const skills = program
        .command("skills")
        .description("Manage the mgd coding-agent skill");

    skills
        .command("install")
        .description(
            "Install the mgd skill for coding agents (all agents, global, by default)"
        )
        .option(
            "--agent <name>",
            `coding agent: ${AGENT_NAMES.join(" | ")} (default: all)`
        )
        .option(
            "--project [dir]",
            "install into a project directory instead of globally"
        )
        .option("--json", "output JSON")
        .action(async (opts) => {
            const agents = parseAgents(opts.agent);
            const { scope, projectDir } = scopeAndDir(opts);
            const skillsDir = packageSkillsDir();
            const results: InstallResult[] = [];
            for (const agent of agents) {
                results.push(
                    await installSkill({
                        agent,
                        scope,
                        projectDir,
                        skillsDir,
                        env: process.env
                    })
                );
            }
            const mode = resolveMode(opts);
            if (mode === "human") reportHuman(results, "installed");
            else printData(mode, results);
        });

    skills
        .command("uninstall")
        .description("Remove the mgd skill for coding agents")
        .option(
            "--agent <name>",
            `coding agent: ${AGENT_NAMES.join(" | ")} (default: all)`
        )
        .option(
            "--project [dir]",
            "uninstall from a project directory instead of globally"
        )
        .option("--json", "output JSON")
        .action(async (opts) => {
            const agents = parseAgents(opts.agent);
            const { scope, projectDir } = scopeAndDir(opts);
            const results: InstallResult[] = [];
            for (const agent of agents) {
                results.push(
                    await uninstallSkill({
                        agent,
                        scope,
                        projectDir,
                        env: process.env
                    })
                );
            }
            const mode = resolveMode(opts);
            if (mode === "human") reportHuman(results, "uninstalled");
            else printData(mode, results);
        });
}
