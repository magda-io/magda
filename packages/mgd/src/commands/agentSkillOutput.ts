import type { AgentSkillSyncResult } from "../agentSkillTypes.js";
import { note, printData, resolveMode } from "../output.js";

/** Upper bound on per-skill problems reported to Agent Manager. */
export const WORKSPACE_STATUS_MAX_PROBLEMS = 20;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * The bounded summary Agent Manager stores as the Workspace's last-run skill
 * sync status. It carries no local paths, harness names, conflict details or
 * remote messages: only counts, whether remote preparation failed (so no
 * installed skill changed), and up to WORKSPACE_STATUS_MAX_PROBLEMS skill
 * names with a stable reason code.
 */
export function workspaceStatusSummary(result: AgentSkillSyncResult) {
    const problems = result.items
        .filter((item) => item.action === "failed" || item.action === "skipped")
        .map((item) => ({
            name: SAFE_NAME.test(item.name) ? item.name : "unnamed",
            action: item.action as "failed" | "skipped",
            code: item.code && SAFE_CODE.test(item.code) ? item.code : "UNKNOWN"
        }));
    return {
        status: result.status,
        counts: result.counts,
        manifestWarnings: result.manifestWarnings,
        ...(result.remoteSourceFailed ? { remoteSourceFailed: true } : {}),
        problems: problems.slice(0, WORKSPACE_STATUS_MAX_PROBLEMS),
        ...(problems.length > WORKSPACE_STATUS_MAX_PROBLEMS
            ? { problemsTruncated: true }
            : {})
    };
}

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
            opts.workspaceStatus ? workspaceStatusSummary(result) : result,
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
        if (item.code === "INSTALLATION_SOURCE_UNAVAILABLE")
            note(
                `  - ${item.name}: the shared skill you installed is no longer available to you (sharing was revoked or it was deleted). Clean installed copies were removed; uninstall it with \`mgd agent-skill uninstall ${item.name}\`.`
            );
        if (item.code === "CACHED_NOT_ACTIVATED")
            note(
                `  Profile "${item.name}" is not the globally active profile (or a one-off override is set); skills were cached but not installed.`
            );
    }
}
