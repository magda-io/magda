import { Command } from "commander";
import { clientFor } from "../client.js";
import { WHOAMI } from "../endpoints.js";
import { loadConfig, resolveProfile, noProfileError } from "../profile.js";
import { note, colors, printData, resolveMode } from "../output.js";
import { createProfile } from "./profileSetup.js";

// Re-exported for back-compat with existing imports/tests; the implementation
// now lives with the shared profile-setup helpers.
export { normalizeBaseUrl } from "./profileSetup.js";

export function registerAuthCommands(program: Command): void {
    const auth = program.command("auth").description("Authentication");

    auth.command("login")
        .description(
            "[deprecated] Set up a profile's credentials — use `mgd profile create <name>`"
        )
        .option("--url <url>", "MAGDA site or API base URL")
        .option("--key-id <id>", "API key ID")
        .option("--key <key>", "API key")
        .option("--profile <name>", "profile name", "default")
        .addHelpText(
            "after",
            "\nDeprecated alias of `mgd profile create <name>`. " +
                "Prefer `mgd profile create`, which takes the profile name as a\n" +
                "positional argument and refuses to overwrite an existing profile."
        )
        .action(async (opts) => {
            note(
                colors.yellow(
                    "`mgd auth login` is deprecated; use " +
                        "`mgd profile create <name>` instead."
                )
            );
            await createProfile(opts.profile, {
                url: opts.url,
                keyId: opts.keyId,
                key: opts.key
            });
        });

    auth.command("status")
        .description("Show the active profile and authenticated user")
        .option("--json", "output JSON")
        .action(async (opts) => {
            const cfg = await loadConfig();
            const { name, profile } = resolveProfile(cfg);
            if (!profile?.baseUrl) {
                throw noProfileError(cfg);
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
}
