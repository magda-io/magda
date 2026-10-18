import type { AgentSkillSyncResult } from "../agentSkillTypes.js";
import { note, printData, resolveMode } from "../output.js";

/** Shared sync/profile-switch reporting, so both use one conflict format. */
export function printAgentSkillSyncResult(
    result: AgentSkillSyncResult,
    opts: { json?: boolean; jsonl?: boolean; workspaceStatus?: boolean },
    label = "Agent Skill sync"
): void {
    const mode = resolveMode(opts);
    if (mode === "jsonl") {
        printData(mode, result, [
            {
                kind: "summary",
                status: result.status,
                counts: result.counts,
                manifestWarnings: result.manifestWarnings
            },
            ...(result.conflicts || []).map((conflict) => ({
                kind: "conflict",
                ...conflict
            })),
            ...result.items
        ]);
        return;
    }
    if (mode !== "human") {
        printData(
            mode,
            opts.workspaceStatus
                ? {
                      status: result.status,
                      counts: result.counts,
                      manifestWarnings: result.manifestWarnings
                  }
                : result,
            result.items
        );
        return;
    }
    note(
        `${label}: ${result.status.toUpperCase()} ${JSON.stringify(
            result.counts
        )}`
    );
    if (result.conflicts?.length) {
        note(`${result.conflicts.length} path(s) need attention:`);
        for (const conflict of result.conflicts) {
            const source = conflict.source
                ? `\n    Installed source: ${
                      conflict.source.profiles?.join(", ") ||
                      [conflict.source.baseUrl, conflict.source.userId]
                          .filter(Boolean)
                          .join(" user ") ||
                      conflict.source.key.slice(0, 12)
                  }`
                : "";
            note(
                `  - ${conflict.name} [${conflict.harness}] ${conflict.path}${source}\n` +
                    `    ${conflict.reason}${
                        conflict.detail ? ` (${conflict.detail})` : ""
                    }: ${conflict.remedy}`
            );
        }
    }
    if (result.remoteSourceFailed) {
        for (const item of result.items)
            note(
                item.code === "DOWNLOAD_FAILED"
                    ? `  - ${item.name}: the current publication could not be downloaded or verified.`
                    : `  - ${item.name}: ${item.code} (the manifest is incomplete).`
            );
        note(
            "No installed skill was changed (even with --force) and the previously verified cache was kept. Retry `mgd agent-skill sync` later."
        );
    }
    for (const item of result.items) {
        if (item.code === "CACHED_NOT_ACTIVATED")
            note(
                `  Profile "${item.name}" is not the globally active profile (or a one-off override is set); skills were cached but not installed.`
            );
    }
}
