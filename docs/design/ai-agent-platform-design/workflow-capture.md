# Agent Workspace Stage 3 — workflow capture, publication consent and history retrieval

**Status:** Accepted final Stage-3 design decisions (2026-10-19), for [#3856](https://github.com/magda-io/magda/issues/3856) within **draft** implementation [#3850](https://github.com/magda-io/magda/pull/3850). This supplements [skills.md](./skills.md) and supersedes earlier Stage-3 descriptions where inconsistent. **Do not silently implement Stage 4 #3857 or sharing #3861.**

## 1. Product contract and scope

The Agent Workspace captures a completed successful reusable workflow as a **local Markdown Agent Skill draft**, allows the user to review/edit it, and publishes it to MAGDA **only after one meaningful approval**. Skill files in local drafts are ephemeral with the Workspace; server-published skills persist and become eligible for later Workspace sync.

- Keep the immutable runtime-bundled `capture-workflow` skill, DSH `0.2.1-alpha.1` (or currently pinned exact version), existing skill authorization/publication API, `mgd agent-skill` semantics and Stage-2 verified source/cache/provenance rules. No general skill editor, separate publication backend, DSH fork, policy database, or separate publisher role.
- Do **not** ask the user both to approve publication and to approve the execution engine's unrestricted Bash/filesystem escalation. Such double confirmation is poor UX.
- A **user skill** and a **system skill** use the **same publication tool and same selectable Publish/Cancel question UI**; only the **message content** changes to describe the system skill's wider effects. Existing Agent Services typed `object/agentSkill/system/*` permissions remain the **only** role/permission authorization gate. **No new system-skill-only dialog or secondary approval.**
- Keep distinct model-initiated suggestions: occasionally offer capture after a substantial, verified, repeatable successful task, but do not draft/publish automatically or bother the user after simple, failed or declined requests.

## 2. Trusted DSH tool rather than Bash escalation

The pinned DSH supports a deployment-owned Cordis host plugin registering typed model-facing tools with `ctx.tools.register(defineTool(...))`. Prefer a **small MAGDA-owned tool plugin** in the managed runtime over shifting `mgd` state, broadening the DSH `workspace-write` filesystem policy or adding Agent Manager APIs. It executes as the **existing nonroot user in that user's own Kubernetes Sandbox** (not a privileged host/cluster service).

- At minimum, provide a narrow `magda_agent_skill_publish` operation. As small integration permits, cover the remaining `mgd` skill lifecycle commands that currently need out-of-workspace state writes (`sync`, `pull`, `delete`), so agent-led use doesn't depend on generic Bash escalation. No arbitrary shell executor, arbitrary argv/env/command flags, arbitrary file-writing primitive, or new skill storage abstraction.
- Invoke the existing `mgd` CLI via `execFile`/`spawn` **without a shell**, fixed subcommand/arguments, from the trusted tool execution context **outside DSH's Bash sandbox**. Preserve normal `workspace-write` enforcement for all ordinary Bash/file commands; **do not** grant `danger-full-access` to the agent or change DSH's broad approval policy.
- The plugin should accept a small typed parameter set (e.g. draft/recognized installed path, `type: 'user'|'system'`, `userApproved?: boolean`, and the existing intended operation's necessary options); limit draft paths to the user's own Workspace working area or recognized installed paths; use existing `mgd` archive validation/name/path protections and the user's existing `mgd` profile and API key. Do not duplicate Agent Services/OPA authorization, introduce custom JWTs/audit DB, or reimplement ZIP validation.
- The tool returns a bounded structured result (publication `type/id/name/checksum`, outcome, optional local-cache status and sanitized error) to DSH. Never return user credentials, the full config file or arbitrary raw process output.
- `mgd` and Agent Services remain the single source of truth for source-account publication, optimistic concurrency, ZIP verification, and server authorization.

### Why the current sandbox causes a second prompt

The runtime's `workspace-write` sandbox permits writes to `/data/workspace` but not to `/data/config/mgd`, `/data/local/share/mgd` or `$DSH_HOME/skills`. `mgd agent-skill publish/sync/pull/delete` legitimately update those profile/cache/install paths. A generic Bash retry requests broader sandbox escalation and an unrelated technical confirmation. Trusted **typed** host tools can run those exact intended `mgd` operations under the existing nonroot Workspace identity without giving arbitrary Bash this access. This is not a claim that the filesystem-write sandbox protects credential *read* access; maintain the existing credential trust boundary.

## 3. One approval: model intent + existing selectable DSH question UI

**Decision:** Trust the model's conversational understanding of user approval for the MVP, including a proposed `userApproved: true` argument. Do not build a second rule-based/NLP consent interpreter, replay prior message history to independently prove English-language consent, mint signed approval tokens, or store approval records. The boolean is an explicit **model assertion**, **not cryptographically or independently verified consent**. We accept the residual model/prompt-injection error risk in the current controlled per-user Workspace, as with other model-decided actions.

The `capture-workflow` skill must still direct the agent to draft, validate, explain, show the local path, and **stop before publication**. It must not set `userApproved: true` unless it judges that the user clearly approved publishing **the specific reviewed draft**, not just drafting, editing, validating or discussing it. A clear current chat instruction (e.g. `Publish it`, `Save this to my MAGDA account` referring to that draft) is sufficient; no additional dialog.

- `userApproved: true` → the same trusted tool **publishes directly** via `mgd`, no extra dialog.
- `userApproved: false` or omitted → the **same tool invocation** calls existing DSH `ctx.userQuestions.ask()` (not `ctx.approval` Bash escalation) with a single **Publish / Cancel** choice. Execute only after the selectable UI returns the affirmative option; cancelling/closing/timeout/question unavailability must not publish. Do **not** ask the model to launch a second publish call after the answer.
- The existing DSH question UI is acceptable for MVP; no new modal UI or Web client fork is required. A dedicated modal can be reconsidered only if real UX testing shows the stock question card inadequate.
- For `type=user`, text identifies the skill name and that it will be saved to the current user's MAGDA account and available to future Workspaces.
- For `type=system`, **same UI and decision**, but explicitly state: **“This is a system skill. Publishing it can make it available to other authorised MAGDA users and their Workspaces, subject to system-skill visibility settings.”** Reflect the actual default publication visibility (e.g. constraint exemption for users with applicable authorized read permission); do not imply anonymous internet access. Existing backend permissions determine whether this user can publish. Do not add another dedicated confirmation or hard-code an “admin role” condition in the tool.
- If the model incorrectly sets approval because of untrusted content, this is an **accepted model-judgment risk**, not something purportedly prevented by provenance gates. Retain the skill's ordinary prompt-injection/credential hygiene instructions and negative behavioral evaluations. No automatic publication after suggesting capture.

**Example:**
```text
User: Capture that data-cleaning workflow as a skill.
Agent: [drafts, validates, describes skill-drafts/clean-data/SKILL.md] This is unpublished; review it.
User: Yes, publish it.
Agent: [magda_agent_skill_publish({ path: 'skill-drafts/clean-data', type: 'user', userApproved: true })]
Tool: Published user/<id> (<checksum>).
```
If the user did not already approve, the tool instead displays Publish/Cancel and executes within that **same** tool call after selection.

## 4. Publication errors: separate confirmed failure from uncertain remote state

- Confirmed server rejection (`400/401/403/409/412`) → report the rejection; do not reinterpret as success or immediately verify again.
- Failure definitely **before** an API request was sent (e.g. local validation, missing path, sandbox/CLI initialization) → report failure, no verification request.
- Timeout/reset/network failure after request may have been sent → **report the network error promptly, with publication status uncertain**. Never automatically resend create/replace/delete. **Do not reflexively invoke `list`/`show` against a server that appears unavailable**, since that adds latency with little information.
- If reachability is restored or a targeted lookup is likely useful, the agent **may** verify using `show` when the ID is known or `list` then `show` when not, with the intended **source account**, publication ID/type, ownership and checksum. If matched, report confirmed remote success; if not established, say uncertainty remains. This lookup is conditional, not an automatic step for every timeout.
- An API-confirmed remote publish with a subsequent **local cache/bookkeeping failure** remains a successful publication with a local warning, consistent with Stage 2. Do not accidentally create a duplicate during recovery.
- Do not make skill instructions claim “nonzero means no publication” or “missing returned ID means nothing was committed”; clarify the above cases.

## 5. Incremental, bounded current-Workspace history reader

Stage 3 introduced `magda-session-history`, a read-only current-user-PVC helper for DSH's `session.v4.jsonl.zstd` (concatenated Zstandard frames), with `list`, `outline` and `events`. Keep its existing purpose, format-version check, no-follow-symlinks restriction, no use of DSH launch token, useful event projection, best-effort secret redaction **before `--grep`**, and untrusted-output labeling. System prompts, request headers, reasoning, runtime-generated context and compaction checkpoints must **never** appear in output. Workflow capture must prefer current context and query history only for missing details.

**Refactor the full-file read → all-frames decompress-and-join → full JSONL split/parse → filter implementation** to incremental processing:

1. Read bounded file chunks and recognize complete DSH Zstandard frame boundaries with the **existing format-aware frame parser** (handle frames split across file-read chunks and a torn last frame conservatively).
2. Decompress **one verified complete frame at a time** with Node's existing `zstdDecompressSync` and a per-frame output cap. Native Node stream decoding for *concatenated* frames must not be assumed correct without regression tests on the **actual runtime Node version**. No new library unless this approach demonstrably cannot handle real DSH logs.
3. Incrementally decode UTF-8 and assemble **one complete JSONL row at a time**, preserving partial lines/Unicode across frame boundaries. Parse/project/filter/redact each selected event without retaining unrelated raw events. Apply `--grep` **after** redaction; never leak original sensitive values through search matches.
4. `events`: bounded matching results; read only until **limit+1** matching events (for accurate `nextFromSeq`) when semantics allow early exit, including query `--from-seq`, `--turn`, `--type`, `--grep`. `outline`: accumulate compact per-turn information without retaining raw events; scan more if necessary for correct counts. `list`: avoid decompressing every event in every session merely to obtain a header/title where a cheaper correct scan is possible.
5. Explicitly treat resource-bound exhaustion as an incomplete/failed query, **never an authoritative complete history**. Preserve closed session, torn-tail, unsupported format, read-only and no-follow protections. Keep compatibility with `DSH_SESSION_ID` and current-Workspace-only roots.

**Initial limits** (tune with real-session memory/latency benchmarks; values are ceilings, not targets):

| Budget | Previous | Initial streaming budget | Why |
| --- | ---: | ---: | --- |
| Compressed file eligible for query | 64 MiB | **256 MiB** | Long sessions needn't fail from file size alone; reading is incremental |
| One decoded Zstandard frame | 16 MiB | **32 MiB** | Bound in-memory frame materialization |
| Decoded bytes processed per query | No aggregate cap | **512 MiB** | CPU/work bound, not 512 MiB resident allocation |
| One complete JSONL row | No row cap | **16 MiB** | Bound row parsing and giant tool outputs; errors explicit |
| Events/page | 100 | **100** | Preserve compact output |
| Characters/event | 8,000 | **8,000** | Preserve model context limit |
| Total response | 64 KiB | **64 KiB** | Preserve model context limit |
| Turns/outline | 200 | **200** | Existing paging; don't load all results |
| Sessions discovered | 500 | **500** | Current isolation and list budget |

Retain defaults (20 events, 30 turns, 1,200 chars/event) unless benchmarks suggest a measured improvement. Treat the aggregate byte ceiling as **work processed**, not buffered at once; process one frame/row at a time. Protect compressed frame input boundaries and avoid allocating arbitrarily large read buffers. Test DSH actual frame format and multi-frame torn logs, early match/late match, huge irrelevant raw event, post-compaction history, huge row/frame and budgets, output redaction, pagination, peak resident memory and execution latency. A heavy `outline` may need more work than a targeted early-event request; resource limits still apply.

## 6. Suggestion guidance and qualification

Keep the **existing Stage-3 MAGDA Cordis system-prompt section** (`@magda/dsh-workflow-capture-guidance`) with explicit conditional, optional suggestions for substantial, **successfully completed and verified**, reusable work. It already forbids noisy offers on simple/failed/declined/already-saved cases. Do **not** duplicate this guidance, build a detector or add background services. Model variability is accepted; evaluate behavior, not deterministic phrasing.

**Acceptance/evidence to add to #3856 and PR #3850:**

- Bundled skill, prompt section, DSH discovery and user draft → review → publish still work; the new typed trusted plugin runs without Bash escalation or any second user confirmation; ordinary Bash remains sandboxed.
- Dialog-free publication when user **clearly approved in chat** and model invokes typed tool with `userApproved: true`; selectable **Publish/Cancel** appears when not approved. Cancellation, missing question UI and disconnection fail closed. One UI click continues the **same tool call**, no additional model step/Bash approval.
- Both `type=user` and `type=system` follow the **same interaction** and backend typed authorization. System dialog text explains broader authorised-user visibility. Test allowed and denied system cases (at least deterministic E2E or API integration); no extra role check or system-specific confirmation surface.
- Typed plugin cannot execute arbitrary CLI commands or publish arbitrary host paths; behaves with the same nonroot credentials and backend authorization; preserve Stage-2 `mgd` cache/source account behavior. Existing approval for draft creation/editing remains as needed, but not generic escalation for intended skill lifecycle operations.
- Ambiguous post-request network failure doesn't trigger blind retry/lookup on a down server; confirmed server rejection returns promptly; verified remote result after service recovery is source/type/ID/checksum-aware. Cache-after-publish failure remains an accurate successful publication with warning.
- Incremental history parsing/filters, no prompt/reasoning leaks, redaction before grep, long/multi-frame logs, torn tails, row/frame/work budgets, early pagination and realistic memory/latency measurements; no unnecessary new compressor library.
- Update user-facing runtime architecture/E2E documentation, deterministic runtime tests, realistic pinned DSH/gVisor Minikube interactions, `mgd`/Manager regressions and CI. **Keep #3850 draft** and request Stage-3 review before #3857/#3861.

## 7. Deliberately rejected complexity and trade-offs

- **No second generic Bash approval:** user's approval is about publishing, not about implementation details such as `mgd` cache/profile paths.
- **No second system-skill-specific confirmation or authz layer:** vary one dialog's explanation, reuse backend typed policy.
- **No model-parallel natural-language consent checker:** interpreting `yes, go ahead` requires conversational context and duplicates a model; accept model assertion risk. No signed tokens, consent store or approval-provenance subsystem.
- **No wider DSH Bash sandbox or credential-bearing `mgd` config relocation:** a trusted typed operation is more targeted, with existing account credentials and permissions.
- **No unconditional network follow-up on timeouts:** a second request to an unavailable service wastes time and may not establish remote state. Never blindly retry a possibly committed write.
- **No simplistic 64 MiB total-decompression-only patch:** it avoids a memory blow-up without making long history practical. Process incrementally; cap each frame, row, work performed and final output separately.
- **No extra capture suggestion prompt/heuristic service:** the existing conditional guidance already addresses discoverability and noise.

