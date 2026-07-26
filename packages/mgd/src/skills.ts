import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UsageError } from "./errors.js";

export type AgentName = "claude" | "codex" | "opencode";
export const AGENT_NAMES: readonly AgentName[] = [
    "claude",
    "codex",
    "opencode"
];

export type Scope = "global" | "project";

export interface InstallResult {
    agent: AgentName;
    scope: Scope;
    dir: string;
    files: string[];
    action: "created" | "updated" | "removed" | "absent";
}

// The whole magda-mgd/ folder is a managed unit: install overwrites it, uninstall
// removes it. SKILL.md references the other two files "in the same directory", so
// the three ship and install together.
const SKILL_SUBDIR = "magda-mgd";
const BUNDLE = ["SKILL.md", "mgd-workflows.md", "dataset-elicitation.md"];

function homeDir(env: NodeJS.ProcessEnv): string {
    const home = env.HOME;
    if (!home) throw new Error("mgd: HOME is not set");
    return home;
}

// Per-agent GLOBAL skills dir (cwd-independent). Honour each tool's env override
// so non-default homes/config roots work and tests can redirect into a temp dir.
function globalBase(agent: AgentName, env: NodeJS.ProcessEnv): string {
    switch (agent) {
        case "claude":
            return path.join(homeDir(env), ".claude", "skills");
        case "codex":
            // Current Codex discovers global (user-level) skills in
            // ~/.agents/skills (project skills live in <repo>/.agents/skills).
            // This is NOT under CODEX_HOME. See legacyCodexGlobalDir() for the
            // location older mgd versions used.
            return path.join(homeDir(env), ".agents", "skills");
        case "opencode":
            return path.join(
                env.XDG_CONFIG_HOME || path.join(homeDir(env), ".config"),
                "opencode",
                "skills"
            );
    }
}

// Where mgd <= 6.1.x installed the GLOBAL Codex skill: ${CODEX_HOME:-~/.codex}/skills.
// Codex does not discover skills there, so we clean it up on install/uninstall to
// avoid leaving an orphaned, undiscovered copy behind.
function legacyCodexGlobalDir(env: NodeJS.ProcessEnv): string {
    return path.join(
        env.CODEX_HOME || path.join(homeDir(env), ".codex"),
        "skills",
        SKILL_SUBDIR
    );
}

// Per-agent PROJECT skills dir (each tool's native project location).
function projectBase(agent: AgentName, projectDir: string): string {
    switch (agent) {
        case "claude":
            return path.join(projectDir, ".claude", "skills");
        case "codex":
            return path.join(projectDir, ".agents", "skills");
        case "opencode":
            return path.join(projectDir, ".opencode", "skills");
    }
}

export function resolveSkillDir(opts: {
    agent: AgentName;
    scope: Scope;
    projectDir: string;
    env: NodeJS.ProcessEnv;
}): string {
    const base =
        opts.scope === "global"
            ? globalBase(opts.agent, opts.env)
            : projectBase(opts.agent, opts.projectDir);
    return path.join(base, SKILL_SUBDIR);
}

// --agent omitted => all agents; a given value must be a known agent.
export function parseAgents(value: string | undefined): AgentName[] {
    if (value === undefined) return [...AGENT_NAMES];
    if (!AGENT_NAMES.includes(value as AgentName)) {
        throw new UsageError(
            `Unknown agent "${value}". Expected one of: ${AGENT_NAMES.join(
                ", "
            )}.`
        );
    }
    return [value as AgentName];
}

// Locate the shipped skills/ folder relative to this module: "../skills/" for the
// esbuild bundle at bin/mgd.js, "../../skills/" for the TS source under tsx.
export function packageSkillsDir(): string {
    for (const rel of ["../skills/", "../../skills/"]) {
        const dir = fileURLToPath(new URL(rel, import.meta.url));
        if (existsSync(path.join(dir, "SKILL.md"))) return dir;
    }
    throw new Error("mgd: could not locate the package skills/ directory");
}

export async function installSkill(opts: {
    agent: AgentName;
    scope: Scope;
    projectDir: string;
    skillsDir: string;
    env: NodeJS.ProcessEnv;
}): Promise<InstallResult> {
    const dir = resolveSkillDir(opts);
    const action = existsSync(dir) ? "updated" : "created";
    await fs.mkdir(dir, { recursive: true });
    for (const name of BUNDLE) {
        await fs.copyFile(
            path.join(opts.skillsDir, name),
            path.join(dir, name)
        );
    }
    if (opts.agent === "codex" && opts.scope === "global") {
        await removeLegacyCodexGlobal(dir, opts.env);
    }
    return {
        agent: opts.agent,
        scope: opts.scope,
        dir,
        files: [...BUNDLE],
        action
    };
}

export async function uninstallSkill(opts: {
    agent: AgentName;
    scope: Scope;
    projectDir: string;
    env: NodeJS.ProcessEnv;
}): Promise<InstallResult> {
    const dir = resolveSkillDir(opts);
    const existed = existsSync(dir);
    if (existed) await fs.rm(dir, { recursive: true, force: true });
    let legacyRemoved = false;
    if (opts.agent === "codex" && opts.scope === "global") {
        legacyRemoved = await removeLegacyCodexGlobal(dir, opts.env);
    }
    return {
        agent: opts.agent,
        scope: opts.scope,
        dir,
        files: [],
        action: existed || legacyRemoved ? "removed" : "absent"
    };
}

// Remove the legacy global Codex skill copy, unless it happens to resolve to the
// same path as the current install dir (never true today, but keep it safe).
// Returns whether a legacy copy was actually removed.
async function removeLegacyCodexGlobal(
    currentDir: string,
    env: NodeJS.ProcessEnv
): Promise<boolean> {
    const legacy = legacyCodexGlobalDir(env);
    if (legacy === currentDir || !existsSync(legacy)) return false;
    await fs.rm(legacy, { recursive: true, force: true });
    return true;
}
