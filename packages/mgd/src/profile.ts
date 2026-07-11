import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface Profile {
    baseUrl: string;
    apiKeyId?: string;
    apiKey?: string;
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
    await fs.writeFile(file, JSON.stringify(cfg, null, 2) + "\n", {
        mode: 0o600
    });
    // mkdir/writeFile modes don't apply if dir/file pre-existed — enforce:
    await fs.chmod(path.dirname(file), 0o700);
    await fs.chmod(file, 0o600);
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
