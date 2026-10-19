// Typed Agent Skill operations for MAGDA's managed DSH runtime (#3856).
//
// `mgd agent-skill publish|delete|sync|pull` update mgd state outside the DSH
// `workspace-write` sandbox (the profile's cached identity, verified caches
// and the operation lock, and $DSH_HOME/skills). Instead of asking the user to
// approve a generic Bash escalation, these narrow host-side operations run the
// existing `mgd` CLI with fixed subcommands and typed, validated arguments:
//
//   - no shell: `execFile` with an argv array; paths are validated and always
//     passed as absolute paths, references must match the publication ID form;
//   - the same nonroot Workspace user, the user's own mgd profile and API key;
//     mgd and Agent Services remain the only validation and authorization;
//   - publish/delete/forced sync run only when the model asserts the user has
//     already approved that action in chat (`userApproved: true`) or, within
//     the same call, the user selects the action in DSH's question UI;
//   - results are small structured objects. Raw process output and
//     credentials are never returned.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export const MAX_MESSAGE_CHARS = 600;
export const MAX_SYNC_ITEMS = 50;
const MAX_PATH_CHARS = 4096;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 240_000;
const INSTALL_MARKER = ".magda-skill-install.json";
const REF = /^(user|system)\/(agent-skill-[a-z0-9][a-z0-9-]{0,199})$/;

class ToolInputError extends Error {}

const REDACTIONS = [
    [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]"],
    [
        /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
        "[REDACTED-JWT]"
    ],
    [
        /((?:x-magda-(?:api-key(?:-id)?|session)|authorization|cookie|api[_-]?key|token|secret|password)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s"',;&]+)/gi,
        "$1[REDACTED]"
    ]
];

/** Bound and scrub a message before it reaches the model. */
export function sanitize(message) {
    let text = String(message ?? "");
    for (const [pattern, replacement] of REDACTIONS)
        text = text.replace(pattern, replacement);
    return text.length > MAX_MESSAGE_CHARS
        ? `${text.slice(0, MAX_MESSAGE_CHARS)}…`
        : text;
}

function within(root, target) {
    const relative = path.relative(root, target);
    return (
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative))
    );
}

function checkPathInput(value, field) {
    if (
        typeof value !== "string" ||
        !value ||
        value.length > MAX_PATH_CHARS ||
        value.includes("\0")
    )
        throw new ToolInputError(`${field} must be a non-empty path`);
}

const CONFIRMATION = {
    publish: {
        user: (name) => ({
            header: "Publish skill",
            question: `Publish the Agent Skill "${name}" to your MAGDA account? It will be saved as your user skill and can be reused in your future Agent Workspaces.`,
            confirm: "Publish",
            confirmDescription: `Publish "${name}" to your MAGDA account.`,
            cancelDescription: "Do not publish. The local draft is kept."
        }),
        system: (name) => ({
            header: "Publish system skill",
            question: `Publish "${name}" as a system Agent Skill? This is a system skill. Publishing it can make it available to other authorised MAGDA users and their Agent Workspaces, subject to system-skill visibility settings. By default that is users granted Agent Skill read access; it is never available to anonymous users.`,
            confirm: "Publish",
            confirmDescription: `Publish "${name}" as a system skill.`,
            cancelDescription: "Do not publish. The local draft is kept."
        })
    },
    delete: {
        user: (ref) => ({
            header: "Delete skill",
            question: `Delete the Agent Skill ${ref} from your MAGDA account? Future Workspaces will no longer receive it.`,
            confirm: "Delete",
            confirmDescription: `Delete ${ref}.`,
            cancelDescription: "Keep the published skill."
        }),
        system: (ref) => ({
            header: "Delete system skill",
            question: `Delete the system Agent Skill ${ref}? This is a system skill. Deleting it removes it for every authorised MAGDA user and their future Agent Workspaces.`,
            confirm: "Delete",
            confirmDescription: `Delete ${ref}.`,
            cancelDescription: "Keep the published skill."
        })
    },
    /**
     * The same single question when the caller asked to override optimistic
     * concurrency (`mgd --force`): it must say that newer remote changes are lost.
     */
    overwrite: {
        publish: (type, name) => ({
            header:
                type === "system"
                    ? "Overwrite system skill"
                    : "Overwrite skill",
            question: `Publish "${name}" and overwrite the newer version currently stored in MAGDA? Any changes made to that published version since your copy was created will be lost.${
                type === "system"
                    ? " This is a system skill, available to other authorised MAGDA users and their Agent Workspaces, subject to system-skill visibility settings; it is never available to anonymous users."
                    : ""
            }`,
            confirm: "Publish",
            confirmDescription: `Overwrite the published "${name}" with this copy.`,
            cancelDescription: "Do not publish. Nothing is overwritten."
        }),
        delete: (type, ref) => ({
            header:
                type === "system"
                    ? "Delete changed system skill"
                    : "Delete changed skill",
            question: `Delete ${ref} even though it has changed in MAGDA since this Workspace last saw it? The published skill, including those newer changes, will be removed.${
                type === "system"
                    ? " This is a system skill; it will be removed for every authorised MAGDA user and their future Agent Workspaces."
                    : ""
            }`,
            confirm: "Delete",
            confirmDescription: `Delete ${ref}, including its newer remote changes.`,
            cancelDescription: "Keep the published skill."
        })
    },
    forceSync: () => ({
        header: "Replace local changes",
        question:
            "Synchronise your Agent Skills and replace locally modified installed copies with the published versions? Local edits to those installed copies will be lost.",
        confirm: "Replace",
        confirmDescription: "Discard local edits to installed skills.",
        cancelDescription: "Do not synchronise."
    })
};

/**
 * Ask once through DSH's question UI. Only an explicit selection of the
 * action proceeds; cancel, custom text, dismissal, abort or a missing
 * answerer never do.
 */
async function confirmAction(ask, text) {
    if (typeof ask !== "function")
        return { confirmed: false, reason: "unavailable" };
    let answer;
    try {
        answer = await ask([
            {
                id: "confirm",
                header: text.header,
                question: text.question,
                options: [
                    {
                        label: text.confirm,
                        description: text.confirmDescription
                    },
                    { label: "Cancel", description: text.cancelDescription }
                ]
            }
        ]);
    } catch (error) {
        const code = error?.code;
        return {
            confirmed: false,
            reason: code === "ASK_ABORTED" ? "aborted" : "unavailable"
        };
    }
    const item = answer?.answers?.find((entry) => entry.id === "confirm");
    const selected = Array.isArray(item?.selected) ? item.selected : [];
    if (!item?.custom && selected.length === 1 && selected[0] === text.confirm)
        return { confirmed: true };
    return {
        confirmed: false,
        reason: selected.includes("Cancel") ? "declined" : "not-confirmed",
        ...(item?.custom ? { userComment: sanitize(item.custom) } : {})
    };
}

function parseJson(text) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return undefined;
    try {
        return JSON.parse(trimmed);
    } catch {
        const last = trimmed.split("\n").pop();
        try {
            return JSON.parse(last);
        } catch {
            return undefined;
        }
    }
}

function errorSummary(error) {
    return {
        ...(typeof error?.status === "number" ? { status: error.status } : {}),
        code: sanitize(error?.code || "error"),
        message: sanitize(error?.message || "mgd failed")
    };
}

function rejectionGuidance(status, operation) {
    if (status === 409)
        return "The server rejected this because a publication with that name already exists. Ask the user for a different name, or update the existing skill from a pulled or installed copy. Do not overwrite another publication.";
    if (status === 412)
        return "The publication changed remotely since this copy was taken. Pull it again and reconcile the changes; overwrite only if the user explicitly asks.";
    if (status === 401 || status === 403)
        return `The server refused this ${operation} for the current user. Report that it is not permitted; do not retry another way.`;
    if (status === 404)
        return "The publication was not found. Nothing was changed.";
    return `The server rejected this ${operation}. Nothing was changed by this request. Report the reason; do not retry automatically.`;
}

/**
 * Turn a failed mgd write (publish or delete) into an accurate outcome:
 * - uncertain: the request may already have been applied remotely;
 * - rejected: the server explicitly refused it (4xx);
 * - failed: it failed before the change was sent.
 */
export function classifyWriteFailure(run, operation) {
    const error = parseJson(run.stderr)?.error;
    if (run.interrupted || (!error && run.started))
        return {
            outcome: "uncertain",
            error: {
                code: run.interrupted ? "interrupted" : "unparseable-result",
                message: run.interrupted
                    ? `mgd was stopped (${run.interrupted}) before reporting a result.`
                    : "mgd ended without a recognisable result."
            },
            guidance: `The ${operation} may or may not have been applied remotely. Do not repeat it automatically. When the service is reachable, verify the publication with \`mgd agent-skill show <type>/<id>\` before reporting success or failure.`
        };
    if (error?.outcome === "unknown")
        return {
            outcome: "uncertain",
            error: errorSummary(error),
            ...(error.details?.target
                ? { target: sanitizeTarget(error.details.target) }
                : {}),
            guidance: `The ${operation} request may already have been applied by the server, so its result is unknown. Report this to the user promptly. Do not resend it, and do not immediately query a service that appears to be unavailable. Later, when the service is reachable, you may verify with \`mgd agent-skill show <type>/<id>\` that the publication's type, ID, owner and checksum match the target before reporting success; otherwise say the result is still unknown.`
        };
    if (
        typeof error?.status === "number" &&
        error.status >= 400 &&
        error.status < 500
    )
        return {
            outcome: "rejected",
            error: errorSummary(error),
            guidance: rejectionGuidance(error.status, operation)
        };
    return {
        outcome: "failed",
        error: errorSummary(
            error || { code: "error", message: "mgd could not run" }
        ),
        guidance:
            error?.code === "network-error"
                ? `The MAGDA service could not be reached before the ${operation} was sent; nothing was changed. Try again later.`
                : `The ${operation} failed before anything was sent to MAGDA; nothing was changed. Fix the reported problem first.`
    };
}

function sanitizeTarget(target) {
    const result = {};
    for (const key of ["operation", "type", "id", "name", "checksum"])
        if (typeof target?.[key] === "string")
            result[key] = sanitize(target[key]);
    return result;
}

function publicationOf(value) {
    const result = {};
    for (const key of [
        "type",
        "id",
        "name",
        "checksum",
        "updatedAt",
        "updatedBy",
        "ownerId"
    ])
        if (typeof value?.[key] === "string") result[key] = value[key];
    return result;
}

/**
 * @param options.mgdBin - mgd executable (default `/usr/local/bin/mgd`).
 * @param options.workspaceRoot - the only tree draft/pull paths may use.
 * @param options.skillsRoot - installed-skill root (`$DSH_HOME/skills`).
 * @param options.env - environment for mgd (the Workspace user's own).
 */
export function createAgentSkillOperations(options = {}) {
    const env = options.env ?? process.env;
    const mgdBin = options.mgdBin ?? env.MAGDA_MGD_BIN ?? "/usr/local/bin/mgd";
    const workspaceRoot = path.resolve(
        options.workspaceRoot ?? "/data/workspace"
    );
    const skillsRoot = path.resolve(
        options.skillsRoot ??
            path.join(env.DSH_HOME || "/data/agent-home", "skills")
    );
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    async function realRoot(root) {
        try {
            return await fs.realpath(root);
        } catch {
            return root;
        }
    }

    /** A Workspace draft directory or a marked installed copy, never a link. */
    async function skillDirectory(input, cwd) {
        checkPathInput(input, "path");
        const absolute = path.resolve(cwd || workspaceRoot, input);
        let stat;
        try {
            stat = await fs.lstat(absolute);
        } catch {
            throw new ToolInputError(`${input} does not exist`);
        }
        if (stat.isSymbolicLink() || !stat.isDirectory())
            throw new ToolInputError(`${input} must be a real skill directory`);
        const real = await fs.realpath(absolute);
        if (within(await realRoot(workspaceRoot), real)) return real;
        const skills = await realRoot(skillsRoot);
        if (path.dirname(real) === skills) {
            try {
                const marker = await fs.lstat(path.join(real, INSTALL_MARKER));
                if (marker.isFile()) return real;
            } catch {
                // fall through
            }
        }
        throw new ToolInputError(
            `${input} is outside the Workspace; only Workspace drafts and installed skill copies can be used`
        );
    }

    /** A new directory inside the Workspace for `pull`. */
    async function newWorkspaceDirectory(input, cwd) {
        checkPathInput(input, "output");
        const absolute = path.resolve(cwd || workspaceRoot, input);
        const base = path.basename(absolute);
        if (!base || base === "." || base === "..")
            throw new ToolInputError("output must name a new directory");
        let parent;
        try {
            parent = await fs.realpath(path.dirname(absolute));
        } catch {
            throw new ToolInputError(
                `The parent directory of ${input} does not exist`
            );
        }
        if (!within(await realRoot(workspaceRoot), parent))
            throw new ToolInputError(`${input} is outside the Workspace`);
        const target = path.join(parent, base);
        try {
            await fs.lstat(target);
            throw new ToolInputError(`${input} already exists`);
        } catch (error) {
            if (error instanceof ToolInputError) throw error;
        }
        return target;
    }

    function reference(value) {
        const match = typeof value === "string" ? REF.exec(value) : null;
        if (!match)
            throw new ToolInputError(
                "ref must look like user/agent-skill-… or system/agent-skill-…"
            );
        return { ref: value, type: match[1] };
    }

    /** Run mgd with a fixed argv; never through a shell. */
    function mgd(args, signal) {
        return new Promise((resolve) => {
            try {
                execFile(
                    mgdBin,
                    args,
                    {
                        cwd: workspaceRoot,
                        env: { ...env, NO_COLOR: "1" },
                        timeout: timeoutMs,
                        killSignal: "SIGTERM",
                        maxBuffer: MAX_OUTPUT_BYTES,
                        windowsHide: true,
                        shell: false,
                        ...(signal ? { signal } : {})
                    },
                    (error, stdout, stderr) => {
                        if (
                            typeof error?.code === "string" &&
                            String(error.syscall || "").startsWith("spawn")
                        )
                            return resolve(notStarted(error));
                        let interrupted;
                        if (error?.name === "AbortError")
                            interrupted = "aborted";
                        else if (error?.killed || error?.signal)
                            interrupted = "timed out or killed";
                        else if (
                            error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
                        )
                            interrupted = "output too large";
                        resolve({
                            started: true,
                            code:
                                typeof error?.code === "number"
                                    ? error.code
                                    : error
                                    ? 1
                                    : 0,
                            ok: !error,
                            stdout,
                            stderr,
                            ...(interrupted ? { interrupted } : {})
                        });
                    }
                );
            } catch (error) {
                resolve(notStarted(error));
            }
        });
    }

    function notStarted(error) {
        return {
            started: false,
            ok: false,
            stdout: "",
            stderr: JSON.stringify({
                error: {
                    code: "mgd-unavailable",
                    message: `mgd could not be started (${
                        error.code || error.message
                    })`
                }
            })
        };
    }

    function inputFailure(operation, error) {
        if (!(error instanceof ToolInputError)) throw error;
        return {
            operation,
            outcome: "failed",
            error: { code: "invalid-input", message: sanitize(error.message) },
            guidance: "Nothing was run. Correct the arguments."
        };
    }

    function cancelled(operation, decision, extra = {}) {
        return {
            operation,
            outcome: "cancelled",
            reason: decision.reason,
            ...extra,
            ...(decision.userComment
                ? { userComment: decision.userComment }
                : {}),
            guidance:
                decision.reason === "declined"
                    ? `The user chose Cancel. Nothing was changed; do not ask again unless the user requests it.`
                    : `The user did not confirm (${decision.reason}). Nothing was changed.`
        };
    }

    return {
        async publish(args, context = {}) {
            const operation = "publish";
            let directory;
            const type = args?.type ?? "user";
            try {
                if (type !== "user" && type !== "system")
                    throw new ToolInputError('type must be "user" or "system"');
                directory = await skillDirectory(args?.path, context.cwd);
            } catch (error) {
                return inputFailure(operation, error);
            }
            const validation = await mgd(
                [
                    "agent-skill",
                    "validate",
                    directory,
                    "--type",
                    type,
                    "--json"
                ],
                context.signal
            );
            const validated = validation.ok
                ? parseJson(validation.stdout)
                : undefined;
            if (!validated?.name)
                return {
                    operation,
                    outcome: "failed",
                    error: errorSummary(parseJson(validation.stderr)?.error),
                    guidance:
                        "The draft is not a valid Agent Skill. Nothing was sent to MAGDA. Fix the draft and validate it again."
                };
            const name = sanitize(validated.name);
            if (args?.userApproved !== true) {
                const decision = await confirmAction(
                    context.ask,
                    args?.overwriteRemoteChanges === true
                        ? CONFIRMATION.overwrite.publish(type, name)
                        : CONFIRMATION.publish[type](name)
                );
                if (!decision.confirmed)
                    return cancelled(operation, decision, { name, type });
            }
            const run = await mgd(
                [
                    "agent-skill",
                    "publish",
                    directory,
                    "--type",
                    type,
                    "--json",
                    ...(args?.overwriteRemoteChanges === true
                        ? ["--force"]
                        : [])
                ],
                context.signal
            );
            const published = run.ok ? parseJson(run.stdout) : undefined;
            if (published?.id && published?.checksum)
                return {
                    operation,
                    outcome: "published",
                    publication: publicationOf(published),
                    localCache:
                        published.localCache === "updated"
                            ? "updated"
                            : "failed",
                    guidance:
                        published.localCache === "updated"
                            ? "The server confirmed the publication. Future Workspaces will synchronise it; run magda_agent_skill_sync to install it in this Workspace."
                            : "The server confirmed the publication, but local bookkeeping failed. Report a successful publication with a local-cache warning; do not publish it again. A later sync repairs the local cache."
                };
            return {
                operation,
                name,
                type,
                ...classifyWriteFailure(run, operation)
            };
        },

        async delete(args, context = {}) {
            const operation = "delete";
            let target;
            try {
                target = reference(args?.ref);
            } catch (error) {
                return inputFailure(operation, error);
            }
            if (args?.userApproved !== true) {
                const decision = await confirmAction(
                    context.ask,
                    args?.overwriteRemoteChanges === true
                        ? CONFIRMATION.overwrite.delete(target.type, target.ref)
                        : CONFIRMATION.delete[target.type](target.ref)
                );
                if (!decision.confirmed)
                    return cancelled(operation, decision, { ref: target.ref });
            }
            const run = await mgd(
                [
                    "agent-skill",
                    "delete",
                    target.ref,
                    "--json",
                    ...(args?.overwriteRemoteChanges === true
                        ? ["--force"]
                        : [])
                ],
                context.signal
            );
            const deleted = run.ok ? parseJson(run.stdout) : undefined;
            if (deleted?.deleted === true)
                return {
                    operation,
                    outcome: "deleted",
                    ref: target.ref,
                    localCache:
                        deleted.localCache === "failed" ? "failed" : "updated",
                    guidance:
                        "The server confirmed the deletion. Run magda_agent_skill_sync to remove this Workspace's installed copy."
                };
            return {
                operation,
                ref: target.ref,
                ...classifyWriteFailure(run, operation)
            };
        },

        async sync(args, context = {}) {
            const operation = "sync";
            const force = args?.force === true;
            if (force && args?.userApproved !== true) {
                const decision = await confirmAction(
                    context.ask,
                    CONFIRMATION.forceSync()
                );
                if (!decision.confirmed) return cancelled(operation, decision);
            }
            const run = await mgd(
                [
                    "agent-skill",
                    "sync",
                    "--json",
                    ...(force ? ["--force"] : [])
                ],
                context.signal
            );
            const result = parseJson(run.stdout);
            if (!result?.status)
                return {
                    operation,
                    outcome: "failed",
                    error: errorSummary(parseJson(run.stderr)?.error),
                    guidance:
                        "Synchronisation did not complete. Installed skills are unchanged unless the result says otherwise."
                };
            const items = Array.isArray(result.items) ? result.items : [];
            return {
                operation,
                outcome: result.status,
                counts: result.counts,
                items: items.slice(0, MAX_SYNC_ITEMS).map((item) => ({
                    name: sanitize(item.name),
                    action: sanitize(item.action),
                    ...(item.code ? { code: sanitize(item.code) } : {}),
                    ...(item.path ? { path: sanitize(item.path) } : {})
                })),
                ...(items.length > MAX_SYNC_ITEMS
                    ? { moreItems: items.length - MAX_SYNC_ITEMS }
                    : {})
            };
        },

        async pull(args, context = {}) {
            const operation = "pull";
            let target;
            let output;
            try {
                target = reference(args?.ref);
                output = await newWorkspaceDirectory(args?.output, context.cwd);
            } catch (error) {
                return inputFailure(operation, error);
            }
            const run = await mgd(
                [
                    "agent-skill",
                    "pull",
                    target.ref,
                    "--output",
                    output,
                    "--json"
                ],
                context.signal
            );
            const pulled = run.ok ? parseJson(run.stdout) : undefined;
            if (pulled?.id)
                return {
                    operation,
                    outcome: "pulled",
                    publication: publicationOf(pulled),
                    directory: output,
                    guidance:
                        "This is a tracked working copy. Edits stay local until the user approves publishing it again."
                };
            const error = parseJson(run.stderr)?.error;
            // mgd extracts before it records pull provenance, so a failure can
            // leave a complete copy behind.
            let created = false;
            try {
                await fs.lstat(output);
                created = true;
            } catch {
                // not created
            }
            return {
                operation,
                outcome: "failed",
                error: errorSummary(error),
                directoryCreated: created,
                guidance: created
                    ? `mgd reported a failure, but ${output} now exists and may already contain the downloaded skill (a later local bookkeeping step can fail after extraction). Inspect it before trying again; retry into a different output directory, or remove that one first.`
                    : "Nothing was pulled; the output directory was not created."
            };
        }
    };
}
