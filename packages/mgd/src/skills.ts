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

export type AgentSkillTargetHarness =
    | "claude"
    | "codex"
    | "opencode"
    | "dsh"
    | "custom";

/** A flat harness skill root that receives independent real-directory copies. */
export interface AgentSkillTarget {
    root: string;
    harness: AgentSkillTargetHarness;
}

export interface InstallResult {
    agent: AgentName;
    scope: Scope;
    dir: string;
    files: string[];
    action: "created" | "updated" | "removed" | "absent";
}

// The whole magda-mgd/ folder is a managed unit: install replaces it, uninstall
// removes it. SKILL.md references its sibling reference files "in the same
// directory", so every *.md in the skills dir ships and installs together —
// globbed (not a hardcoded list) so new reference files are bundled
// automatically without editing this module.
const SKILL_SUBDIR = "magda-mgd";

// The skill files to install: every *.md in the source skills dir, sorted for a
// deterministic result.
async function bundleFiles(skillsDir: string): Promise<string[]> {
    const entries = await fs.readdir(skillsDir);
    return entries.filter((f) => f.endsWith(".md")).sort();
}

function homeDir(env: NodeJS.ProcessEnv): string {
    const home = env.HOME;
    if (!home) throw new Error("mgd: HOME is not set");
    return home;
}

// Per-agent GLOBAL skills root (cwd-independent). Honour each tool's env
// override so non-default homes/config roots work and tests can redirect into a
// temp dir. This is also shared by Agent Skill projection so its harness paths
// cannot drift from `mgd skills install`.
export function resolveGlobalSkillRoot(
    agent: AgentName,
    env: NodeJS.ProcessEnv
): string {
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

function commandExists(command: AgentName, env: NodeJS.ProcessEnv): boolean {
    return (env.PATH || "")
        .split(path.delimiter)
        .filter(Boolean)
        .some((directory) => existsSync(path.join(directory, command)));
}

function harnessIsInstalled(
    agent: AgentName,
    root: string,
    env: NodeJS.ProcessEnv
): boolean {
    return (
        existsSync(root) ||
        existsSync(path.dirname(root)) ||
        commandExists(agent, env)
    );
}

// Resolve the flat roots where synchronized Agent Skills are installed. Every
// target receives its own independent real-directory copy (no links). A
// caller-provided root is the Workspace/Sandbox contract and deliberately
// suppresses local multi-harness installation. Overlapping roots are kept once.
export function resolveAgentSkillTargets(opts: {
    env: NodeJS.ProcessEnv;
}): AgentSkillTarget[] {
    const { env } = opts;
    if (env.MGD_AGENT_SKILL_DIR) {
        return [
            { root: path.resolve(env.MGD_AGENT_SKILL_DIR), harness: "custom" }
        ];
    }

    const targets: AgentSkillTarget[] = AGENT_NAMES.map((agent) => ({
        harness: agent as AgentSkillTargetHarness,
        root: path.resolve(resolveGlobalSkillRoot(agent, env))
    })).filter(({ harness, root }) =>
        harnessIsInstalled(harness as AgentName, root, env)
    );
    if (env.DSH_HOME) {
        targets.push({
            root: path.resolve(env.DSH_HOME, "skills"),
            harness: "dsh"
        });
    }

    const deduplicated = new Map<string, AgentSkillTarget>();
    for (const target of targets) {
        if (!deduplicated.has(target.root))
            deduplicated.set(target.root, target);
    }
    return [...deduplicated.values()];
}

/** The single Workspace/Sandbox DSH root selected by the trusted runtime. */
export function resolveWorkspaceAgentSkillTarget(
    env: NodeJS.ProcessEnv
): AgentSkillTarget {
    if (env.MGD_AGENT_SKILL_DIR)
        return {
            root: path.resolve(env.MGD_AGENT_SKILL_DIR),
            harness: "custom"
        };
    if (env.DSH_HOME)
        return { root: path.resolve(env.DSH_HOME, "skills"), harness: "dsh" };
    throw new Error(
        "Agent Workspace skill root is not configured (DSH_HOME or MGD_AGENT_SKILL_DIR)"
    );
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
            ? resolveGlobalSkillRoot(opts.agent, opts.env)
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
    // Replace the managed folder wholesale so files dropped from the bundle
    // (e.g. a reference file that was split or renamed) don't linger on upgrade.
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    const bundle = await bundleFiles(opts.skillsDir);
    for (const name of bundle) {
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
        files: bundle,
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
