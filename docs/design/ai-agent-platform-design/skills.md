# Agent skills: Registry metadata, storage, access and user workflow

**Status:** Agreed updated design for the expanded Agent Workspace MVP #3849, implemented incrementally in draft PR #3850; **not yet shipped**  
**Implementation:** #3854 (Registry-backed skill API), #3855 (`mgd`/runtime bootstrap), #3856 (workflow capture), #3857 (Agent Skills catalogue UI), plus #3858 (`agentWorkspace/access` authorization)  
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

Each skill archive is linked to its Registry record using Storage API upload `recordId`. **Storage API itself**, not Agent Services, persists the object metadata on initial creation:

```text
magda-record-id = <skill-registry-record-id>
magda-owner-id  = <original-owner-user-uuid>  # assigned on creation, immutable on ordinary replacement
```

The original storage object owner and Registry record link must be **preserved on ZIP update**, including when an authorized different publisher changes a system skill. `agent-skill.updatedBy` records the most recent publisher, not a transfer of `magda-owner-id`; Registry `access-control.ownerId` remains authoritative for skill ownership. Storage API **currently writes `magda-user-id` rather than the `magda-owner-id` read by its auth middleware** (#3853), and on replacement currently reconstructs upload metadata. Fix/qualify those creation-and-overwrite semantics as part of #3853 and #3854 before relying on them.

**All public skill operations enter through Agent Services** (browser, DSH/`mgd`, and external API clients). Agent Services performs the complete operation by invoking **Registry API and Storage API on behalf of the current user**, forwarding the trusted, gateway-generated `X-Magda-Session` header to those internal APIs. The session header must come from trusted Gateway authentication, never a spoofable browser-provided identity or elevated service principal. Ordinary `mgd` API-key requests are translated by Gateway into this normal identity. Underlying generic Registry/Storage API endpoints retain their own authorization rules, but are not alternative, supported skill-management endpoints.

**Authorization boundary:** **Every Agent Services skill endpoint** performs an explicit **scope-aware `object/agentSkill/{create|read|update|delete}` OPA check**, using `requirePermission` where a single skill/proposed skill is involved. This is an intentional type-aware service boundary **in addition to**, not instead of, the Registry API and Storage API authorization under the forwarded current-user session. The skill category is the canonical Registry attribute `agent-skill.scope` (`system` or `user`; the UI may call it 'type'), not an untrusted caller assertion. On **create**, parse the small requested scope from the route/query and check `object/agentSkill/create` against a proposed record/owner context **before accepting or parsing ZIP bytes**; the later Registry/Storage operations still authorize independently. On **read, download, update and delete**, fetch the actual `agent-skill` record through the authorized Registry API, then evaluate `requirePermission` against its **server-fetched scope, owner and record ID** before proceeding with the returned metadata, ZIP transfer or mutation. Deny when the record is not an authorized `agent-skill` record or is not in a readable/mutable state.

**For list endpoints**, there is no single object on which `requirePermission` can unconditionally authorize `scope=all`: a permission may be owner-constrained and results may include both categories. Perform scope-aware prechecks for the requested categories (or per-record decisions), then retrieve **authorization-filtered, paginated Registry results** and apply actual record-level/scope authorization to each returned item. Do not interpret a global system-skill read grant as permission to list other users' private skills, bypass per-record policies, or require an unconditional check that rejects legitimately owner-scoped results.

**Direct generic API access (accepted MVP trade-off):** MAGDA Registry and Storage APIs remain independently callable by clients with the applicable **existing OPA permissions**; Agent Services is the **supported skill-management API**, not an exclusive gateway enforced by a new reserved-prefix restriction. Authorized direct updates could produce a valid permission decision but leave the Registry metadata out of sync with a ZIP or replace it with invalid skill content. This is an **accepted data-integrity/consistency limitation**, not automatically an access-control breach. Do **not** build a new reserved-prefix denylist, internal write capability, or Storage API special case solely to force all writes through Agent Services. However, existing Storage API rules also allow independent unconstrained/owner/storage grants, so do **not** assume that every direct Storage API caller necessarily holds `object/agentSkill/*` permission. Qualify direct-access authorization (ordinary user, other-user, system admin, broad storage grant), protect against **unauthorized access**, and make skill catalogue/Workspace sync **fail safely on mismatched, missing, invalid or untrusted ZIP content**. Optionally document repair/re-publish through Agent Services. A user who already has authorized generic API write permissions may bypass skill validation, with consistency consequences accepted for MVP.

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

The Storage API's existing `storage/object/allow.rego` grants linked-object reads where the associated Registry record is readable and handles uploads/deletes through linked-record create/update/delete. Agent Services performs a **second, early type-aware operation-specific OPA check for every supported skill endpoint**, and forwards the current user's session to Registry/Storage API, which continue to authorize their own work. For an existing skill, this check uses the **Registry-fetched** scope/record context; for create it uses the validated proposed scope and owner **before ZIP parsing**; for list it uses scoped checks and record-filtered pagination. Verify original/new-record authorization on storage replacement. Storage object rules have independent owner/unconstrained grants and can permit direct operations separately; no additional reserved-prefix access barrier is required for this MVP, but negative authorization and invalid-archive recovery tests remain essential.

Create a separate `magda-opa/policies/agentWorkspace/allow.rego`, routed through the entrypoint, with **one operation: `agentWorkspace/access`**. Granting that permission lets an authenticated user create/start, inspect/access/resume and reset/terminate **only their own managed Agent Workspace**. Agent Manager derives the user UUID from the verified current request, **never** a caller-specified target. There is no admin-only hardcoded authorization gate after the operation is deployed; the existing admin role continues to work through MAGDA's administrator policy and/or seeded operation permission. Preserve one Workspace per user and all existing session/key ownership boundaries. Enforce the operation on **HTTP lifecycle, runtime HTTP and runtime WebSocket upgrade** paths, including any gateway accessControl requirements.

The Settings navigation may use `whoami` permissions for a **rough visibility check**:
- Show **Open Workspace** to users with `agentWorkspace/access` (and admins under existing admin role semantics).
- Show **Agent Skills** to users with a suitable `object/agentSkill/read` permission (and admins), independent of Workspace access.
- The parent **Agent Workspace** group appears when at least one child is visible.
- Real APIs/OPA decide authorization even if the browser shows/hides a menu incorrectly.

## Agent Services Skill API, workflow and consistency

Under the existing `/api/v0/agent/skills` namespace provide list (paginated, filtering by scope), read record metadata, download ZIP, create, update/replace published ZIP and delete; choose unambiguous `scope`/record ID routes. **Every operation enters Agent Services**, which orchestrates internal Registry/Storage API requests with the caller's trusted `X-Magda-Session`. Agent Services is **not** a replacement OPA policy engine and normally trusts the downstream services to enforce per-record/per-object permissions.

| Skill endpoint | Agent Services orchestration | OPA/authorization |
| --- | --- | --- |
| List catalogue | Scope-aware prechecks and actual record-level filtering; paginate authorized Registry records | Agent Services `object/agentSkill/read` for selected scopes/records **plus** Registry OPA |
| Read metadata | Load typed record by ID via Registry, then check its authoritative scope and ownership before return | Agent Services `object/agentSkill/read` **plus** Registry OPA |
| Download archive | Load authorized record/scope, check and **stream/proxy** Storage API ZIP response | Agent Services `object/agentSkill/read` **plus** Registry/Storage OPA |
| Create HTTP POST | **Check first**, with validated requested scope, before ZIP upload body parsing; create record + ZIP | Agent Services `object/agentSkill/create` **plus** Registry/Storage OPA |
| Update/replace archive | Load actual record/scope, check, validate ZIP, publish ZIP and metadata | Agent Services `object/agentSkill/update` **plus** Registry/Storage OPA |
| Delete skill | Load actual record/scope, check and coordinate ZIP then record deletion | Agent Services `object/agentSkill/delete` **plus** Registry/Storage OPA |

For create: determine proposed scope early, reject unauthorized requests **before processing ZIP bytes** through `requirePermission`; derive the user principal/owner; validate ZIP/frontmatter; create a typed agent skill Registry record (`PENDING`) with `access-control`; upload the ZIP via Storage API with `recordId` and Storage API-assigned `magda-owner-id`; then set the record `READY` with authoritative metadata. Return success **only when both stores are consistent**. For update: retrieve the existing Registry record, **perform scope-aware `requirePermission(object/agentSkill/update)`** and let Registry/Storage perform downstream checks; validate the replacement ZIP, preserve skill record ID, record link, object owner and creator fields, update `updatedBy` (caller UUID) and coordinate ZIP/record metadata; ensure errors do not make half-updated skills appear usable. For delete: retrieve the record and **perform scope-aware `requirePermission(object/agentSkill/delete)`** before coordinating `DELETING`, **archive deletion before final Registry record deletion** (otherwise linked-record authorization may be lost) and safe retries. Registry and Storage have no distributed transaction; implement **idempotent retry/repair** without a new transaction DB. Pending/deleting records are unavailable for ordinary catalogue/sync.

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
> **Agent:** I've published the skill to your MAGDA account. It will be available in new Agent Workspaces. To use the latest version in an already-running Workspace, ask me to resynchronise your skills, or run `mgd agent-skill sync` **within Agent Workspace**.

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

After successful user ZIP replacement, tell the user that an active Workspace can have a stale local copy: **“Ask your agent to resynchronise your skills, or run `mgd agent-skill sync` within Agent Workspace.”** Do not claim automatic resync unless the implementation actually performs it. Use existing MAGDA UI pagination/layout patterns, accessible file-input/error states, and responsive Settings layout. Keep security checks server-side, not in menu visibility or hidden actions.

## Runtime-bundled workflow capture

`capture-workflow` is bundled immutably with `magda-agent-runtime` (not published in Registry or MinIO) and instructs DSH to inspect the successful work, identify reusable procedures, parameterize dataset IDs/paths/URLs, avoid credentials/private data, draft Markdown, request review and approval, then publish via `mgd`. A small configured MAGDA DSH system-prompt suffix may **occasionally suggest** converting a substantial, completed, reusable workflow into a skill; avoid offers for simple/failed work or repetitive prompts.

Start with context and working files. DSH session history is persisted on the current Workspace PVC; if an important detail is missing or context was compacted, selectively read relevant local events. Do not automatically load the full transcript solely because compaction occurred. A small local read-only current-PVC helper is acceptable if necessary; it need not and must not access other users' logs or expose a launch token.

## MVP implementation sequencing

Keep **the same draft implementation PR #3850**, test and review each stage before starting the next. Recommended separation:

1. **#3854 — Backend:** `agent-skill` aspect/schema, Agent Services skill-operation façade using authenticated Registry + Storage APIs, **early type/scope-aware `object/agentSkill/*` checks for all skill endpoints**, downstream OPA, existing Storage API ownership metadata fix **via #3853 before integration**, ZIP CRUD, consistency and tests. Do not add Storage API prefix restrictions solely to force use of Agent Services.
2. **#3855 — CLI/bootstrap:** `mgd agent-skill` commands, local draft/review/publish/sync, DSH skill discovery and user-scoped post-claim/bootstrap.
3. **#3856 — Capture:** runtime-bundled workflow capture skill, agent-led user approval, optional local session-history support, and selective prompt suggestion.
4. **[#3857](https://github.com/magda-io/magda/issues/3857) — Agent Skills UI:** Settings group/navigation, paginated discoverability/education, authorized user ZIP download and replace-only upload, tests. Implement after the backend API contract stabilizes.
5. **[#3858](https://github.com/magda-io/magda/issues/3858) — Workspace authorization:** `agentWorkspace/access` OPA route, seeded admin grants, Manager HTTP and WebSocket access enforcement, whoami-driven navigation with per-user ownership. This is a separate foundational access-control change that should be developed before the UI stage.

No extra storage bucket or skill DB, independent metadata editor, mandatory content history, separately privileged system-skill runtime, automatic skill publishing, or new full UI-based skill authoring tool.

## Qualification / security checklist

- [ ] Registry `agent-skill` records include `access-control` plus immutable `createdAt/createdBy` and publish-maintained `updatedAt/updatedBy`; UI/query pagination returns only permitted `READY` records.
- [ ] `object/agentSkill/create/read/update/delete` work under both direct Registry record routes and linked Storage-object read/upload/delete; generic `object/record/*` fallback **cannot bypass** skill permissions, including aspect deletion/type changing.
- [ ] System users can read **only** permitted system skills; user-skill records remain owner-scoped even if system-skill read is unconditional. Admin-only system publishing and record/ZIP permissions tested, including before/after upload checks.
- [ ] Once **#3853** fixes Storage API, its ordinary upload/update path already sets both `magda-record-id` and original `magda-owner-id` correctly; #3854 uses existing Storage API capabilities rather than implementing new storage-metadata behaviour. Verify both are preserved on replacement and cannot be spoofed into unauthorized access. **No skill-specific reserved-prefix restriction required.**
- [ ] Created skill Registry record and ZIP share stable record ID; both linked stores have idempotent recoverable partial-failure paths; no partial skills in catalogue or sync.
- [ ] User ZIP supports Markdown only; system ZIP may include regular scripts/models; traversal, symlink, duplicate, invalid frontmatter, decompression bomb and size/file limit tests.
- [ ] All supported skill operations route through Agent Services, which performs **early type-aware `object/agentSkill/{operation}` OPA checks on each endpoint** (for create before ZIP body parsing; for existing skills using server-fetched Registry metadata; for list through scope-aware/record-level filtering). Registry/Storage APIs separately authorize requests using trusted `X-Magda-Session`. No raw storage credential reaches Agent Services, Sandbox or browser.
- [ ] Direct generic Registry/Storage calls by otherwise authorized users may create catalogue/ZIP mismatches; treat as a documented integrity limitation, not automatic access-control failure. Test ordinary/other-user/system-skill security boundaries and safe handling of invalid/missing/out-of-sync ZIPs; do not add a special Storage API prefix restriction.
- [ ] `agentWorkspace/access` controls only one's own Sandbox HTTP CRUD/resume/runtime access and WebSocket upgrades; existing admin role continues to work, arbitrary target user denied; UI whoami filtering is not authoritative authorization.
- [ ] Paginated Settings catalogue includes user/system filters, education, metadata, user ZIP download/replace (not create), permission-aware actions and informative sync guidance.
- [ ] Warm pool claim then user auth/bootstrap/sync installs only permitted current user's skills; no local edit is auto-published; new Sandbox reuses published copies and multiple DSH sessions remain supported.
- [ ] Workflow-capture agent drafts the concrete CSV-column workflow into a skill, waits for review/approval, and publishes only through authenticated API.
