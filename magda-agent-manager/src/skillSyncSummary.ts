import { SkillSyncCounts, SkillSyncProblem } from "./types.js";

/** Upper bound on per-skill problems kept in claim metadata and responses. */
export const SKILL_SYNC_MAX_PROBLEMS = 20;

const COUNT_KEYS: Array<keyof SkillSyncCounts> = [
    "installed",
    "updated",
    "unchanged",
    "removed",
    "skipped",
    "failed"
];
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

export interface SkillSyncSummary {
    status: "success" | "partial" | "failed";
    counts: SkillSyncCounts;
    remoteSourceFailed: boolean;
    problems: SkillSyncProblem[];
    problemsTruncated: boolean;
}

export function parseSkillSyncCounts(
    value: unknown
): SkillSyncCounts | undefined {
    if (!value || typeof value !== "object") return undefined;
    const counts = value as Record<string, unknown>;
    if (
        !COUNT_KEYS.every(
            (key) =>
                Number.isSafeInteger(counts[key]) &&
                (counts[key] as number) >= 0
        )
    ) {
        return undefined;
    }
    return (Object.fromEntries(
        COUNT_KEYS.map((key) => [key, counts[key]])
    ) as unknown) as SkillSyncCounts;
}

/**
 * Keep only well-formed problem entries with a safe skill name and stable
 * reason code. The Sandbox is user-controlled, so its output never reaches
 * the browser unvalidated: no paths, messages or extra fields survive.
 */
export function sanitizeSkillSyncProblems(value: unknown): SkillSyncProblem[] {
    if (!Array.isArray(value)) return [];
    const problems: SkillSyncProblem[] = [];
    for (const item of value) {
        if (problems.length >= SKILL_SYNC_MAX_PROBLEMS) break;
        if (!item || typeof item !== "object") continue;
        const { name, action, code } = item as Record<string, unknown>;
        if (
            typeof name !== "string" ||
            !SAFE_NAME.test(name) ||
            (action !== "failed" && action !== "skipped") ||
            typeof code !== "string" ||
            !SAFE_CODE.test(code)
        ) {
            continue;
        }
        problems.push({ name, action, code });
    }
    return problems;
}

/** Validate `mgd agent-skill sync --json --workspace-status` output. */
export function parseSkillSyncSummary(output: string): SkillSyncSummary {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const counts = parseSkillSyncCounts(parsed?.counts);
    if (
        (parsed.status !== "success" &&
            parsed.status !== "partial" &&
            parsed.status !== "failed") ||
        !counts
    ) {
        throw new Error("Invalid Agent Skill sync result");
    }
    const rawProblems = Array.isArray(parsed.problems) ? parsed.problems : [];
    return {
        status: parsed.status,
        counts,
        remoteSourceFailed: parsed.remoteSourceFailed === true,
        problems: sanitizeSkillSyncProblems(rawProblems),
        problemsTruncated:
            parsed.problemsTruncated === true ||
            rawProblems.length > SKILL_SYNC_MAX_PROBLEMS
    };
}
