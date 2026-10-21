// MAGDA-owned DSH system-prompt extension (#3856).
//
// The pinned DSH release builds its prompt from named sections. Every web agent
// preset mounts its own `@deepseek-ai/dsh-persona` row, which shadows the global
// `system-prompt` persona prefix/suffix, and Cordis patches can only replace a
// whole top-level row config. Rather than replacing either, this plugin adds
// one separately named global section. It leaves the DSH identity, presets,
// personas, tool guidance and environment sections untouched; a preset with a
// `complete` persona (e.g. `minimal`) keeps its exact prompt.
export const name = "magda-workflow-capture-guidance";
export const inject = ["systemPrompt"];

export const SECTION_NAME = "magda:workflow-capture-suggestions";
// After first-party tool guidance (< 9900) and before the structured-output and
// environment-bearing suffix sections (>= 9900). Static text keeps the prompt
// prefix cache stable.
export const SECTION_ORDER = 9800;

export const GUIDANCE = `# Reusable workflows in MAGDA Agent Workspace

This Workspace can save a completed workflow as a reusable MAGDA Agent Skill with the bundled \`capture-workflow\` skill.

When you finish a task that meets **all** of these conditions, end your final reply with one short, optional question offering to save it, for example: "That workflow looks reusable. Would you like me to save it as an Agent Skill?"
- The task took several steps or tool calls (for example finding a dataset, downloading or transforming data, analysing it and checking the result), and you completed and verified it successfully.
- The same procedure could reasonably be reused with other inputs, such as another dataset, file, period or parameter, or the user said they do it regularly.
- It is not already a saved or synchronized Agent Skill, and you did not just follow one.
- You have not already made this offer in this conversation, and the user has not declined it.

Otherwise do not offer. In particular, do not offer after simple questions, explanations or single-command tasks; after failed, partial or unverified work; more than once per conversation; in the middle of a task; or when you are a subagent. Put the offer after the results, keep it to one sentence, and do not repeat it.

An offer is not consent. Start capturing only when the user asks, by loading the \`capture-workflow\` skill, and never publish a skill without the user's explicit approval of that skill.`;

export function apply(ctx) {
    ctx.effect(
        () =>
            ctx.systemPrompt.section({
                name: SECTION_NAME,
                order: SECTION_ORDER,
                text: GUIDANCE,
                interpolate: false
            }),
        "magda workflow-capture guidance"
    );
}
