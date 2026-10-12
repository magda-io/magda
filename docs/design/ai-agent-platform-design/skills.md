# Agent skills: Registry metadata, storage, access and user workflow

**Status:** Agreed updated design for the expanded Agent Workspace MVP #3849, implemented incrementally in draft PR #3850; **not yet shipped**  
**Implementation:** #3854 (Registry-backed skill API), #3855 (`mgd`/runtime bootstrap), #3856 (workflow capture), Agent Skills catalogue UI ticket (see #3849), and an independently tracked `agentWorkspace/access` authorization change  
**Design owner:** #3811 / epic #3810  
**Related:** [platform overview](./README.md), [authorization](./authentication.md), [web UI](./web-ui.md), [session lifecycle](./session-lifecycle.md), general Storage API owner-metadata bug [#3853](https://github.com/magda-io/magda/issues/3853)

## Product model and three categories

A user has **one current disposable Agent Workspace/Sandbox per MAGDA installation** but may have **multiple DSH sessions** in it. Reusable skills persist independently of both and survive deletion/recreation of the Sandbox. The agent can guide the user in creating, modifying and publishing skills; a dedicated **Agent Skills catalogue page** introduces the feature and shows published skills without requiring an active Workspace.

| Category | Authoritative location | Who publishes | Allowed archive contents | Discovery and execution |
| --- | --- | --- | --- | --- |
| **Runtime-bundled skills** | Pinned `magda-agent-runtime` image | MAGDA runtime maintainers | Image-bundled instructions/scripts/resources | Built into every runtime; **not** published Registry skill records |
| **System skills** | Agent skill Registry record + ZIP in existing default storage bucket | MAGDA admin users | Root `SKILL.md` and arbitrary regular supporting files, including Python scripts and ML models | Available to all authenticated users with system-skill read permission; **run as current user** |
| **User skills** | Agent skill Registry record + ZIP in existing default storage bucket | Owning MAGDA user | **Markdown-only regular files** (`SKILL.md` and optional Markdown references) | Initially only its owner; **run as current user** |

All three execute under the current user's normal MAGDA API key, DSH tools, Sandbox and approval policy. System skills are shared tools/instructions, **not** delegated administrator privilege. Users, including admins, remain responsible for approval requests and account permissions. Runtime-bundled skills include immutable `capture-workflow` and the `mgd` usage guidance; they are not managed by published-skill CRUD. Administrators should consider download/PVC costs before publishing large system ZIPs; recommend referencing MAGDA datasets and downloading large models/assets when needed, but do not implement generalized lazy loading in the MVP.

## Registry: authoritative published skill catalogue

**Definition:** An **agent skill record** is a MAGDA Registry record containing the **`agent-skill`** aspect and the regular **`access-control`** aspect. Registry is authoritative for skill identity, discoverability, ownership, metadata, pagination and access controls. **Not** an extra Agent Manager database. A Registry aspect schema is added under `magda-registry-aspects/agent-skill.schema.json` and installed with the other built-in aspects.

Proposed semantic fields (refine schema validation in #3854):

| Field | Type / source | Rules |
| --- | --- | --- |
| Registry `record.id` | Stable ID generated/assigned by backend | Primary skill identifier; matches the storage object's record link, unchanged by archive updates |
| Registry `record.name` | Parsed `SKILL.md` frontmatter `name` | Set/updated by skill publication, not edited independently through the catalogue UI |
| `agent-skill.scope` | `system` or `user` | Immutable once created in MVP; determines policy and storage namespace |
| `agent-skill.description` | Parsed `SKILL.md` description | Set/updated with published ZIP |
| `agent-skill.archiveKey` | Server-generated bucket-relative object key | Internal authoritative content locator, never a user-supplied storage path |
| `agent-skill.createdAt` | ISO 8601 UTC timestamp | Immutable; recorded on successful initial publication |
| `agent-skill.createdBy` | Authenticated MAGDA user UUID | Immutable creator (can differ from owner later if sharing/delegation evolves) |
| `agent-skill.updatedAt` | ISO 8601 UTC timestamp | Last successful published ZIP change |
| `agent-skill.updatedBy` | Authenticated MAGDA user UUID | Last successful publisher; preferred spelling over `editedBy` |
| `agent-skill.checksum` | Published ZIP checksum/ETag | Used to detect changes and sync; no mandatory application version history |
| `agent-skill.status` | `PENDING` / `READY` / `DELETING` (or equivalent internal state) | Exclude non-`READY` records from normal catalogue and Workspace sync |

Registry `access-control.ownerId` identifies the skill owner; it is **not** the same thing as `createdBy` or `updatedBy`. Initially system skill records are admin-managed and readable by all authorised users, and user skill records are owner-scoped. `access-control.preAuthorisedPermissionIds`, `orgUnitId` etc. remain available for **future sharing**, which is out of scope now.

The general Registry record has no built-in created/updated timestamps, so keep explicit timestamps in the `agent-skill` aspect. The ZIP's `SKILL.md` is the content source for name/description, but Registry metadata is the **query/read model** for listing, paging, searching, sorting and permissions. **No UI fields to independently change this metadata**; updates reparse the archive. When publishing changes, preserve `id`, `scope`, `createdAt`, `createdBy` and current ownership.

Use existing Registry ``GET /v0/registry/records`` filtered by the `agent-skill` aspect; the endpoint already supports `pageToken`, `limit`, optional `start`/`orderBy`, full-text `q` and aspect filters. Use paginated, authorization-filtered queries; do not fetch every archive to construct the list. Never include `PENDING` or `DELETING` skills in public discovery/Workspace sync. Runtime-bundled skills do not appear in the published skill record catalogue unless a later explicit feature is added.

## Storage: existing bucket and normal Storage API

**Do not create a new bucket or introduce Agent Services direct MinIO credentials.** Keep published ZIPs in the deployment's **existing default MAGDA bucket** via MAGDA **Storage API**, so deployments with MinIO gateway/S3/GCS/Azure backends do not require cloud bucket provisioning changes.

Server-selected bucket-relative keys retain the agreed convention:

```text
<existing-default-magda-bucket>/
  agent-services/skills/
    system-skills/<skill-record-id>.zip
    user-skills/<owner-uuid>/<skill-record-id>.zip
```

One published skill = **one complete ZIP object**, with a root `SKILL.md` and files allowed by the category. Replacing it is a whole-object upload; ZIP content remains easy to browse after extraction into the DSH skill directory. No application-level history or revision pointer; optional storage-provider bucket versioning is an operator choice. Checksum/ETag supports change detection and optional optimistic concurrency.

Each skill archive is linked to its Registry record using Storage API upload `recordId` and persisted object metadata:

```text
magda-record-id = <skill-registry-record-id>
magda-owner-id  = <publisher-user-uuid>   # canonical owner metadata; registry access-control remains authoritative
```

Storage API already reconstructs object + linked record context and delegates storage read/upload/delete decisions to the `object/record/*` OPA policy where applicable. Agent Services can authenticate as the **current caller** via the trusted, gateway-generated `X-Magda-Session` and invoke **Registry and Storage APIs** instead of a raw MinIO client. The session header must be trusted internal identity supplied by Gateway, never a spoofable browser header or elevated service/admin identity. A normal `mgd` API key is authenticated by the Gateway into its standard request identity. Direct callers may use ordinary authenticated Registry API and authorized **read/download** operations on Storage API as well.

**Important enforcement boundary:** Generic Storage API access does not itself validate ZIP contents or maintain Registry `name`/`description`/`updatedBy`/`checksum`/`status`. Publishing must be coordinated through the **Agent Services skill API**, and **the reserved `agent-services/skills/` prefix must not be arbitrarily writable/deletable through direct Storage API endpoints**. The implementation must enforce this at the Storage API/policy boundary (including bypass tests), while allowing authorized record-linked reads. Simply adding `magda-record-id` or checking user ownership is **not sufficient** to protect reserved prefixes or ZIP validation. Use a trusted Agent Services-mediated upload/delete mechanism to that prefix; define the minimum internal authority required in #3854, without exposing general bucket credentials. Treat this as a design contract rather than claiming the existing Storage API already enforces it.

## OPA: specialized skill and workspace permissions

Create `magda-opa/policies/object/agentSkill/allow.rego` plus routing under `magda-opa/policies/entrypoint/allow.rego`. **For records containing `agent-skill`, modify `magda-opa/policies/object/record/allow.rego` to delegate `object/record/*` decisions to `object/agentSkill/{operation}`. Crucially, exclude agent skill records from its generic fallback so a broad `object/record/*` grant cannot bypass granular skill policy.** Handle record creation with the proposed `agent-skill` aspect, record updates/aspect mutations (including attempted aspect deletion or scope/owner changes), and direct Registry API callers. This is essential, not simply adding a new allow.rego file.

Operations and initial permission model:

| Operation | Meaning | MVP grant |
| --- | --- | --- |
| `object/agentSkill/create` | Create an agent skill record | User-owned: authenticated principal with create permission. System scope: admin only |
| `object/agentSkill/read` | View record and linked skill contents | System: authenticated principal with system read permission. User: owner-scoped read. Later share via pre-authorized grants |
| `object/agentSkill/update` | Update current published archive/record | User: owner-scoped update. System: admin only |
| `object/agentSkill/delete` | Delete skill archive/record | User: owner-scoped delete. System: admin only |

Careful: a broadly **unconstrained** `object/agentSkill/read` grant used to view public-to-authenticated system skills must **not** automatically allow reading *all users' private skills*. The new OPA policy must be **scope-aware**: a system record may accept unconditional read, whereas a user record requires owner (or, later, explicitly delegated) access, with the admin override matching existing MAGDA conventions. Likewise, admin-only system writes and immutable scope/owner protections must be checked in the actual Registry/Agent Services path. Seed and test appropriate operation/resource/permission role assignments and migration defaults.

The Storage API's existing `storage/object/allow.rego` grants linked-object read if its associated Registry record is readable, and handles upload/delete via linked record create/update/delete; after specialized delegation is wired and correct new-record metadata is supplied, **a separate explicit `object/agentSkill/create` OPA call for an ordinary record-linked Storage API upload should usually be unnecessary**. Verify both upload handlers and the *before-and-after* authorization on replacement; the upload path is permitted only through the protected publishing flow described above. OPA storage object rules also have independent owner/unconstrained grants, so object access isn't automatically exactly equivalent to record access. Test the composed permissions, not just the ideal linked-record rule.

Create a separate `magda-opa/policies/agentWorkspace/allow.rego`, routed through the entrypoint, with **one operation: `agentWorkspace/access`**. Granting that permission lets an authenticated user create/start, inspect/access/resume and reset/terminate **only their own managed Agent Workspace**. Agent Manager derives the user UUID from the verified current request, **never** a caller-specified target. There is no admin-only hardcoded authorization gate after the operation is deployed; the existing admin role continues to work through MAGDA's administrator policy and/or seeded operation permission. Preserve one Workspace per user and all existing session/key ownership boundaries. Enforce the operation on **HTTP lifecycle, runtime HTTP and runtime WebSocket upgrade** paths, including any gateway accessControl requirements.

The Settings navigation may use `whoami` permissions for a **rough visibility check**:
- Show **Open Workspace** to users with `agentWorkspace/access` (and admins under existing admin role semantics).
- Show **Agent Skills** to users with a suitable `object/agentSkill/read` permission (and admins), independent of Workspace access.
- The parent **Agent Workspace** group appears when at least one child is visible.
- Real APIs/OPA decide authorization even if the browser shows/hides a menu incorrectly.

## Agent Services Skill API, workflow and consistency

Under the existing `/api/v0/agent/skills` namespace provide list (paginated, filtering by scope), read record metadata, download ZIP, create, update/replace published ZIP and delete; choose unambiguous `scope`/record ID routes. Agent Services is the validated, user-identity-preserving publishing **coordinator**, **not** a new storage gateway or an alternative authorization policy engine.

For create: derive the user principal/owner, validate ZIP/frontmatter/scope and authorization, create a typed agent skill Registry record (`PENDING`) with `access-control`, upload the ZIP via the protected Storage API with `recordId`, then set the record `READY` and authoritative content metadata. Return success **only when both stores are consistent**. For update: verify existing record permission and ownership, validate whole replacement ZIP, coordinate object replacement and metadata update, maintain stable record ID/created fields, ensure errors do not make half-updated skills appear usable. For delete: coordinate `DELETING`, archive deletion and record removal with safe retries. Because Registry and Storage are separate services, implement **idempotent retry/repair** for partial operations without a new transaction DB. Treat pending/deleting records as unavailable for catalogue and sync.

Every create/update ZIP runs the same validation whether invoked through `mgd`, browser upload or Agent Services API: Markdown-only for user skills; system skills may include regular scripts/models; reject traversal/absolute paths, symlinks/special entries, case/duplicate collisions, invalid DSH frontmatter, zip bombs and configured size/file limits. Checksum or ETag can detect stale edits; do not implement application-level version history. Log system-skill create/update/delete events to **Agent Services Pod logs** with actor UUID, skill record ID, operation, status/time, **not** archived file contents or diffs. User action uses ordinary DSH tool approvals; no special publisher or privileged execution identity.

## `mgd` and local draft → publish flow

Preserve existing `mgd skills install/uninstall` (coding-agent guidance). Add a distinct `mgd agent-skill` command family:

```shell
mgd agent-skill list [--scope system|user|all]
mgd agent-skill show <scope>/<id>
mgd agent-skill pull <scope>/<id> [--output <dir>]
mgd agent-skill init <name> [--scope user|system]
mgd agent-skill validate <local-dir> [--scope user|system]
mgd agent-skill publish <local-dir> [--scope user|system] [--id <id>]
mgd agent-skill delete <scope>/<id>
mgd agent-skill sync [--scope system|user|all] [--force]
```

The local directory is a **draft/working copy**; file edits do not publish to MAGDA automatically. On request, the agent creates/edits and validates locally, tells the user what it has drafted, asks them to inspect the file and explicitly approve publishing. Only then does `mgd` invoke the same skill API that the catalogue replacement upload uses. Existing user and admin role/owner rules apply. Safe manual sync should not overwrite unpublished local changes; stale remote edits should produce conflict guidance.

Example conversation:

> **User:** We've just cleaned up a CSV file with inconsistent column names and produced a new file with consistent headings. I often receive similar CSV files from different teams. Could you turn the procedure we worked through—including how we identified equivalent columns, resolved ambiguous names, and validated the resulting CSV—into a reusable skill that I can apply to future files?
>
> **Agent:** I've drafted a Markdown-only skill named `standardise-csv-columns` in the current Workspace. It describes the column-mapping steps, how to handle unknown headings, and how to check the output without assuming every CSV has the same columns. **This is a local draft; it hasn't been published to MAGDA.** Please review `standardise-csv-columns/SKILL.md` in the file explorer or ask me to show it, and tell me if you want any changes.
>
> **User:** Good. Publish it as one of my skills.
>
> **Agent:** I've published the skill to your MAGDA account. It will be available in new Agent Workspaces. To use the latest version in an already-running Workspace, ask me to resynchronise my skills, or run `mgd agent-skill sync`.

All publication success claims must wait for confirmed API completion.

## Workspace claim, sync and DSH discovery

A warm KAS Sandbox is unassigned and has **no** user-specific skills/credentials. Runtime-bundled skills are already in the pinned image. **After claim and user credential bootstrap, before READY**, the current user's Workspace downloads authorized published system + user ZIPs through the skill API, validates/extracts into DSH-discoverable directories on its own PVC. Sync filters Registry records via delegated per-record permissions and `READY` state; no arbitrary cross-user skills are downloaded.

Use an explicit collision-safe DSH-visible name policy across all skill roots and safe ZIP extraction with temp directories/rename. Verify DSH's pinned skill provider notices changes without restart. `mgd agent-skill sync` refreshes an existing Workspace without destroying the Sandbox/PVC/other sessions, never silently overwrites unpublished local edits, and reconciles remotely deleted skills. DSH's read-only file explorer shows local skill files; Bash may edit them locally, but changes are **not** published. Non-admin users may adapt system-skill instructions into their own Markdown-only user skills. Document large system assets/on-demand dataset references for administrators.

## User-facing Settings catalogue (no general skill editor)

Under Settings navigation, create **Agent Workspace** group with second-level **Open Workspace** (`/settings/agent-workspace`) and **Agent Skills** (`/settings/agent-workspace/skills` or an equivalent unambiguous route). The group itself is non-clickable with the current `SideNavigation.tsx` implementation; use child links. Authorization/visibility is independent per child as specified above.

The **Agent Skills** page is intentionally a discovery and education surface, not a new skill authoring interface. Include a prominent but concise explanation, an example of capturing a reusable workflow, and a normal link to **Open Workspace** when the current user has `agentWorkspace/access`. The introductory example should be concrete, like the CSV workflow above, **not** just “Save this workflow as a skill”. When Workspace access is unavailable, do not show an unusable action.

Show an authorized, paginated catalogue with **All / My Skills / System Skills** filter, optional search and the fields:
- Skill ID, name, description, type/scope, created at/by, updated at/by;
- Pagination and refresh backed by filtered/paginated Registry queries;
- **System skills:** metadata visible where authorized, **no ZIP download/upload/edit** in this UI initially;
- **User skills:** view metadata, **Download ZIP**, **Replace ZIP** for an *existing record only*, with appropriate permission. Replacement uses the **same Agent Services validation and publish path** as `mgd` and automatically updates parsed name, description, `updatedAt` and `updatedBy`, but keeps stable ID and creator fields.
- No Create skill upload, Delete, general metadata editor, binary system-skill editor or agent-coding interface in this UI. Creating/modifying/deleting skills through natural language and `mgd` remains the primary workflow.

After successful user ZIP replacement, tell the user that an active Workspace can have a stale local copy: **“Ask your agent to resynchronise your skills, or run `mgd agent-skill sync`.”** Do not claim automatic resync unless the implementation actually performs it. Use existing MAGDA UI pagination/layout patterns, accessible file-input/error states, and responsive Settings layout. Keep security checks server-side, not in menu visibility or hidden actions.

## Runtime-bundled workflow capture

`capture-workflow` is bundled immutably with `magda-agent-runtime` (not published in Registry or MinIO) and instructs DSH to inspect the successful work, identify reusable procedures, parameterize dataset IDs/paths/URLs, avoid credentials/private data, draft Markdown, request review and approval, then publish via `mgd`. A small configured MAGDA DSH system-prompt suffix may **occasionally suggest** converting a substantial, completed, reusable workflow into a skill; avoid offers for simple/failed work or repetitive prompts.

Start with context and working files. DSH session history is persisted on the current Workspace PVC; if an important detail is missing or context was compacted, selectively read relevant local events. Do not automatically load the full transcript solely because compaction occurred. A small local read-only current-PVC helper is acceptable if necessary; it need not and must not access other users' logs or expose a launch token.

## MVP implementation sequencing

Keep **the same draft implementation PR #3850**, test and review each stage before starting the next. Recommended separation:

1. **#3854 — Backend:** `agent-skill` aspect/schema, Registry + Storage API integration, `object/agentSkill/*` OPA routing, policy/record-linked object validation, published ZIP CRUD, consistency, tests, and operator permissions.
2. **#3855 — CLI/bootstrap:** `mgd agent-skill` commands, local draft/review/publish/sync, DSH skill discovery and user-scoped post-claim/bootstrap.
3. **#3856 — Capture:** runtime-bundled workflow capture skill, agent-led user approval, optional local session-history support, and selective prompt suggestion.
4. **Agent Skills UI ticket:** Settings group/navigation, paginated discoverability/education, authorized user ZIP download and replace-only upload, tests. Implement after the backend API contract stabilizes.
5. **Workspace authorization ticket:** `agentWorkspace/access` OPA route, seeded admin grants, Manager HTTP and WebSocket access enforcement, whoami-driven navigation with per-user ownership. This is a separate foundational access-control change that may be developed before the UI stage.

No extra storage bucket or skill DB, independent metadata editor, mandatory content history, separately privileged system-skill runtime, automatic skill publishing, or new full UI-based skill authoring tool.

## Qualification / security checklist

- [ ] Registry `agent-skill` records include `access-control` plus immutable `createdAt/createdBy` and publish-maintained `updatedAt/updatedBy`; UI/query pagination returns only permitted `READY` records.
- [ ] `object/agentSkill/create/read/update/delete` work under both direct Registry record routes and linked Storage-object read/upload/delete; generic `object/record/*` fallback **cannot bypass** skill permissions, including aspect deletion/type changing.
- [ ] System users can read **only** permitted system skills; user-skill records remain owner-scoped even if system-skill read is unconditional. Admin-only system publishing and record/ZIP permissions tested, including before/after upload checks.
- [ ] Generic Storage API cannot be used to overwrite/delete/create ZIPs under reserved skills prefix outside the Agent Services validation/publish workflow; object-key/record-ID spoofing and forged `magda-owner-id` do not bypass authorization.
- [ ] Created skill Registry record and ZIP share stable record ID; both linked stores have idempotent recoverable partial-failure paths; no partial skills in catalogue or sync.
- [ ] User ZIP supports Markdown only; system ZIP may include regular scripts/models; traversal, symlink, duplicate, invalid frontmatter, decompression bomb and size/file limit tests.
- [ ] Agent Services honors the trusted Gateway `X-Magda-Session` caller identity and does not transmit a storage credential to Sandbox or browser; regular Storage API authorization still applies to direct user reads.
- [ ] `agentWorkspace/access` controls only one's own Sandbox HTTP CRUD/resume/runtime access and WebSocket upgrades; existing admin role continues to work, arbitrary target user denied; UI whoami filtering is not authoritative authorization.
- [ ] Paginated Settings catalogue includes user/system filters, education, metadata, user ZIP download/replace (not create), permission-aware actions and informative sync guidance.
- [ ] Warm pool claim then user auth/bootstrap/sync installs only permitted current user's skills; no local edit is auto-published; new Sandbox reuses published copies and multiple DSH sessions remain supported.
- [ ] Workflow-capture agent drafts the concrete CSV-column workflow into a skill, waits for review/approval, and publishes only through authenticated API.
