# Agent skills: persistence, publication and agent workflow

**Status:** Design direction agreed for v8 follow-on work; not yet implemented by the Agent Workspace MVP #3850  
**Owner:** #3811 / epic #3810 (create implementation tickets after design review)  
**Depends on:** #3822–#3825 (Sandbox, Manager, auth), existing MAGDA Storage API/MinIO, DSH skill discovery, `mgd` CLI  
**Related:** [Agent platform overview](./README.md), [authentication](./authentication.md), [Sandbox lifecycle](./session-lifecycle.md), Storage API metadata bug [#3853](https://github.com/magda-io/magda/issues/3853)

This document records the agreed **initial skill-system architecture**. It replaces the earlier assumption that Agent Manager has a database or that every globally shared, code-bearing skill must be baked into the runtime image. Skill CRUD/storage are **not part of the completed #3850 MVP**.

## Goals and terminology

- Preserve reusable agent instructions/workflows **outside** a disposable Agent Workspace/PVC, across resets, logout and new Sandboxes.
- Keep **one managed Sandbox per user per Magda installation**, while allowing multiple DSH **sessions/conversations** within that Sandbox. Skill persistence is independent of session history.
- Enable the user to ask the agent to create, review, update, publish, download, synchronize or delete skills using `mgd`; no new management UI initially.
- DSH's read-only file explorer can display downloaded skill files. A user/agent may modify local copies with DSH's file/bash tools, but this **does not publish** their edits to MAGDA.
- Encourage converting completed, repeatable workflows into skills instead of relying on long-lived conversation history or a Sandbox as durable storage.

## Three skill categories

| Category | Source of truth | Publisher | Allowed skill files | Available to | Execution authority |
| --- | --- | --- | --- | --- | --- |
| **Runtime-bundled skills** | Pinned `magda-agent-runtime` image | Runtime developers/release process | Markdown, reviewed scripts/resources | Every agent runtime using that image | Current user |
| **System skills** | Published ZIP in default MAGDA bucket | MAGDA administrators | `SKILL.md` plus arbitrary regular supporting files, including scripts and ML models | All MAGDA users | Current user |
| **User skills** | Published ZIP in default MAGDA bucket | Owning MAGDA user | **Markdown files only**, including `SKILL.md` and optional `.md` references | Owner only | Current user |

All skills execute through the **same DSH tool/sandbox/approval policy** and with the **current user's MAGDA API key**, not with admin, publisher or storage credentials. System skills are reusable shared functions/instructions, **not a privileged agent** or a way to grant extra Magda permissions. The user, including an admin user, remains responsible for choosing an appropriately authorised account and reviewing DSH approvals.

An administrator may deliberately bundle code or a model into a system skill; provide guidance that very large assets slow every new Sandbox and may be better fetched on demand. User skills cannot include binary/code attachments: a Markdown skill may instead instruct the agent to download models/scripts/data from a MAGDA dataset or other authorised resource when needed. Such downloaded tools still run under normal DSH permissions.

Runtime-bundled skills (not Storage API system skills) include the immutable **`capture-workflow`** skill and the MAGDA/`mgd` agent guidance. They are versioned by the runtime image release, not by the published-skill API.

## Storage: existing default bucket, direct MinIO client

**No new bucket.** Reuse the deployment's pre-created/configured **default MAGDA bucket**, including deployments using MinIO as a gateway to S3/GCS/Azure-compatible backends; don't add a cloud-provider bucket-creation dependency. The bucket/prefix are configured through Helm. Keep skill keys under an isolated logical prefix:

```text
<default-magda-bucket>/
  agent-services/skills/
    system-skills/<skill-id>.zip
    user-skills/<authenticated-user-uuid>/<skill-id>.zip
```

One published skill is **one ZIP object** containing a root `SKILL.md` and its allowed supporting files. Publication uploads/replaces the entire object, so users never fetch a partially rewritten bundle; ZIP extraction reconstructs the skill directory for DSH. An update may reupload the entire archive. Unlike a directory of separate objects, no per-file atomic transaction or separate manifest/current-version pointer is needed.

The trusted **Magda Agent Services skill API** directly uses the same MinIO S3-compatible Node client/config/credentials pattern already used by `magda-storage-api`. MinIO credentials reside only in Agent Services via deployment Secrets; **never** pass bucket credentials to user Sandboxes or `mgd`. The server has prefix listing, get/stat, put and delete. Users access published skills only through Agent Services, with MAGDA authentication.

**No extra Agent Manager database, Registry aspect or custom skill metadata index in v1.** Use MinIO listing under the narrow system/user prefixes. Parse the archive's `SKILL.md` frontmatter for `name` and `description`; derive `id`, `scope`, and `owner` from the canonical object key. Return these fields, current ETag/checksum and basic object timestamps via the skill API. Optimize/catalogue in Registry later only if justified by real catalogue/search requirements.

**No mandatory immutable history or application-level versions in v1.** Each key holds the latest published ZIP; a later update replaces it. Use an ETag/checksum for sync, freshness and preferably conditional overwrite/conflict detection (e.g. `If-Match` semantics or equivalent server-side check), not a `versions/currentVersion` design. Last-writer-wins is an explicit simplification only if concurrent-update safety is consciously accepted. Operators who require historic revisions or recovery may enable **bucket versioning at the underlying cloud-storage provider**; Agent Services does not provide a separate history UI/API or log-storage database initially.

## Authorization, validation and audit

Agent Services **independently** authorizes every skill operation. Its MinIO calls bypass the Storage API's OPA middleware, so don't assume Storage API's policy runs on direct MinIO calls.

- **System:** every authenticated MAGDA user can list/download; **only an existing MAGDA admin** may create/update/delete published system skills. Admin authority is the normal current user's authority, including for an admin's DSH agent using `mgd`. No separate system-skill publishing identity or special agent privilege.
- **User:** list/download/create/update/delete only in the **authenticated caller's own** `user-skills/<uuid>/` namespace. Construct the object key on the server from authenticated user ID, never from a caller-supplied owner UUID or arbitrary raw storage path.
- Use existing MAGDA permission/role mechanisms. Validate every `skill-id` and scope; restrict all operations to `agent-services/skills/`. Set canonical stored `magda-owner-id` metadata from the authenticated creator/publisher rather than trusting user-supplied object metadata. Storage API currently writes `magda-user-id` but reads `magda-owner-id`; that separate inconsistency is tracked by **#3853**.
- Validate ZIP and `SKILL.md` frontmatter before publication. Reject absolute/parent-traversal paths, symlinks/hardlinks/device entries, zip bombs, duplicate/case-colliding entries and invalid names. Apply configurable total-size, file-count and compression/extraction limits; user scope admits only Markdown regular files.
- Enforce uniqueness of the **DSH-visible skill name** across runtime-bundled, system and user skill roots so local/provider precedence cannot silently shadow an existing trusted skill; report collisions and require renaming.
- Log simple **system-skill mutations** in the Agent Services Pod logs, e.g. `userId=<uuid> action=created|updated|deleted scope=system skillId=<id>` with outcome/time. **No file contents/diffs, separate audit DB or app-managed version history required.** Operators configure normal log collection/retention and optional storage-bucket versioning if they need greater history.
- Admin-authored system skills are treated as trusted for shared use, but still obey regular DSH execution restrictions and MAGDA per-user auth. A local modification never grants the ability to publish to the shared system prefix.

## API responsibilities (illustrative, not final route names)

Under `/api/v0/agent/skills`, Agent Services supplies:

| Operation | Example | Behaviour |
| --- | --- | --- |
| List | `GET /skills?scope=system|user|all` | Authenticated user's published skill catalogue: system + own user skills |
| Read metadata | `GET /skills/:id` | Scope, name, description, checksum, changed time |
| Download | `GET /skills/:id/download` | Stream one ZIP, optionally conditional on current ETag |
| Create | `POST /skills` | Validate/authenticate and create one ZIP |
| Publish update | `PUT /skills/:id` | Replace ZIP, preferably with stale-edit detection |
| Delete | `DELETE /skills/:id` | Delete the published object after owner/admin check |

Concrete routes must disambiguate scope when IDs may overlap (e.g. `/skills/:scope/:id`); the table is a conceptual interface. Do not expose raw MinIO object keys as an authorization mechanism. The API returns clear not-found/forbidden/conflict responses and logs system mutations.

## `mgd` as the interface

Keep the existing `mgd skills install/uninstall` commands: they install **`mgd`'s coding-agent guidance** and are not the published-skill catalogue. Add a distinct `mgd agent-skill` command family, usable with the same MAGDA credential configuration inside a Sandbox or on a local computer:

```shell
mgd agent-skill list [--scope system|user|all]
mgd agent-skill show <scope>/<id>
mgd agent-skill pull <scope>/<id> [--output <dir>]
mgd agent-skill init <name> [--scope user|system]
mgd agent-skill validate <local-dir> [--scope user|system]
mgd agent-skill publish <local-dir> [--scope user|system] [--id <id>]
mgd agent-skill delete <scope>/<id>
mgd agent-skill sync [--scope system|user|all]
```

Exact flags and spelling can be refined in the implementation ticket. **`user` is the default publish scope**; system publication is admin-only, explicitly requested, and subject to the same user authorization as all other Magda operations. The CLI implements archive validation, authenticated API calls, checksums, conflict notices, sync and safe local working-copy handling.

### Agent-led draft, review and publish

The workflow is prescribed by an immutable MAGDA/`mgd` bundled skill. The agent is responsible for keeping the user informed and requesting confirmation before publishing consequential changes; there is **no dedicated skill-editor UI** in v1.

Example conversation:

> **User:** Can you save the dataset cleaning and visualization process we've just completed as a reusable skill?
>
> **Agent:** I've reviewed our work and created a local draft `analyse-datasets/SKILL.md` with the reusable steps, inputs and prerequisites. It is saved **only in this Workspace** so far. Please review it using the file explorer or ask me to show/edit it. Let me know when you'd like to publish it.
>
> **User:** Looks good. Publish it.
>
> **Agent:** Published `analyse-datasets` to your MAGDA user skills. It will be downloaded into new Agent Workspaces. You can refresh an existing Workspace with `mgd agent-skill sync`.

The skill can direct the agent to `mgd agent-skill init`, write/edit Markdown locally, `mgd agent-skill validate`, show a review/summary and finally `mgd agent-skill publish`. The agent should **not** claim publication before the API confirms success. Prompt-level confirmation and existing DSH approval rules apply; the system does **not** introduce a separate admin credential/publisher role or approval database.

Local changes to downloaded **system skills are allowed** (for experimenting/customizing), but are never global until an authorized admin explicitly publishes. A non-admin may copy/adapt that logic into a new **user** Markdown-only skill, without changing the shared original. A local user's Bash/file explorer edits are **not automatically synced or published**.

## Workspace bootstrap, discovery and manual sync

A warm KAS Sandbox is user-unassigned and must contain **no user-specific skills**. On first claim, Agent Manager bootstraps the user's MAGDA credential and **then** downloads the current published system skills and that user's user skills **before marking the Workspace READY**. This is part of post-claim bootstrap and should not recreate the Sandbox. The runtime-bundled skill set is already present in the pinned runtime image and needs no MinIO download.

Download/extract files into DSH-discoverable directories using the pinned runtime's `dsh-skill-filesystem` config (`customSkillDirs` or standard skill roots), with explicit collision handling. Recommended layout (illustrative, configure actual discoverable roots):

```text
/data/workspace/.agents/skills/
  system-spatial-analysis/SKILL.md
  system-spatial-analysis/scripts/run.py
  user-analyse-datasets/SKILL.md
```

DSH can use filesystem skills as normal, and its **read-only file explorer** may display the local files. A user may edit them through the DSH/Bash tools; editing locally changes what that **current Sandbox** sees but does not change the object in MinIO. On the next Workspace creation, the last published object is downloaded again.

`mgd agent-skill sync` compares remote objects with local published-state checksums, downloads changes, and removes published skills deleted remotely; it must **not silently overwrite unsaved local edits**. Warn/refuse on conflict or require an explicit `--force`; do not discard user-created drafts. Other computers can publish via `mgd` and tell the user to sync the active Workspace rather than destroy it. DSH's filesystem provider watches skill files, so new/changed catalog entries should be visible on the next model step without DSH restart; verify this on MAGDA's pinned DSH version. Include safe behavior if sync/bootstrap fails: show an actionable error/retry rather than silently serving a misleading partial catalogue.

System administrators decide which supporting assets to package. Document that bundling large models makes **every Workspace** slower/larger; prefer a skill that fetches a heavyweight asset on demand via authenticated MAGDA datasets or another suitable resource when possible. No generic lazy-download framework is required initially.

## Capture a completed workflow

The **runtime-bundled immutable `capture-workflow`** skill tells DSH how to extract reusable procedures, parameterise dataset IDs/URLs/paths, document prerequisites, avoid embedding credentials/private data, draft Markdown, request review, validate, and publish via `mgd agent-skill`.

MAGDA's configured DSH **system-prompt suffix** may **occasionally** suggest saving a successful, substantial, repeatable workflow; avoid repetitive offers, failed/incomplete/simple tasks, and automatic publication. The system prompt governs **when to suggest**, while the bundled skill/`mgd` governs **how to capture and save**. The feature is initially conversational, without new interactive buttons or a skill-editor frontend.

The agent first tries the available conversation context and outputs. DSH's persisted, append-only **session event history lives on the current user's Workspace PVC**, including earlier turns and compaction records; model-visible context may have been compacted. If significant steps are missing/uncertain, optionally inspect whether compaction occurred, then selectively read relevant events. Do **not** load the whole history automatically just because compaction occurred: summaries may be sufficient, and history can be useful even without compaction.

If direct agent access to the local session log is not practical, implement a small **local read-only** helper limited to the current Workspace PVC/own DSH session, without any cross-user access or launch-token exposure. A helper is a deferred convenience, not a prerequisite to building the skill storage API.

## Implementation phases and non-goals

1. **Backend:** Agent Services skill routes + admin/owner authentication/authorization, MinIO default-bucket prefix listing and ZIP CRUD, canonical owner metadata, limits/validation, ETags and Pod-log audit events.
2. **CLI/runtime:** `mgd agent-skill` operations, first-claim skill sync, safe manual sync/local drafts, correct DSH skill discovery and viewable files. Test warm adoption, reset, multiple DSH sessions and local-vs-published edits.
3. **Capture UX:** bundled `capture-workflow`, system-prompt suggestion, agent-led review/publish flow, selective session-history reading when needed.

No initial skill Registry aspect, skill DB, special privileged system-skill executor, skill history service, standalone skill UI/editor, mandatory new storage bucket, or separate system-skill approval workflow. These can be reconsidered with evidence and later requirements.

## Qualification checklist

- [ ] Authenticated ordinary user: list/download all system skills, create/read/update/delete only own user skill, cannot mutate system/another user's objects even with a forged owner ID or arbitrary path.
- [ ] Admin: publish/update/delete system skill; system changes produce concise user/action/skill-id Pod-log events without file contents; everyone sees current published copy.
- [ ] User ZIP rejects non-Markdown entries, script/binary payloads, traversal, symlinks, duplicate entries and oversized archives; system ZIP accepts regular scripts/models within configured limits.
- [ ] Single-object update is atomic; sync detects remote changes and preserves uncommitted local edits; collision policy prevents silent shadowing.
- [ ] Warm Sandbox is user-neutral; post-claim bootstrap fetches correct system+user skills before READY; second user never receives another's skill; restart and new Sandbox preserve published state.
- [ ] A Bash/local edit of either system or user skill is **not** persisted without explicit publish; local edits may still affect DSH immediately in that Sandbox.
- [ ] `capture-workflow` guides draft -> review -> explicit user confirmation -> API publish, does not leak private tokens or claim success before completion; compaction/history fallback tested if implemented.
- [ ] Cloud-backed MinIO gateway works with the **existing** deployment default bucket (no extra bucket creation), and direct MinIO credentials never enter a Sandbox.
