/**
 * Runtime-owned Agent Skill names that Registry-backed publications,
 * installation aliases and synchronized copies must not claim.
 *
 * The names below predate the `magda-builtin-` convention. Runtime-bundled
 * skills introduced since then use that prefix, which is reserved as a whole.
 */
export const RESERVED_RUNTIME_SKILL_NAMES: ReadonlySet<string> = new Set([
    "capture-workflow",
    "magda-mgd",
    "python-dependencies"
]);

/** Prefix reserved for runtime-bundled Agent Skills. */
export const RESERVED_RUNTIME_SKILL_PREFIX = "magda-builtin-";

export function isReservedAgentSkillName(name: string): boolean {
    return (
        RESERVED_RUNTIME_SKILL_NAMES.has(name) ||
        name.startsWith(RESERVED_RUNTIME_SKILL_PREFIX)
    );
}
