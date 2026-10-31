/**
 * Runtime-owned Agent Skill names that Registry-backed publications,
 * installation aliases and synchronized copies must not claim.
 *
 * Keep this list explicit until the future `magda-builtin-` naming convention
 * is introduced; this module intentionally reserves no prefix today.
 */
export const RESERVED_RUNTIME_SKILL_NAMES: ReadonlySet<string> = new Set([
    "capture-workflow",
    "magda-mgd",
    "python-dependencies"
]);

export function isReservedAgentSkillName(name: string): boolean {
    return RESERVED_RUNTIME_SKILL_NAMES.has(name);
}
