import { Command } from "commander";
import { UsageError } from "../errors.js";
import { clientFor } from "../client.js";
import { WHOAMI } from "../endpoints.js";
import { loadConfig, saveConfig, resolveProfile } from "../profile.js";
import { promptText, promptHidden } from "../prompt.js";
import { note, colors, printData, resolveMode } from "../output.js";

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

export function registerAuthCommands(program: Command): void {
    const auth = program.command("auth").description("Authentication");

    auth.command("login")
        .description("Log in to a MAGDA site with an API key")
        .option("--url <url>", "MAGDA site or API base URL")
        .option("--key-id <id>", "API key ID")
        .option("--key <key>", "API key")
        .option("--profile <name>", "profile name", "default")
        .action(async (opts) => {
            note(
                "Create an API key in the MAGDA web UI (Settings -> API keys),\n" +
                    "then enter it below. Leave key fields empty for anonymous access.\n"
            );
            const rawUrl = opts.url || (await promptText("MAGDA site URL: "));
            const baseUrl = await normalizeBaseUrl(rawUrl, probeApi);
            const apiKeyId =
                opts.keyId ??
                (await promptText("API key ID (empty for anonymous): "));
            const apiKey = apiKeyId
                ? opts.key ?? (await promptHidden("API key: "))
                : "";

            const client = clientFor({
                baseUrl,
                apiKeyId: apiKeyId || undefined,
                apiKey: apiKey || undefined
            });
            const user = await client.json<any>("GET", WHOAMI);

            const cfg = await loadConfig();
            cfg.profiles[opts.profile] = {
                baseUrl,
                ...(apiKeyId ? { apiKeyId, apiKey } : {})
            };
            cfg.activeProfile = opts.profile;
            await saveConfig(cfg);

            note(
                colors.green(
                    `Logged in to ${baseUrl}` +
                        (user?.displayName
                            ? ` as ${user.displayName}`
                            : " (anonymous)") +
                        ` (profile "${opts.profile}").`
                )
            );
        });

    auth.command("status")
        .description("Show the active profile and authenticated user")
        .option("--json", "output JSON")
        .action(async (opts) => {
            const cfg = await loadConfig();
            const { name, profile } = resolveProfile(cfg);
            if (!profile?.baseUrl) {
                throw new UsageError(
                    "No active profile. Run `mgd auth login` or set MGD_BASE_URL."
                );
            }
            const client = clientFor(profile);
            const user = await client.json<any>("GET", WHOAMI);
            const authenticated = Boolean(profile.apiKeyId && user?.id);
            const status = {
                profile: name,
                baseUrl: profile.baseUrl,
                authenticated,
                user: authenticated
                    ? {
                          id: user.id,
                          displayName: user.displayName,
                          email: user.email,
                          orgUnitId: user.orgUnitId
                      }
                    : null
            };
            const mode = resolveMode(opts);
            if (mode === "human") {
                note(`Profile:       ${status.profile}`);
                note(`Base URL:      ${status.baseUrl}`);
                note(`Authenticated: ${status.authenticated}`);
                if (status.user) {
                    note(
                        `User:          ${status.user.displayName} (${status.user.id})`
                    );
                }
            } else {
                printData(mode, status);
            }
        });

    auth.command("logout")
        .description("Remove stored credentials for a profile")
        .option("--profile <name>", "profile name")
        .action(async (opts) => {
            const cfg = await loadConfig();
            const name = opts.profile || cfg.activeProfile || "default";
            const profile = cfg.profiles[name];
            if (!profile) throw new UsageError(`No such profile: ${name}`);
            delete profile.apiKeyId;
            delete profile.apiKey;
            await saveConfig(cfg);
            note(`Removed credentials from profile "${name}".`);
        });
}
