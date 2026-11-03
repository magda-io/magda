import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { UsageError } from "./errors.js";

export interface CachedAgentSkillSource {
    key: string;
    canonicalBaseUrl: string;
    tenantId: string;
    userId: string;
    verifiedAt: string;
}

export interface Profile {
    baseUrl: string;
    apiKeyId?: string;
    apiKey?: string;
    /** Last online-verified Agent Skill source identity for offline activation. */
    agentSkillSource?: CachedAgentSkillSource;
}

export interface ConfigFile {
    activeProfile?: string;
    profiles: Record<string, Profile>;
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
    const base =
        env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() !== ""
            ? env.XDG_CONFIG_HOME
            : path.join(os.homedir(), ".config");
    return path.join(base, "mgd", "config.json");
}

export async function loadConfig(
    env: NodeJS.ProcessEnv = process.env
): Promise<ConfigFile> {
    try {
        const raw = await fs.readFile(configPath(env), "utf8");
        const parsed = JSON.parse(raw);
        return { profiles: {}, ...parsed };
    } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT")
            return { profiles: {} };
        throw e;
    }
}

export async function saveConfig(
    cfg: ConfigFile,
    env: NodeJS.ProcessEnv = process.env
): Promise<void> {
    const file = configPath(env);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
        await handle.writeFile(JSON.stringify(cfg, null, 2) + "\n", "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
    // Apply directory permissions before the atomic rename. The temp file was
    // created 0600, so no fallible work remains after the commit point.
    await fs.chmod(path.dirname(file), 0o700);
    await fs.rename(temporary, file);
}

export function resolveProfile(
    cfg: ConfigFile,
    env: NodeJS.ProcessEnv = process.env
): { name: string; profile?: Profile } {
    const name = env.MGD_PROFILE || cfg.activeProfile || "default";
    const fromFile = cfg.profiles[name];
    const overridden: Profile | undefined =
        env.MGD_BASE_URL || fromFile
            ? {
                  baseUrl: env.MGD_BASE_URL || fromFile?.baseUrl || "",
                  apiKeyId: env.MGD_API_KEY_ID || fromFile?.apiKeyId,
                  apiKey: env.MGD_API_KEY || fromFile?.apiKey
              }
            : undefined;
    if (overridden && !overridden.apiKeyId) delete overridden.apiKeyId;
    if (overridden && !overridden.apiKey) delete overridden.apiKey;
    return {
        name: env.MGD_BASE_URL && !fromFile ? "env" : name,
        profile: overridden
    };
}

export interface ProfileSelection {
    name: string;
    profile?: Profile;
    configuredActiveProfile: string;
    oneOffOverride: boolean;
    mayPersistAgentSkillIdentity: boolean;
    mayActivateSkills: boolean;
}

export function resolveProfileSelection(
    cfg: ConfigFile,
    env: NodeJS.ProcessEnv = process.env
): ProfileSelection {
    const selected = resolveProfile(cfg, env);
    const configuredActiveProfile = cfg.activeProfile || "default";
    const oneOffOverride = Boolean(
        env.MGD_PROFILE ||
            env.MGD_BASE_URL ||
            env.MGD_API_KEY_ID ||
            env.MGD_API_KEY
    );
    const credentialOverride = Boolean(
        env.MGD_BASE_URL || env.MGD_API_KEY_ID || env.MGD_API_KEY
    );
    return {
        ...selected,
        configuredActiveProfile,
        oneOffOverride,
        mayPersistAgentSkillIdentity:
            !credentialOverride && Boolean(cfg.profiles[selected.name]),
        mayActivateSkills:
            !oneOffOverride && selected.name === configuredActiveProfile
    };
}

const ENV_HINT = "set MGD_BASE_URL/MGD_API_KEY_ID/MGD_API_KEY for a one-off.";

/**
 * Build a context-aware error for when no usable profile could be resolved.
 * Distinguishes "no profiles at all" from "profiles exist but none is active"
 * (and the special case of MGD_PROFILE naming an unknown profile) so the
 * message tells the user exactly what to do next.
 */
export function noProfileError(
    cfg: ConfigFile,
    env: NodeJS.ProcessEnv = process.env
): UsageError {
    const names = Object.keys(cfg.profiles);

    if (names.length === 0) {
        return new UsageError(
            "No profiles configured. Run `mgd profile create <name>` to get " +
                `started, or ${ENV_HINT}`
        );
    }

    const available = `Available profiles: ${names.join(", ")}.`;

    if (env.MGD_PROFILE) {
        return new UsageError(
            `Profile "${env.MGD_PROFILE}" (from MGD_PROFILE) not found. ` +
                available
        );
    }

    return new UsageError(
        "No active profile. Set one with `mgd profile use <name>`, or select " +
            `one per command via the MGD_PROFILE env var. ${available} ` +
            `Alternatively, ${ENV_HINT}`
    );
}
