# Agent skills: Registry metadata, storage, access and user workflow

**Status:** Agreed updated design for the expanded Agent Workspace MVP #3849, implemented incrementally in draft PR #3850; **not yet shipped**  
**Implementation:** #3854 (Registry-backed skill API), #3855 (`mgd`/runtime bootstrap), #3856 (workflow capture), #3857 (Agent Skills catalogue UI), plus #3858 (`agentWorkspace/access` authorization)  
**Design owner:** #3811 / epic #3810  
**Related:** [platform overview](./README.md), [authorization](./authentication.md), [web UI](./web-ui.md), [session lifecycle](./session-lifecycle.md), general Storage API owner-metadata bug [#3853](https://github.com/magda-io/magda/issues/3853)

**Authoritative October 14 decisions:** [Skill authorization, sharing, identity and Workspace manifest](./skills-authorization-and-workspace-manifest.md). It supersedes older unsuffixed `object/agentSkill/{create,read,update,delete}` URI examples and `agent-skill.scope`/owner-derived IDs elsewhere in this design. **Skill discovery is based on the intended user; skill access is based on authorization; skill synchronization is optional to Workspace availability.**

## Product model and three categories

Reusable skill publications/installation records survive disposable Workspaces. They are distinct: **runtime-bundled** skills live in the image; **system** publications (trusted publisher, executable assets allowed) and **user** publications (Markdown-only) live as `agent-skill` Registry records with Storage API ZIPs; **installed shared** skills live as recipient-specific `agent-skill-installation` Registry records referencing another user's published ZIP, never copying it. A merely readable shared user skill is not installed. System skills execute with current user's MAGDA permissions, not publisher authority. See the [authoritative identity/sharing/OPA contract](./skills-authorization-and-workspace-manifest.md).

## Registry: authoritative published skill catalogue

The publication `agent-skill` aspect uses immutable `type: "system"|"user"` (renamed from `scope`), `name`, ZIP-derived `description`, server-derived `archiveKey`, immutable `createdAt/createdBy`, publisher `updatedAt/updatedBy`, ZIP `checksum` and `state: PENDING|READY|DELETING`. For `type=user`, `userId` is a **required immutable intended-user UUID**; system publications have **no** userId. An `agent-skill-installation` aspect requires recipient `userId`, `sourceSkillId` and optional `alias`, with no independent ZIP. Both records carry `access-control`.

`userId` is not `access-control.ownerId`: the first determines target-user Workspace discovery and **must equal the canonical UUID embedded in the deterministic record ID**; the second is the record owner used for OPA. Ordinary MVP create sets both to authenticated current user; future delegated provisioning requires explicitly designed permissions. System skills do not have userId. Keep names immutable, max 46 chars and regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`. System names start `system-` and user/installation names may not.

Use IDs `agent-skill-<userId>-<name>` for user publications and installations (same namespace), `agent-skill-system-<suffix>` for system publications. Do not use record.ownerId to derive the intended-user namespace. Registry paged queries can use `aspect` and `aspectQuery` on aspect `type` and `userId`; never combine `orderBy` with `pageToken`, or use Registry `q` as an exact name uniqueness test. See the [authoritative record/permission contract](./skills-authorization-and-workspace-manifest.md).

## Sharing and recipient installations (#3861)

The source publication, Access Group sharing grant and recipient installation are separate. Reuse MAGDA Access Group pre-authorised permission/role/user-membership concepts, generalising its currently `object/record`/dataset-only APIs to typed `object/agentSkill/user/read` and authorised system shares; do not grant broad `object/record/read` to bypass skill rules. The recipient enters a UUID from their account page; a simpler Share Skill UI can reuse existing Access Group components/backend patterns. Owner/authorized publisher controls share grants. Group-specific permission IDs are written into the source publication; recipient membership gives source read, not an installation.

Installation requires an explicit recipient-owned `agent-skill-installation` record and `object/agentSkill/install/create` grant. Verify source read on install/download/manifest sync; installation read alone cannot read the source ZIP. Revocation/deletion leaves an installation safely uninstallable, but excludes inaccessible source. Alias rename = uninstall/reinstall with immutable per-user ID (and both permissions); register `install/update` for future settings only. Sharing/install API, UI and record implementation remain **#3861, separate from Stage 1 #3854**, while typed publication operation design is adopted now. Details: [authorization and manifest decisions](./skills-authorization-and-workspace-manifest.md).

## Storage: existing bucket and normal Storage API

**Do not create a new bucket or introduce Agent Services direct MinIO credentials.** Keep published ZIPs in the deployment's **existing default MAGDA bucket** via MAGDA **Storage API**, so deployments with MinIO gateway/S3/GCS/Azure backends do not require cloud bucket provisioning changes.

Server-selected bucket-relative keys retain the agreed convention:

```text
<existing-default-magda-bucket>/
  agent-services/skills/
    system-skills/<skill-record-id>.zip
    user-skills/<userId>/<skill-record-id>.zip
```

One published skill = **one complete ZIP object**, with a root `SKILL.md` and files allowed by the category. Replacing it is a whole-object upload; ZIP content remains easy to browse after extraction into the DSH skill directory. No application-level history or revision pointer; optional storage-provider bucket versioning is an operator choice. Checksum/ETag supports change detection and optional optimistic concurrency.

Each skill archive is linked to its Registry record using Storage API upload `recordId`. **Storage API itself**, not Agent Services, persists the object metadata on initial creation:

```text
magda-record-id = <skill-registry-record-id>
magda-owner-id  = <original-owner-user-uuid>  # assigned on creation, immutable on ordinary replacement
```

The original storage object owner and Registry record link must be **preserved on ZIP update**, including when an authorized different publisher changes a system skill. `agent-skill.updatedBy` records the most recent publisher, not a transfer of `magda-owner-id`; Registry `access-control.ownerId` remains authoritative for skill ownership. The generic Storage API canonical owner metadata fix **#3853 is merged**; #3854 must verify the linked publication record ID and original object owner are preserved on replacement.

**All public skill operations enter through Agent Services** (browser, DSH/`mgd`, and external API clients), authenticated as the real MAGDA user. For create/update/delete, the public endpoint checks only the **real caller's one corresponding typed OPA operation**; internal PENDING/READY/DELETING transitions and record lookups are orchestrated server-side using a **short-lived JWT minted for the existing built-in `DEFAULT_ADMIN_USER_ID`** where additional downstream privileges are needed. Caller JWTs may still be used for compatible original Storage uploads to preserve the original `magda-owner-id`. The technical JWT is strictly internal to Agent Services → Registry/Storage API, **never returned to the browser, `mgd`, Sandbox or DSH**, logged or stored in a Workspace. Identity, scope, target and ZIP are checked before privileged actions; OPA authorization for public reads/lists/downloads uses the real user, never the system admin. Ordinary `mgd` API-key requests are translated by Gateway into the real user's identity. Underlying generic Registry/Storage API endpoints retain their own authorization rules, but are not alternative supported skill-management endpoints. See [authoritative internal lifecycle principal design](./skills-authorization-and-workspace-manifest.md#agent-services-permissions-and-internal-lifecycle-authority--accepted-2026-10-15).

**Authorization boundary:** Every supported Agent Services skill endpoint performs an **early typed** `object/agentSkill/<type>/<operation>` OPA check on the real caller. Downstream Registry/Storage authorizations run under the caller for normal operations, or an **internal-only short-lived default-admin JWT** for necessary validated lifecycle steps that the caller need not separately authorize. For create, validate the proposed type/actor/target user before parsing ZIP bytes; for read/download/update/delete, load actual publication metadata and check its type, deterministic ID/userId and owner independently. List uses authorized per-record Registry pages rather than a blanket unconditional check, including owner, OrgUnit, pre-authorised and exemption cases. Installations, when implemented in #3861, use `object/agentSkill/install/<operation>` and separately reauthorize the original linked user publication. There is no `object/agentSkill/*/read` operation; Workspace startup uses the `workspace-manifest` API. Details: [skill authorization contract](./skills-authorization-and-workspace-manifest.md).

**Direct generic API access (accepted MVP trade-off):** MAGDA Registry and Storage APIs remain independently callable by sufficiently privileged clients, but **Agent Services is the supported validated skill lifecycle**. A direct Registry caller may bypass service-owned cross-version immutable identity and lifecycle invariants via typed-marker removal, separately authorized states, generic bulk operations or source trimming; Stage #3854 deliberately does **not** add Registry mutation hardening. Generic Registry design/implementation review is tracked under #3862 / draft PR #3863. These direct mutations are an accepted **integrity/consistency risk**, not an endorsement of unauthorized source reads. **Protected Storage read exception:** for keys in exactly `agent-services/skills/system-skills/` or `agent-services/skills/user-skills/`, ordinary Storage `read` grants (unconstrained, owner, OrgUnit, legacy missing/empty OrgUnit) **cannot bypass** required valid publication linkage and typed source-read authorization. The existing global administrator override remains. Generic Storage **upload/delete** behaviour is intentionally unchanged; valid direct writes may still create mismatched/invalid ZIPs, which Agent Services and Workspace sync must detect and reject. Existing public dataset/standalone Storage read semantics are preserved.

## OPA: specialized skill and workspace permissions

**Authoritative contract:** [Skill authorization, sharing and Workspace manifest](./skills-authorization-and-workspace-manifest.md).

Use three typed authorization resources `object/agentSkill/system`, `object/agentSkill/user`, `object/agentSkill/install`, each registering individual create/read/update/delete operations, plus standalone `agentWorkspace/access`. Do **not** register or implement `object/agentSkill/*/read`. The type/record aspect determines scope at Registry policy boundary. Typed Registry/Storage delegation excludes `object/record/*` generic fallback for both publication and installation records.

Seed unassigned stock roles `Agent Workspace Users` (workspace access, system/user reads with OrgUnit and pre-authorised constraints and `allowExemption=true`, owner user CRUD and installation CRUD), and `Agent Skills Admins` (unconstrained system publication CRUD). Individual permissions/operations remain separately grantable. Trusted non-admin system publishers may hold the latter role without global admin access. An exempt source (`access-control.constraintExemption=true`) becomes readable to anyone with matching exemptible read permission; do not use the generic missing-orgUnit read fallback for skills. Access Group grants must use specific permission IDs. UserId is **not** authorization, even when embedded in an immutable ID.

Agent Services makes the typed OPA decision as the **real caller** for the **single requested operation**; validated lifecycle steps may use its internal default-admin JWT to call Registry and Storage where required. Read/list/download always authorize the real user. An installation record's existence never implies read permission for the linked original publication/ZIP.

## Agent Services Skill API, workflow and consistency

Agent Services remains the supported `/api/v0/agent/skills` facade for Registry-backed READY publication metadata/list, ZIP download/create/replace/delete. Use **`object/agentSkill/<type>/<operation>`** decisions; create checks the validated proposed publication type/owner before reading ZIP bytes, and existing operations check real Registry aspects/ID/owner. Retain original Storage API default bucket/record-linked ZIP, owner metadata preservation (#3853), checksum validation, immutable identity, PENDING/READY/DELETING consistency, safe ZIP validation and idempotent partial-failure handling; no new Registry endpoint, skill-specific Storage endpoint, bucket or skill database. Storage OPA has a **narrow protected-prefix read boundary**, not a new endpoint.

A separate **`GET /api/v0/agent/skills/workspace-manifest`** (`getWorkspaceSkillManifest`) constructs the actual effective Workspace set by independently paginating (a) visible READY system publications, (b) authenticated user's READY user publications filtered by **`agent-skill.userId`**, (c) recipient installations filtered by **`agent-skill-installation.userId`**, each resolved through its *independently readable* original source publication. A readable but not installed shared skill does not enter the manifest. #3855 implements system+own and the abstraction; #3861 adds installation resolution. Details, permissions, pagination, error contract and UI status: [authoritative manifest decisions](./skills-authorization-and-workspace-manifest.md).

## `mgd` and local draft → publish flow

Preserve existing `mgd skills install/uninstall` (coding-agent guidance). Add a distinct `mgd agent-skill` command family:

```shell
mgd agent-skill list [--type system|user|all]
mgd agent-skill show <type>/<id>
mgd agent-skill pull <type>/<id> [--output <dir>]
mgd agent-skill init <name> [--type user|system]
mgd agent-skill validate <local-dir> [--type user|system]
mgd agent-skill publish <local-dir> [--type user|system]
mgd agent-skill delete <type>/<id>
mgd agent-skill sync [--type system|user|all] [--force]
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

Warm KAS claims have no user credentials. After claim/adoption perform essential current-user credential + DSH bootstrap and make the Agent Workspace usable; **failure to synchronise one or all published skills must not block READY or DSH access**, even during Registry/Storage/OPA outages. The optional skill-sync phase resolves the [effective Workspace manifest](./skills-authorization-and-workspace-manifest.md), validates source access and ZIPs, safely extracts into DSH-discoverable files, and reports `success|partial|failed|notAttempted` plus sanitized per-skill errors in the MAGDA Workspace page when feasible. Do not silently report a service outage as zero skills. No dedicated retry button/API is required initially: a user may terminate/restart to retry. Manual `mgd agent-skill sync` can remain available independently.

Revoked/missing/unready source installations are skipped, allowing other skills and DSH to work. On the next **successful** reconciliation remove stale downloaded unauthorised copies; continuous revocation monitoring is not required. Preserve local drafts and session state, enforce ZIP/path/name safety and prevent unauthorized source activation. Runtime-bundled skills remain image-shipped and independent of published skill sync.

## User-facing Settings catalogue (no general skill editor)

Under Settings navigation, create **Agent Workspace** group with second-level **Open Workspace** (`/settings/agent-workspace`) and **Agent Skills** (`/settings/agent-workspace/skills` or an equivalent unambiguous route); reserve a third **Shared Skills** child for #3861. The group itself is non-clickable with the current `SideNavigation.tsx` implementation; use child links. Authorization/visibility is independent per child as specified above.

The **Agent Skills** page is intentionally a discovery and education surface, not a new skill authoring interface. Include a prominent but concise explanation, an example of capturing a reusable workflow, and a normal link to **Open Workspace** when the current user has `agentWorkspace/access`. The introductory example should be concrete, like the CSV workflow above, **not** just “Save this workflow as a skill”. When Workspace access is unavailable, do not show an unusable action.

Show an authorized, paginated catalogue with **All / My Skills / System Skills** filter, optional search and the fields:
- Skill ID, name, description, type, created at/by, updated at/by;
- Pagination and refresh backed by filtered/paginated Registry queries;
- **System skills:** metadata visible where authorized, **no ZIP download/upload/edit** in this UI initially;
- **User skills:** view metadata, **Download ZIP**, **Replace ZIP** for an *existing record only*, with appropriate permission. Replacement uses the **same Agent Services validation and publish path** as `mgd`, requires the original immutable skill name, and updates description, `updatedAt` and `updatedBy` while keeping stable ID, name and creator fields.
- No Create skill upload, Delete, general metadata editor, binary system-skill editor or agent-coding interface in this UI. Creating/modifying/deleting skills through natural language and `mgd` remains the primary workflow.

After successful user ZIP replacement, tell the user that an active Workspace can have a stale local copy: **“Ask your agent to resynchronise your skills, or run `mgd agent-skill sync` within Agent Workspace.”** Do not claim automatic resync unless the implementation actually performs it. Use existing MAGDA UI pagination/layout patterns, accessible file-input/error states, and responsive Settings layout. Keep security checks server-side, not in menu visibility or hidden actions.

## Runtime-bundled workflow capture

`capture-workflow` is bundled immutably with `magda-agent-runtime` (not published in Registry or MinIO) and instructs DSH to inspect the successful work, identify reusable procedures, parameterize dataset IDs/paths/URLs, avoid credentials/private data, draft Markdown, request review and approval, then publish via `mgd`. A small configured MAGDA DSH system-prompt suffix may **occasionally suggest** converting a substantial, completed, reusable workflow into a skill; avoid offers for simple/failed work or repetitive prompts.

Start with context and working files. DSH session history is persisted on the current Workspace PVC; if an important detail is missing or context was compacted, selectively read relevant local events. Do not automatically load the full transcript solely because compaction occurred. A small local read-only current-PVC helper is acceptable if necessary; it need not and must not access other users' logs or expose a launch token.

## MVP implementation sequencing

Keep **the same draft implementation PR #3850**, test and review each stage before starting the next. Recommended separation:

1. **#3854 — Backend:** `agent-skill` aspect/schema, Agent Services skill-operation façade using authenticated Registry + Storage APIs, **early type-aware `object/agentSkill/*` checks for all skill endpoints**, downstream OPA, existing Storage API ownership metadata fix **via #3853 before integration**, ZIP CRUD, consistency and tests. Do not add Storage API prefix restrictions solely to force use of Agent Services.
2. **#3855 — CLI/bootstrap:** `mgd agent-skill` commands, local draft/review/publish/sync, DSH skill discovery and user-scoped post-claim/bootstrap.
3. **#3856 — Capture:** runtime-bundled workflow capture skill, agent-led user approval, optional local session-history support, and selective prompt suggestion.
4. **[#3857](https://github.com/magda-io/magda/issues/3857) — Agent Skills UI:** Settings group/navigation, paginated discoverability/education, authorized user ZIP download and replace-only upload, tests. Implement after the backend API contract stabilizes.
5. **[#3858](https://github.com/magda-io/magda/issues/3858) — Workspace authorization:** `agentWorkspace/access` OPA route, seeded admin grants, Manager HTTP and WebSocket access enforcement, whoami-driven navigation with per-user ownership. This is a separate foundational access-control change that should be developed before the UI stage.
6. **Future [#3861](https://github.com/magda-io/magda/issues/3861) — Sharing/installation/UI:** sharing grants, recipient-owned lightweight `agent-skill-installation` records, aliases, unified effective install resolution and Shared Skills UI. Design compatibility belongs in #3854/#3855/#3857, but implementation is separate from current #3850 stage gates.

No extra storage bucket or skill DB, independent metadata editor, mandatory content history, separately privileged system-skill runtime, automatic skill publishing, or new full UI-based skill authoring tool.

## Qualification / security checklist

- [ ] Registry `agent-skill` records include `access-control` plus immutable `createdAt/createdBy` and publish-maintained `updatedAt/updatedBy`; UI/query pagination returns only permitted `READY` records.
- [ ] Typed OPA dispatch applies to **concrete** `agent-skill` Registry records and linked Storage objects; generic `object/record/*` must not override typed permissions while the marker is present. Agent Services rejects type/identity changes through supported APIs. Direct generic Registry marker removal/bulk/source-trim and absent trusted `originalRecord` invariants remain a documented Stage-1 limitation tracked in #3862/#3863.
- [ ] Typed system/user read grants enforce matching ownership/OrgUnit/pre-authorised/exemption without missing-OrgUnit privacy leaks; permissioned non-admin system publication works.
- [ ] Once **#3853** fixes Storage API, its ordinary upload/update path already sets both `magda-record-id` and original `magda-owner-id` correctly; #3854 uses existing Storage API capabilities rather than implementing new storage-metadata behaviour. Verify both are preserved on replacement and cannot be spoofed into unauthorized access. **The reserved-prefix restriction applies to protected Storage `read` only; generic upload/delete operations remain unchanged.**
- [ ] Created skill Registry record and ZIP share stable record ID; both linked stores have idempotent recoverable partial-failure paths; no partial skills in catalogue or sync.
- [ ] User ZIP supports Markdown only; system ZIP may include regular scripts/models; traversal, symlink, duplicate, invalid frontmatter, decompression bomb and size/file limit tests.
- [ ] All supported skill operations route through Agent Services, which performs **early type-aware `object/agentSkill/<type>/<operation>` OPA checks on each endpoint** (for create before ZIP body parsing; for existing skills using server-fetched Registry metadata; for list through scope-aware/record-level filtering). Registry/Storage APIs separately authorize requests using trusted `X-Magda-Session`. No raw storage credential reaches Agent Services, Sandbox or browser.
- [ ] Direct generic Registry mutation may cause publication identity or catalogue/ZIP mismatches (accepted integrity limitation; #3862/#3863); test malformed/missing/out-of-sync ZIP rejection. Direct Storage **read** of reserved skill ZIP prefixes must require a valid deterministic record/Storage binding and **typed source-read** permission even when a caller holds a generic Storage read grant. Preserve legacy non-skill Storage reads and ordinary upload/delete permissions.
- [ ] `agentWorkspace/access` controls only one's own Sandbox HTTP CRUD/resume/runtime access and WebSocket upgrades; existing admin role continues to work, arbitrary target user denied; UI whoami filtering is not authoritative authorization.
- [ ] Paginated Settings catalogue includes user/system filters, education, metadata, user ZIP download/replace (not create), permission-aware actions and informative sync guidance.
- [ ] Warm claim and essential DSH/credential bootstrap reach READY despite partial or complete skill-sync failure; errors/status surface in MAGDA UI; never activate unverified source ZIPs.
- [ ] Workflow-capture agent drafts the concrete CSV-column workflow into a skill, waits for review/approval, and publishes only through authenticated API.

