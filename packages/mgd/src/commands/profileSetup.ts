import { UsageError } from "../errors.js";
import { clientFor } from "../client.js";
import { WHOAMI } from "../endpoints.js";
import { loadConfig, saveConfig, Profile } from "../profile.js";
import { promptText, promptHidden } from "../prompt.js";
import { note, colors } from "../output.js";
import {
    commitAgentSkillProfileTransition,
    recoverAgentSkillProfileTransition
} from "../agentSkillProfileTransition.js";
import { withAgentSkillStateLock } from "../agentSkillState.js";
import type { AgentSkillSourceIdentity } from "../agentSkillLocalState.js";

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

export async function normalizeBaseUrl(
    input: string,
    probe: (baseUrl: string) => Promise<boolean>
): Promise<string> {
    const trimmed = input.replace(/\/+$/, "");
    const candidates = [trimmed];
    if (!/\/api$/.test(new URL(trimmed).pathname)) {
        candidates.push(`${trimmed}/api`);
    }
    for (const candidate of candidates) {
        if (await probe(candidate)) return candidate;
    }
    throw new UsageError(
        `Could not find a MAGDA API at ${input} (tried: ${candidates.join(
            ", "
        )}).`
    );
}

async function probeApi(baseUrl: string): Promise<boolean> {
    try {
        const res = await fetch(`${baseUrl}${WHOAMI}`, {
            headers: { accept: "application/json" }
        });
        const contentType = res.headers.get("content-type") || "";
        return contentType.includes("json");
    } catch {
        return false;
    }
}

/** Field flags shared by `profile create`, `profile update` and `auth login`. */
export interface CredentialOptions {
    url?: string;
    keyId?: string;
    key?: string;
}

/** Verify a profile's credentials against the API and return the whoami user. */
async function verifyCredentials(profile: Profile): Promise<any> {
    const client = clientFor(profile);
    return client.json<any>("GET", WHOAMI);
}

function identityLabel(user: any): string {
    return user?.displayName ? ` as ${user.displayName}` : " (anonymous)";
}

/**
 * Create a new profile. Prompts for any of url/key-id/key not supplied, verifies
 * the credentials, refuses to overwrite an existing profile, and makes the new
 * profile active. Shared by `mgd profile create` and the deprecated `auth login`.
 */
export async function createProfile(
    name: string,
    opts: CredentialOptions
): Promise<void> {
    await recoverAgentSkillProfileTransition();
    const cfg = await loadConfig();
    if (cfg.profiles[name]) {
        throw new UsageError(
            `Profile "${name}" already exists. ` +
                `Use \`mgd profile update ${name}\` to change it, or ` +
                `\`mgd profile remove ${name}\` first.`
        );
    }

    note(
        "Create an API key in the MAGDA web UI (Settings -> API keys),\n" +
            "then enter it below. Leave key fields empty for anonymous access.\n"
    );
    const rawUrl = opts.url || (await promptText("MAGDA site URL: "));
    const baseUrl = await normalizeBaseUrl(rawUrl, probeApi);
    const apiKeyId =
        opts.keyId ?? (await promptText("API key ID (empty for anonymous): "));
    const apiKey = apiKeyId
        ? opts.key ?? (await promptHidden("API key: "))
        : "";

    const profile: Profile = {
        baseUrl,
        ...(apiKeyId ? { apiKeyId, apiKey } : {})
    };
    const user = await verifyCredentials(profile);

    await withAgentSkillStateLock(async () => {
        await recoverAgentSkillProfileTransition({ alreadyLocked: true });
        const latest = await loadConfig();
        if (latest.profiles[name]) {
            throw new UsageError(
                `Profile "${name}" was created concurrently; retry with another name.`
            );
        }
        const previousName = latest.activeProfile || "default";
        const previousIdentity = cachedIdentity(latest.profiles[previousName]);
        latest.profiles[name] = profile;
        latest.activeProfile = name;
        await commitAgentSkillProfileTransition(
            {
                fromProfile: previousName,
                fromSource: previousIdentity,
                toProfile: name,
                finalConfig: latest
            },
            { alreadyLocked: true }
        );
    });

    note(
        colors.green(
            `Created profile "${name}" for ${baseUrl}${identityLabel(user)}.`
        )
    );
}

/**
 * Update an existing profile, patching ONLY the supplied url/key-id/key fields
 * (no prompting). Verifies the resulting credentials before saving. Errors if
 * the profile does not exist or if no field was supplied.
 */
export async function updateProfile(
    name: string,
    opts: CredentialOptions
): Promise<void> {
    if (
        opts.url === undefined &&
        opts.keyId === undefined &&
        opts.key === undefined
    ) {
        throw new UsageError(
            "Nothing to update. Supply at least one of --url, --key-id, --key."
        );
    }

    await recoverAgentSkillProfileTransition();
    const cfg = await loadConfig();
    const existing = cfg.profiles[name];
    if (!existing) {
        throw new UsageError(
            `No such profile: ${name}. ` +
                `Use \`mgd profile create ${name}\` to create it.`
        );
    }

    const next: Profile = { ...existing };
    if (opts.url !== undefined) {
        next.baseUrl = await normalizeBaseUrl(opts.url, probeApi);
    }
    if (opts.keyId !== undefined) next.apiKeyId = opts.keyId;
    if (opts.key !== undefined) next.apiKey = opts.key;
    // An empty key id means anonymous access — drop both credential fields.
    if (!next.apiKeyId) {
        delete next.apiKeyId;
        delete next.apiKey;
    }

    const user = await verifyCredentials(next);
    // Credentials or URL may now resolve to another tenant/account. Never reuse
    // a previously verified Agent Skill source until the next online sync.
    delete next.agentSkillSource;

    await withAgentSkillStateLock(async () => {
        await recoverAgentSkillProfileTransition({ alreadyLocked: true });
        const latest = await loadConfig();
        if (
            JSON.stringify(latest.profiles[name]) !== JSON.stringify(existing)
        ) {
            throw new UsageError(
                `Profile "${name}" changed concurrently; retry the update.`
            );
        }
        const updatesActive = (latest.activeProfile || "default") === name;
        latest.profiles[name] = next;
        if (updatesActive) {
            await commitAgentSkillProfileTransition(
                {
                    fromProfile: name,
                    fromSource: cachedIdentity(existing),
                    toProfile: name,
                    finalConfig: latest
                },
                { alreadyLocked: true }
            );
        } else {
            await saveConfig(latest);
        }
    });

    note(
        colors.green(
            `Updated profile "${name}" (${next.baseUrl}${identityLabel(user)}).`
        )
    );
}
