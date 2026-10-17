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
                manifestWarnings: result.manifestWarnings,
                ...(result.blocked ? { blocked: true } : {})
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
    note(`${label} ${result.status}: ${JSON.stringify(result.counts)}`);
    if (result.conflicts?.length) {
        note(
            result.blocked
                ? `No installed skill was changed because ${result.conflicts.length} path(s) need attention:`
                : `${result.conflicts.length} path(s) need attention:`
        );
        for (const conflict of result.conflicts) {
            note(
                `  - ${conflict.name} [${conflict.harness}] ${conflict.path}\n` +
                    `    ${conflict.reason}${
                        conflict.detail ? ` (${conflict.detail})` : ""
                    }: ${conflict.remedy}`
            );
        }
    }
    for (const item of result.items) {
        if (item.code === "DOWNLOAD_FAILED")
            note(
                `  - ${item.name}: download or verification failed; the previously verified version (if any) was kept.`
            );
        if (item.code === "CACHED_NOT_ACTIVATED")
            note(
                `  Profile "${item.name}" is not the globally active profile (or a one-off override is set); skills were cached but not installed.`
            );
    }
    if (result.retainedPaths?.length) {
        note("Retained user data (not deleted; review and remove manually):");
        for (const item of result.retainedPaths) note(`  - ${item}`);
    }
}
