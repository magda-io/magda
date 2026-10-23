# Agent Skills architecture

Agent Skills are reusable, Registry-backed capabilities for the optional Magda
Agent Platform. This document describes **implemented draft #3850 behaviour**
for system and personal publications, the `mgd agent-skill` CLI,
Workspace/local synchronization and the Settings catalogue. Future recipient
sharing/installation records are reserved for #3861 and are **not yet active**.

See [Agent Workspace architecture](./agent-workspace.md) for Sandbox lifecycle,
self-only Workspace access and the runtime trust boundary; see
[deployment and operations](../agent-workspace-deployment.md) for installation
and [E2E tests](../e2e-test-cases/agent-workspace.md) for qualification.

## Agent Skills publication API

Agent Services exposes the authenticated public surface
`/api/v0/agent/skills` for paginated READY metadata, metadata reads, validated
ZIP download, creation, replacement, and deletion. Workspace lifecycle routes
require `agentWorkspace/access`; skill routes accept ordinary authenticated
users and then enforce the typed
`object/agentSkill/{system,user}/{create,read,update,delete}` OPA operations.

Agent Skill metadata is stored as Registry records with `agent-skill` and
`access-control` aspects. The immutable record ID is derived server-side from
the immutable intended-user `agent-skill.userId` and root `SKILL.md` name: user
skills use `agent-skill-<user-uuid>-<name>` and system skills use
`agent-skill-system-<suffix>` for a full `system-<suffix>` name. For ordinary MVP
user publishing, `userId`, `access-control.ownerId`, and the authenticated actor
must match; the two fields remain distinct for future explicitly delegated use. Names are at
most 46 lowercase letters/digits with interior hyphens; user names cannot use
the `system-` prefix, and runtime-bundled names such as `capture-workflow` and
`magda-mgd` are reserved. Registry's primary key atomically enforces each
intended user's namespace, so the API never accepts a caller-selected ID or uses
full-text search for uniqueness. Different users may publish the same name.

The record name, `agent-skill.name`, and description are derived from `SKILL.md`
rather than accepted as independent API input. The two name copies must match;
the aspect copy allows Registry's existing `q` full-text search to index names,
including the components of hyphenated names. Replacements may update the
description but must preserve the name; renaming creates a new skill. The
Registry-backed publication states are `PENDING`, `READY`, and `DELETING`; only
READY records are catalogued. The default **All** query is one Registry-side
`READY AND (type=system OR userId=<caller>)` query, **My Skills** adds
`type=user` and `userId:<caller>`, and the future **Shared Skills** source view
adds `type=user` and `userId:!<caller>`. Registry applies these predicates and
OPA before sequence-keyset pagination, so other users' readable publications do
not leak into default pages and independent cursors never need post-hoc merging.
Catalogue traversal uses `reversePageTokenOrder=true`, never the unsupported
`orderBy` plus `pageToken` combination.

OPA policies only **authorise**; validating a publication's deterministic
identity (record ID, name and archive key derived from type, intended user and
name, plus the naming rules above) is data validation that **Agent Services**
does before every write and for every record it returns. All Agent Skill rules
use only literal comparisons and existence checks, so every partial decision
can be translated (e.g. into Registry SQL filters).

**Agent Services is the only non-admin writer of Agent Skill records.** It
authorises the real caller with the typed operation
(`object/agentSkill/<system|user>/<create|update|delete>`, a full evaluation),
then writes the Registry record with its internal session (see below). At the
generic `object/record/*` level, a concrete `agent-skill` record is:

- **read** with the typed Agent Skill read rules (by its actual `type`);
- **written** only by admins and by holders of an **unconstrained** generic
  `object/record/<operation>` grant (no ownership, OrgUnit or pre-authorised
  constraint). Such grants are deliberate grants to trusted users (no built-in
  role has one) and apply to every record, including Agent Skill records, for
  reads too. Constrained generic grants never apply to typed publications, and
  typed Agent Skill grants alone can't write through the generic Registry API.
  Generic grants give access to skill **records** (Registry and Storage);
  Agent Services, the skills application, requires the typed permissions for
  every operation, including listing and the Workspace manifest.

| Use case                                                                       | Admin | Unconstrained generic `object/record/*` grant | Typed Agent Skill grants (e.g. Agent Workspace Users, Agent Skills Admins) | Others (incl. constrained generic grants) |
| ------------------------------------------------------------------------------ | ----- | --------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| Create/update/delete skills via Agent Services (`/v0/agent/skills`, `mgd`, UI) | ✓     | only with typed grants                        | ✓ (as granted)                                                             | ✗                                         |
| Read/list/download skills via Agent Services                                   | ✓     | only with typed grants                        | ✓ (typed read rules)                                                       | ✗                                         |
| Write Agent Skill records via the generic Registry API (incl. bulk updates)    | ✓     | ✓                                             | ✗ (use Agent Services)                                                     | ✗                                         |
| Read Agent Skill records via the generic Registry API                          | ✓     | ✓                                             | ✓ (typed read rules)                                                       | ✗                                         |
| `trimBySourceTag`; deleting a record (or its aspect) that doesn't exist        | ✓     | ✓ (with unconstrained delete / update)        | 403                                                                        | 403                                       |
| Upload/delete a linked skill archive via Storage API                           | ✓     | ✓                                             | ✓ (typed create/update/delete)                                             | ✗                                         |

Agent Services preserves immutable publication type, intended user, ID/name,
creator, archive key, and owner, and fails closed on inconsistent or
wrong-type records. Because only Agent Services (and trusted admins or
unconstrained grant holders) can write Agent Skill records, those invariants
can't be bypassed through the generic Registry API by ordinary users. Bulk
Registry mutations authorise every record's current and proposed state with
full evaluations (#3870). The only Registry production adjustment retained by
this stage binds `/records/inFull/:id` aspect loading to the selected tenant.
Storage authorization consumes that existing endpoint for trusted linked-record
context; without the tenant predicate, equal record IDs in different tenants can
mix aspects and make the Storage decision against the wrong publication.

Authorization migrations register separate system, user, and future-installation
CRUD resources. The unassigned **Agent Workspace Users** stock role contains
owner user/installation CRUD plus OrgUnit- and pre-authorised-constrained typed
reads; both read permissions allow explicitly exempt records. The unassigned
**Agent Skills Admins** role contains unconstrained system CRUD, allowing trusted
staff to publish without global administrator status. Neither role is granted to
Authenticated Users. The premerge, consolidated
`V2_4__agent_workspace_and_skills.sql` migration registers both Agent Skill
permissions and #3858's `agentWorkspace/access` operation and attaches its
permission to Agent Workspace Users in the same file. The separate `V2_3`
migration remains responsible for system-managed API-key table structure.
Installation operations and their owner permission are
registered for #3861, but no installation record, API, policy, or sharing
functionality is activated here. Agent Services marks managed system
publications `constraintExemption=true`, so holders of an applicable
exemption-capable typed system-read permission can discover them. Here public
means broadly available to those authorised users, never anonymous access.
Later #3857/#3861 management may add OrgUnit and explicit-recipient grants;
those grants remain additive while public is enabled. User publications remain
owner-private unless explicitly constrained or shared.

Each skill has one record-linked ZIP in the existing
`global.defaultDatasetBucket`:

```text
agent-services/skills/system-skills/<record-id>.zip
agent-services/skills/user-skills/<intended-user-uuid>/<record-id>.zip
```

Agent Services authenticates and authorises the real caller for exactly the
requested typed operation. Normal list/read/download and each caller OPA decision
use only that caller's `X-Magda-Session`. For lifecycle-only lookups and state
transitions that would otherwise imply an unrelated permission, Agent Services
mints a two-minute HS256 session for MAGDA's existing
`DEFAULT_ADMIN_USER_ID`; that token is confined to validated Agent Skill client
calls and is never returned, logged, stored, or forwarded to a Workspace,
browser, DSH, or `mgd`. After authorising the real caller, all Registry record
writes (create, updates and delete) use that internal session. Storage uploads
of a new archive and archive deletion use the real caller, whose typed
create/delete authority applies, so a new archive is owned by the publication
owner. Explicit `createdBy`, `updatedBy`, and `access-control.ownerId` always
retain real-user attribution; Registry events record the internal principal.

Storage API assigns the original object owner and `magda-record-id`; replacement
uses the same key and a trusted existing record link so neither can be rebound by
query parameters. It preserves ownership while Registry records the current
publisher in `updatedBy`.

Reads under the two reserved Agent Skill archive prefixes have a deliberately
stronger boundary than ordinary Storage objects. Every generic Storage-read
branch—including unconstrained, owner, matching-OrgUnit, and legacy missing or
empty-OrgUnit access—is excluded. A read requires an existing Agent Skill
record, exact trusted record ID/key/owner linkage, and the caller's
corresponding typed source-read permission (or an unconstrained generic record
read grant). Missing or mismatched linkage fails closed; Agent Services
validates the publication's identity before exposing an archive. Public system skills remain readable through their
exemption-capable typed system-read grant, while shared user skills require an
applicable typed owner, OrgUnit, or explicit pre-authorised grant. The existing
top-level global-administrator override remains unchanged and covers MAGDA's
trusted internal lifecycle inspection; Agent Services never uses that identity
for caller downloads.
Ordinary standalone objects, dataset/distribution files, and their historical
missing/empty-OrgUnit read behavior are unchanged. A linked upload or delete
requires the linked record's create/update/delete permission; for an Agent
Skill record, the caller's typed Agent Skill create/update/delete permission
applies.

Create requires only typed create, writes PENDING before the caller-owned upload,
and uses the internal principal to mark READY after Storage succeeds. Delete
requires only typed delete; its internal DELETING marker does not imply caller
update authority. Storage's linked-record policy uses a trusted object-existence
flag so create cannot replace an existing archive and only delete can remove one.
Replacement validates first, hides the record as PENDING during publication, and
restores READY after the same object is replaced. Delete marks DELETING, removes
the ZIP, then removes the Registry record. A caller can safely retry partial
operations with the same type, intended user, owner, immutable name, and archive. Downloads
are bounded and are released only after ZIP revalidation and checksum/name/description agreement
with Registry metadata.

ZIP validation rejects malformed or encrypted archives, traversal and absolute
paths, duplicate/conflicting paths, links and special files, excessive size,
entry count, path length or nesting, missing/invalid `SKILL.md`, and invalid skill
names. User skills are Markdown-only. System skills may contain arbitrary regular
supporting files, including scripts, images, and model assets, subject to the same
archive entry, path, type, CRC, count, and size limits. Audit logs contain actor,
operation, type, record ID, result and error code only—never session credentials
or archive content.

## Agent Skill workspace manifest and synchronization

`GET /api/v0/agent/skills/workspace-manifest` is an ordinary authenticated-user
route. It independently traverses all pages of visible READY system publications
and READY user publications whose immutable `agent-skill.userId` is the current
user UUID. Every Registry request and typed read decision uses the caller session;
the lifecycle-only internal administrator identity is never used. A future third
installation source is represented in the response shape but remains unimplemented
until #3861. A publication that belongs to another user is never selected merely
because it is readable.

Malformed, mismatched, or individually denied records are skipped with bounded
warnings. Registry or authorization infrastructure errors fail the complete
manifest request rather than returning a misleading successful empty set. This
lets a synchronizer distinguish an authoritative empty manifest, which can
remove clean stale managed copies, from an outage, which must preserve them.

`mgd agent-skill` is separate from the existing bundled-guidance `mgd skills`
commands. It supports explicit working-directory creation/validation, explicit publication,
caller-authorized list/show/pull/delete, and reconciliation. Published ZIPs are
validated again before extraction. Conditional replacement and deletion require
a strong checksum `If-Match` checked inside the server's per-record mutation lock.
Agent Manager currently deploys as one replica; this process-local serialization
is sufficient for the MVP deployment, but a future multi-replica Manager must
move the compare-and-swap to a Registry conditional mutation or distributed lock
before horizontal scaling.

Local-computer sync uses the distinct authenticated
`GET /api/v0/agent/skills/local-sync-manifest`. It fully paginates only READY
publications whose immutable `userId` equals the caller, returns the verified
tenant/user identity, excludes system and merely readable foreign publications,
and reserves an unimplemented installation source for #3861. Verified
publication snapshots, immutable archives and explicit `pull`/`publish` working
directory refs live under
`${XDG_DATA_HOME:-~/.local/share}/mgd/agent-skills/sources/<hash>/`, where the
hash covers canonical API URL, tenant and user UUID. This prevents identical
record IDs or names on different instances/accounts from sharing state. The
Workspace manifest returns the same server-derived tenant/user identity so the
Sandbox cache is keyed identically.

Installations follow the accepted scan-based design
([local-agent-skill-sync.md](https://github.com/magda-io/magda/blob/design/3811-ai-agent-platform/docs/design/ai-agent-platform-design/local-agent-skill-sync.md),
2026-10-18). Every selected harness root (detected Claude Code, Codex and
OpenCode roots plus a configured DSH root locally; the single DSH root in a
Workspace) receives an **independent real-directory copy** whose root-level
`.magda-skill-install.json` (source key, publication identity, installed
baseline checksum/content digest, random installation id; no credentials) is
the sole durable record of that installation. There is no installation index,
operation journal or cross-harness transaction. The remaining durable state is
the `mgd` profile configuration and each verified account's snapshot/archive
cache and explicit `pull` provenance. Raw skill directories and every
publication ZIP must not contain the marker; only a recognized installation
excludes exactly that file when digesting or publishing.

One reconciliation engine serves online local sync, offline `profile use` and
Workspace sync; they differ only in the verified desired snapshot and target
roots. Each run enumerates the immediate children of every selected root. The
candidates are the desired names plus every directory with a valid marker,
regardless of which profile installed it. An unmarked directory whose name is
not desired is unrelated and ignored, even a former MAGDA skill whose
publication and marker were both removed. A marker is a provenance hint
corroborated against this machine's verified account cache. Clean-ness is
judged against the marker's recorded baseline, so an unchanged older version
updates normally. A missing desired directory is reinstalled. Missing,
malformed or stale metadata with a full tree equal to the desired publication
is repaired without touching skill files. A clean marked copy no longer desired
(remotely deleted, or from another profile) is removed, but only on a complete
verified desired set. Edited content is a conflict. Symlinks, special files,
symlinked roots/ancestors and reserved bundled names are unsafe even with
`--force`.

Online sync has two phases. **Global remote preparation** fetches the
complete manifest and obtains every required ZIP verified against its
checksum, reusing a cached ZIP only on an exact checksum match. Any manifest
failure or warning, or any download or validation failure, aborts the whole
online sync before any installed skill changes, even with `--force`. It never
substitutes older cached content, and the previous verified snapshot stays as
it was. **Independent local reconciliation** follows. All predictable
conflicts are reported, each blocking only its own installation; every other
clean update, clean removal, install and metadata repair proceeds, and
`--force` discards safe conflicting copies. Each skill is applied independently using portable Node.js `fs`: the new
tree, marker included, is staged under `<root>/.magda-skill-staging/<op>/new`,
the old tree moves to `<op>/old`, the new tree is renamed into place and the
backup is dropped. A failed rename restores that one skill. An unexpected
failure in one harness leaves completed skills elsewhere in place and yields
`partial` (nonzero CLI exit). The next sync converges from the actual
directories, first restoring or completing recognizable per-skill leftovers. A
backup is dropped only when the new tree's marker id, verified source and full
content digest all match; ambiguous or incomplete cases retain the backup and
report it. A kernel-released loopback lock
(ports below the OS ephemeral ranges) serializes operations. Cross-harness
atomicity and hostile same-user syscall races are out of scope.

`publish <installed-copy>` targets the account recorded in the marker, not the
active profile. It resolves the verified identity for that source key, finds a
configured profile whose credentials authenticate as exactly that instance,
tenant and user, and replaces the same publication with `If-Match` on that
copy's baseline. It then updates only that copy's marker. Every publish path
(installed copy, `pull` working directory, new skill) caches the exact
acknowledged ZIP for that account, updating only that entry of an existing
snapshot without refreshing its verification time. Other harness copies
reconcile on a later explicit sync. Missing or mismatched
credentials are refused, with no fallback. `pull` working directories keep
their originating account the same way.

`mgd profile use` is commit-first: it saves the new active profile, then
reconciles that profile's previously verified snapshot offline (`--force` and
`--sync-skills` optional). Conflicts or errors never roll back the selection.
They are reported with each copy's installed source, the command exits nonzero,
and older-profile copies may remain discoverable until resolved. An uncached
profile is selected without reconciliation, so nothing is removed on an assumed
empty set. The selection write and its reconciliation, and every
`profile create/update/remove` write, run under the same cross-process lock as
sync and publish. `profile create/update/remove` change configuration only. One-off
`MGD_PROFILE`, URL or credential overrides never change global installations.
Local CLI synchronization does not write Workspace claim annotations.

Essential credential/DSH bootstrap is the only READY gate. After the adopted or
cold Sandbox has restarted with its managed credential, Agent Manager records
READY first and runs skill synchronization as detached, best-effort work. Only
the provisioning call that itself created the claim (a new, empty Sandbox) runs
`mgd agent-skill sync --force --workspace-status`; restart recovery of an
existing claim (including a persisted `notAttempted` status) and reattachment
run the non-forced form, so existing edits survive and are reported as a
`partial` result. A manual `mgd agent-skill sync [--force]` in the Sandbox uses
the same engine and never updates Manager-owned status. Its
separate `success | partial | failed | notAttempted` status contains only aggregate
counts, timestamps, a bounded diagnostic code (`EXEC_FAILED`, `TIMEOUT`,
`INVALID_RESULT` or `REMOTE_SOURCE_FAILED`), and up to 20 sanitized per-skill
problems (skill name plus a stable reason code; no paths, messages or conflict
details). Failure or total API outage never changes lifecycle READY or blocks
the runtime iframe. The user can rerun a Manager-owned attempt with
[Retry / Re-check](#workspace-skill-sync-status-and-retry--re-check). Warm-pool Sandboxes
therefore contain neither user credentials nor synchronized user skills before
claim adoption.

The pinned DSH `0.2.1-alpha.1` filesystem provider scans immediate
`<root>/<name>/SKILL.md` bundles (and top-level `<root>/*.md`) and watches
existing and late-created roots; the installation marker and the hidden staging
directory therefore never appear as skills.
Provider experiments in the built runtime confirmed additions, metadata/body
updates, and removals are visible on the next model step without a process restart
or new conversation. Existing loaded tool results remain historical context. The
Web slash-suggestion cache may require a page reconnect or new Session to display
a changed name immediately, while a directly typed invocation and the next model
step use current host discovery.

## Settings: Agent Skills catalogue (#3857)

Settings has a non-clickable **Agent Workspace** group. Its children are
checked independently from `whoami` permissions, and the group appears when any
child is available:

| Child          | Route                                     | Shown when                                                                                      |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Open Workspace | `/settings/agent-workspace`               | `agentWorkspace/access`                                                                         |
| Agent Skills   | `/settings/agent-workspace/skills`        | `object/agentSkill/system/read` **or** `object/agentSkill/user/read` (constrained grants count) |
| Shared Skills  | `/settings/agent-workspace/shared-skills` | reserved for #3861; not shown                                                                   |

Both routes are behind the existing `agentWorkspace` feature flag and their own
route guard. Menu visibility is a hint; the APIs enforce access. A user can
browse the catalogue without Workspace access, and the page then omits the
**Open Workspace** link.

The **Agent Skills** page has a compact header (with **Open Workspace** when
allowed) and a collapsible guide that explains skills and the capture → review
→ publish flow with a concrete CSV example. The guide opens by default only when
the first unfiltered page is empty; the user's own toggle is never overridden.
The page lists published READY skills through the
existing `GET /api/v0/agent/skills`:

- **All** (`type=all`): READY system skills plus the caller's READY user
  skills, as one Registry query.
- **My Skills** (`type=user&userId=current`) and **System Skills**
  (`type=system`).
- Pages use the Registry keyset `pageToken` only (no `orderBy`); the browser
  keeps previous tokens for **Previous**. Changing filter or search returns to
  the first page. Nothing is filtered in the browser.
- Keyword search passes `q` to the Registry full-text condition, applied in SQL
  before paging. It matches whole words in skill metadata such as names and
  descriptions; it is not an exact name search.

Entries are compact cards in a two-column grid on wide screens (one column
otherwise): name, type, description, last-updated date and actions, with the
publication ID, intended user (user skills), owner, and created/updated time and
user under a per-card **Details** disclosure. System
entries are metadata only. User entries offer **Download ZIP** and, when the
caller holds `object/agentSkill/user/update` for their own publication,
**Replace ZIP**. Replacement uses the same `PUT .../archive` path as `mgd`:
Agent Services re-validates the archive, typed permission and immutable name,
and the listed checksum is sent as `If-Match`. Invalid archive, name change,
permission, conflict, size and network errors each have specific messages.
After success the page says a running Workspace is not updated automatically:
ask the agent to resynchronise skills, or run `mgd agent-skill sync` in the
Workspace. There is no create, delete, metadata editing or system ZIP action.

## Workspace skill-sync status and Retry / Re-check

**Open Workspace** keeps DSH as the main area. A compact status in the
Workspace toolbar always shows the Manager-owned sync state, and the details
banner above DSH (counts labelled "Last sync", sanitized per-skill reasons and,
for a remote-source failure, that no installed skill changed) appears only
when it matters:

| State                                          | Banner                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| In progress                                    | Shown while running                                                 |
| `partial` / `failed`, or a Retry request error | Pinned until resolved (errors can be dismissed)                     |
| `success` completed while the page is open     | Shown for 15 s, keyed on `completedAt` so polling never restarts it |
| Earlier `success`, `notAttempted`              | Hidden; the toolbar status toggles it                               | `GET /api/v0/agent/session` is read-only and |

reports `skillSync.inProgress` while a Manager attempt runs.

After `partial` or `failed`, **Retry / Re-check skill sync** opens one
confirmation that the forced sync may replace or remove locally edited or
same-named installed skill folders. Cancel sends nothing. Confirm calls
`POST /api/v0/agent/session/skill-sync/retry` with no body:

1. The route requires `agentWorkspace/access`; the target is the verified
   caller's own claim, never a request value.
2. The claim must exist, carry the caller's user label, not be deleting, and
   be READY, and no lifecycle operation may be running (`409` otherwise).
3. Attempts for a claim are serialized in the single-replica Manager. A second
   Retry joins a running forced attempt (`deduplicated: true`); a running
   non-forced recovery sync finishes before the forced attempt starts.
4. The Manager runs `mgd agent-skill sync --force --json --workspace-status` in
   the Sandbox, validates the bounded summary, and writes status only with the
   claim-UID + READY JSON Patch tests. A reset or replacement during the attempt
   leaves the newer claim untouched, and the request returns `409 WORKSPACE_CHANGED`.
5. It waits up to 25 seconds (`skillSyncRetryWaitMs`) and returns `200` with
   the result, or `202` with `inProgress: true`; the page then polls status
   every 2 seconds.

Forced sync never bypasses remote preparation: an unavailable Registry or
Storage aborts before local changes. Skill-sync failure never affects READY or
DSH. Manual `mgd agent-skill sync` and the `magda_agent_skill_sync` tool remain
separate and never update this status.

### Stage 2 qualification

See [Agent Skill synchronization checks](../e2e-test-cases/agent-workspace.md#agent-skill-synchronization-checks)
in the E2E procedure for the Minikube and CLI sync test matrix. The authoritative
local reconciliation contract and recovery semantics remain above.

## Workflow capture and skill suggestions

Stage 3 (#3856) lets a user turn work they have finished in DSH into a reusable
Agent Skill by asking the agent. It adds no backend API, database table,
publication record or background service: the agent drafts Markdown in the
Workspace and publishes it with the Stage 2 `mgd agent-skill` commands, using
the user's own credentials.

### Runtime-bundled `capture-workflow` skill

`magda-agent-runtime/skills/capture-workflow/SKILL.md` is copied into the image
as root-owned, read-only `/usr/local/lib/magda-agent/skills/capture-workflow/`,
and `DSH_BUNDLED_SKILL_DIR` points DSH's filesystem skill provider at
`/usr/local/lib/magda-agent/skills`. In DSH `0.2.1-alpha.1` this is the provider's
`bundled` root. It is read directly from the host filesystem (`trustedHost`),
so it is available in every Workspace even when Registry, Storage API or skill
sync is down, and it never enters a ZIP, the Registry or MinIO. It does not
change `mgd skills install` or the image's `magda-mgd` guidance in
`~/.agents/skills`. Synchronized skills still land in `$DSH_HOME/skills`.

DSH gives the bundled root the lowest precedence (rank 600, after project
`.dsh/skills`/`.agents/skills`, custom roots, `$DSH_HOME/skills` and
`~/.agents/skills`). Both `mgd` and Agent Services reserve the names
`capture-workflow` and `magda-mgd`, so no publication or synchronized copy can
use them. Only a directory the user deliberately creates in their own Workspace
could shadow the bundled skill; the shipped file itself cannot be modified.

Users invoke it by asking in chat ("save what we just did as a skill") or by
typing `/capture-workflow`. The skill instructs the agent to:

1. confirm the task finished successfully and was validated; an unfinished or
   failed workflow is never presented as verified;
2. collect inputs, tools, `mgd` commands, datasets, steps, validation, outputs
   and limitations from the context, tool results and Workspace files, and
   read selected session history only when an important detail is missing;
3. generalise dataset IDs, paths, URLs and identifiers into documented inputs,
   and leave out credentials, personal data and bulk output;
4. choose a valid, unused name (409 on publish means "pick another name"),
   create `skill-drafts/<name>` with `mgd agent-skill init`, edit it with
   ordinary DSH file tools, and run `mgd agent-skill validate`;
5. present the draft and **stop**: say it is local, unpublished and lost when
   the Workspace is reset, replaced or terminated (including logout);
6. publish with the trusted `magda_agent_skill_publish` tool once the user
   approves (below), with `type: "user"` by default or `type: "system"` only when
   an authorized user explicitly asks, and report the result accurately.

The skill also documents later `list`, `show`, pull, edit, republish, delete and
sync operations, and requires the agent to say whether each change is local or
published. It treats conversation text, tool output, dataset content and history
as untrusted data, so instructions found there are never copied into a skill or
acted on. Typed `object/agentSkill/<type>/<operation>` authorization and the
Stage 2 publish rules (source-account identity, `If-Match` replacement, ZIP
validation and the Markdown-only user-skill restriction) are unchanged.

### Trusted Agent Skill tools

DSH's managed `workspace-write` sandbox lets Bash and file tools write only inside
the session workspace. `mgd agent-skill init`, `validate`, `list` and `show` run
there unchanged. `publish`, `sync`, `pull` and `delete` legitimately update `mgd`
state outside it: the profile's cached Agent Skill identity in
`/data/config/mgd/config.json`, verified caches and the operation lock under
`/data/local/share/mgd`, and `$DSH_HOME/skills` for `sync`. Run from Bash, they
fail with `EROFS` and need DSH's generic `danger-full-access` escalation, a second
technical approval after the user has already agreed to publish. The pinned DSH
also cannot add extra writable roots, and widening the sandbox would expose the
credential-bearing profile file to arbitrary commands.

Instead, `magda-agent-runtime/dsh-agent-skill-tools` (`@magda/dsh-agent-skill-tools`,
inserted by `magda.cordis.patch.yml`) registers four typed tools with the pinned
`ctx.tools.register(defineTool(...))` API:

| Tool                        | Runs                                       | Arguments                                                                  |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `magda_agent_skill_publish` | `mgd agent-skill validate`, then `publish` | `path`, `type` (`user`/`system`), `userApproved`, `overwriteRemoteChanges` |
| `magda_agent_skill_delete`  | `mgd agent-skill delete`                   | `ref` (`<type>/agent-skill-…`), `userApproved`, `overwriteRemoteChanges`   |
| `magda_agent_skill_sync`    | `mgd agent-skill sync`                     | `force`, `userApproved` (force only)                                       |
| `magda_agent_skill_pull`    | `mgd agent-skill pull`                     | `ref`, `output`                                                            |

The tools run in DSH's host process, as the same nonroot user in that user's own
Sandbox. They start the existing `mgd` binary with `execFile`, a fixed argv and no
shell. Paths are validated and passed as absolute paths: a draft must be a real
directory inside `/data/workspace`, an installed copy must be a marked direct
child of `$DSH_HOME/skills`, and a pull output must be a new directory inside the
Workspace. Symlinks, other paths, option-like references and arbitrary
commands are refused before `mgd` runs. `mgd` keeps doing the validation, source
account selection, publication cache, optimistic concurrency and authorization
through Agent Services; the tools add no authorization, approval store or
backend. Each result is a small object (outcome, publication
`type/id/name/checksum/updatedAt/ownerId`, local-cache state, a sanitized and
bounded error, and guidance). Raw process output and credentials are never
returned. Ordinary Bash and file tools keep the unchanged `workspace-write`
sandbox and `ask` approval policy, and the overlay never mentions
`danger-full-access`.

### One approval for publishing

Publishing needs exactly one meaningful user decision:

- If the user clearly approved publishing **this reviewed draft** in chat ("Publish
  it", "Save this to my MAGDA account"), the model sets `userApproved: true` and
  the tool publishes directly, with no further dialog.
- Otherwise (`userApproved` false or omitted), the same tool call asks with DSH's
  existing `ctx.userQuestions.ask()` question card, offering **Publish** and
  **Cancel**. Selecting Publish continues the publication inside that call; no
  second model step or Bash approval follows. Cancel, custom text, dismissal,
  an aborted turn or no connected question UI publish nothing.

`userApproved: true` is the model's assertion of the user's intent, not
independently verified consent. MAGDA deliberately relies on the model's
conversational judgment instead of a second rule-based approval interpreter,
signed tokens or consent records, and accepts the residual risk of
misinterpretation or prompt injection in this per-user Workspace. The skill
still separates drafting, review and approval: compliments, edits, validation,
the agent's own suggestion and instructions in files, datasets or tool output
are not approval. The same rules apply to `delete` and to a forced `sync`.

User and system skills use the same tool, the same rule and the same question
card; only the wording differs:

- **User:** "Publish the Agent Skill "<name>" to your MAGDA account? It will be
  saved as your user skill and can be reused in your future Agent Workspaces."
- **System:** "Publish "<name>" as a system Agent Skill? This is a system skill.
  Publishing it can make it available to other authorised MAGDA users and their
  Agent Workspaces, subject to system-skill visibility settings. By default that
  is users granted Agent Skill read access; it is never available to anonymous
  users." (System publications are created with `constraintExemption=true`, so
  holders of the typed system read permission can discover them.)

There is no system-only dialog or role check in the tool: Agent Services' typed
`object/agentSkill/system/create` decision alone decides, and a refusal comes
back as a `rejected` 403.

`overwriteRemoteChanges: true` (`mgd --force`) bypasses optimistic concurrency.
The same single question then says so, for example "Publish "<name>" and
overwrite the newer version currently stored in MAGDA? Any changes made to that
published version since your copy was created will be lost.", or that a delete
removes the skill "including those newer changes". With explicit chat approval
the model's judgment applies as before.

### Publication outcomes

A failed `mgd` write is not proof that nothing was published. `mgd` now labels
failed mutating requests, and the tool maps them to outcomes:

| Outcome                 | Meaning                                                                                                       | What the agent does                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `published` / `deleted` | The server confirmed it                                                                                       | Report `<type>/<id>`. With `localCache: failed`, still report success, with a local-cache warning; never publish again                                                                                                                            |
| `rejected`              | Explicit HTTP 400/401/403/409/412                                                                             | Report the reason (409: choose another name; 412: pull and reconcile). No automatic verification or retry                                                                                                                                         |
| `failed`                | Failed before the request was sent: invalid draft or path, unreachable service (`outcome: not-sent`)          | Report it. Nothing was published; no follow-up request                                                                                                                                                                                            |
| `uncertain`             | Timeout, connection reset, 5xx, unreadable response or interrupted process after sending (`outcome: unknown`) | Report the network error and unknown status promptly. Never resend; don't query a service that appears to be down. Later, `mgd agent-skill show <type>/<id>` may confirm success only if type, ID, owner and checksum match the returned `target` |
| `cancelled`             | The user did not select the action                                                                            | Nothing changed; don't ask again unless asked                                                                                                                                                                                                     |

For an `unknown` write, `mgd --json` includes `details.target` (operation, type,
deterministic ID, name and the local archive's SHA-256), so a later check can
compare against the intended publication. `mgd` never retries a write itself.
`mgd agent-skill pull` extracts the skill before recording its provenance, so a
failed pull reports `directoryCreated`. If the directory exists, the agent
inspects it before retrying instead of assuming nothing was pulled.

`skill-drafts/` sits under the session's working directory, so it is visible in
the DSH file explorer, while `.agents/skills`, `.dsh/skills` and
`$DSH_HOME/skills` would be loaded as active skills. A draft exists only on this
Workspace PVC. A published skill is stored in the Registry and Storage API, so it
survives Workspace reset and deletion. The Manager's forced sync installs it into
every new Workspace, and `magda_agent_skill_sync` (or `mgd agent-skill sync` in
the terminal) installs it in the current one.
Publishing never updates other existing copies on its own.

Example conversation:

> **User:** We've found the rainfall dataset, profiled its CSV distribution,
> computed monthly totals and checked them against the published annual figure.
> I do this for other datasets every month. Can you save the procedure as a skill?
>
> **Agent:** I've drafted `profile-csv-distribution` in
> `skill-drafts/profile-csv-distribution/SKILL.md`. Its inputs are a dataset
> (ID or search terms), the date and value columns, and an optional reference
> total. It covers finding the CSV distribution with `mgd`, checking the schema,
> aggregating with pandas, and the validation and failure checks we used. The
> dataset ID, file paths and our results are not included, and `mgd agent-skill validate`
> passed. **This is a local draft and has not been published.** It will be lost if
> this Workspace is reset or terminated. Please review it in the file explorer;
> I'll publish it only if you tell me to.
>
> **User:** Looks good. Publish it.
>
> _(The agent calls `magda_agent_skill_publish({ path: "skill-drafts/profile-csv-distribution", type: "user", userApproved: true })`; no other prompt appears.)_
>
> **Agent:** Published `user/agent-skill-<your-user-id>-profile-csv-distribution`
> to your MAGDA account. New Workspaces will install it automatically. Would you
> like me to synchronise it into this Workspace too?

If the user's reply is not clearly an approval, the agent calls the tool without
`userApproved`, and the user chooses **Publish** or **Cancel** in the question
card instead.

### Occasional suggestions in the DSH system prompt

In the pinned DSH, every Web agent preset (`standard`, `ptc`, `minimal`,
`cordis`) mounts its own `@deepseek-ai/dsh-persona` row. That row shadows the
global `system-prompt` `personaPrefix`/`personaSuffix`. Cordis patches also
replace a matched row's whole `config` and cannot reach rows nested in a
preset's `config.plugins`. Patching `system-prompt` would therefore change
nothing for the default preset, and patching a preset would have to restate its
entire plugin list. Instead the managed overlay inserts one small host plugin:

```yaml
- insert:
    - id: magda-workflow-capture-guidance
      name: "@magda/dsh-workflow-capture-guidance"
```

`magda-agent-runtime/dsh-workflow-capture-guidance` registers a single global
prompt section, `magda:workflow-capture-suggestions`, at order 9800. That places
it after DSH's tool guidance and before the structured-output and
environment-bearing suffix sections. Its text is static, so the prompt prefix
stays cacheable. DSH's identity, presets, personas, `{{model}}`/`{{cwd}}`
templates, tool guidance and agent-instructions loading are unchanged, and a
preset with a `complete` persona (`minimal`) keeps its exact prompt. The section
asks for one short, optional question at the end of the final reply. It applies
only when the task took several steps or tool calls and was completed and
verified, and could be reused with other inputs (or the user says they do it
regularly). It must also not already be a saved skill, and the offer must not
have been made or declined in this conversation. It rules out offers for simple
answers, failed or partial work, repeated turns and subagents, and states that an
offer is not consent to publish. A first, permissive wording ("may occasionally
offer…") produced no offer in three qualifying Minikube runs; the conditional
wording produced the offer on a qualifying run, and none after a decline, a
simple question or a failed task. To change the wording, edit the
plugin and rebuild the image. To disable it, remove the insert row (or add
`- id: magda-workflow-capture-guidance` with `disabled: true` in a later patch
layer). Suggestions are model judgment, not a detector, so there is no
background agent, `turn/end` hook or suggestion database.

### Session history for workflow capture

Findings for DSH `0.2.1-alpha.1`:

- `session-persistence-jsonl` stores each session at
  `$DSH_HOME/sessions/--<normalized-cwd>--/<session-id>/session.v4.jsonl.zstd`
  on the Workspace PVC (`/data/agent-home/sessions`). The file is a stream of
  concatenated, checksummed Zstandard frames, one per durable batch; Node's
  one-shot `zstdDecompressSync` and its stream decoder each return only the first
  frame. Each row is one JSON event: a `session` header (`version: 4`, `id`,
  `cwd`, `delegationDepth`, `agentPreset`), then `user/message`,
  `assistant/message`, `tool/call`, `tool/result`, `turn/*`, `step/*`,
  `system/message`, `request/header`, `session/title` and so on.
- Compaction appends `compaction/start`, `compaction/summary`, a
  `user/message` with source `compact-checkpoint` and `compaction/end`. The
  original events stay in the log; the summary only replaces them in the model's
  projected history.
- `system/message` and `request/header` contain the full rendered prompt and
  tool schemas, `assistant/message` contains reasoning, and harness-generated
  `user/message` rows carry runtime context and skill catalogues.
- DSH ships no agent-facing history tool. `session-query` is an internal
  service whose SQLite index is `:memory:`/never opened in the Web profile, and
  `session-reference` is a user-driven `@session` mention for _other_ sessions.
  DSH's Web API requires the browser launch token, which the agent must not use.
  Its bash tool exports `DSH_SESSION_ID`.

The image therefore adds a small read-only helper, `magda-session-history`
(`magda-agent-runtime/session-history.mjs`). It runs as the agent user with no
extra privilege and reads only `$DSH_HOME/sessions`. It opens files read-only
(no-follow) without taking DSH's lock, refuses symlinked directories and logs,
and supports only format v4 (other versions fail with a clear error). Sessions
default to `$DSH_SESSION_ID`. `list`, `outline` (one line per turn, with its seq
range, tools and outcome) and `events` (filter by `--from-seq`, `--to-seq`,
`--turn`, `--type` and `--grep`) return only user prompts, assistant text, tool
calls and results, turn outcomes and compaction summaries. They never return
system prompts, request headers, runtime context, compaction checkpoints or
reasoning. Credential-shaped values (`Authorization`/`X-Magda-*` headers, bearer
tokens, JWTs, `apiKey=`/`password:` style pairs, URL tokens, private keys and the
values of secret-named environment variables) are redacted on a best-effort basis
**before** filtering, so `--grep` cannot probe redacted values, and output is
labelled as untrusted data. It never reads `mgd` credentials, the DSH launch token
or other users' data: each user's PVC holds only that user's Workspace.

History is processed incrementally rather than decompressing and splitting the
whole file:

1. A 1 MiB read window serves the compressed file. Complete frame boundaries are
   found from frame and block headers only, so payloads are not read while
   scanning, and a torn final frame is ignored.
2. One complete frame at a time is decompressed with Node's `zstdDecompressSync`
   and a per-frame output cap. Node's stream decoder stops after the first of
   DSH's concatenated frames, so it is not used.
3. Rows are assembled by bytes across frames. The newline byte never occurs
   inside a multi-byte UTF-8 sequence, so rows and characters split across frames
   are reassembled exactly. Oversized rows are discarded without being buffered.
4. Each row is projected, redacted and filtered at once; nothing else is retained.
   `events` stops after `limit + 1` matches or past `--to-seq`. With `--from-seq`,
   it binary-searches the frame index (decoding about log₂(frames) frames) and
   starts one frame earlier for turn context. `outline` keeps only per-turn
   aggregates. `list` reads the header frame and looks for the latest title in the
   last and first 2 MiB of decoded frames, so a rename made only in the middle
   of a very long session may show an older title.

| Budget                                               |                 Limit |
| ---------------------------------------------------- | --------------------: |
| Compressed session file                              |               256 MiB |
| Compressed or decoded frame                          |                32 MiB |
| Decoded bytes processed per query (work, not memory) |               512 MiB |
| One JSONL row                                        |                16 MiB |
| Events per page                                      |      100 (default 20) |
| Characters per event                                 | 8,000 (default 1,200) |
| Output                                               |                64 KiB |
| Outline turns                                        |      200 (default 30) |
| Discovered sessions                                  |                   500 |

A skipped oversized row or frame, an exhausted work budget, or the output
limit makes the result explicitly incomplete:

- JSON has `complete: false` and `incomplete.reason`, with `resumeFromSeq`,
  `resumeFromTurn`, `scannedThroughSeq` or `omittedSessions`.
- Text starts with `# INCOMPLETE RESULT`.
- The exit status is 3.

The 64 KiB output limit is applied while building the result. Whole events,
outline turns or `list` entries are dropped from the end (the largest prefix
that fits, banner included), the cursor points at the first dropped item, and
JSON stays valid; the output is never cut mid-value. `list --json` returns
`{ sessions, complete }`. A budget that stops a listed session from being
inspected makes the list incomplete. `MAGDA_SESSION_HISTORY_LIMITS` can only lower limits,
for tests.

Benchmark: `node magda-agent-runtime/bench-session-history.mjs`, run in a
Minikube gVisor Sandbox with Node 22.22. Sessions use the row mix and sizes
measured from a real DSH session, with each query in a fresh process (time /
peak RSS):

| Session                           | Query                    | Previous helper      | Incremental helper     |
| --------------------------------- | ------------------------ | -------------------- | ---------------------- |
| 20 turns (0.1 MiB)                | any                      | 11–13 ms / ~130 MiB  | 7–13 ms / ~120–130 MiB |
| 3,000 turns (16 MiB, 27k frames)  | first page               | 1,072 ms / 613 MiB   | 8 ms / 125 MiB         |
|                                   | last page (`--from-seq`) | 776 ms / 605 MiB     | 53 ms / 131 MiB        |
|                                   | `outline`                | 826 ms / 614 MiB     | 404 ms / 160 MiB       |
|                                   | `--grep` (full scan)     | 1,096 ms / 612 MiB   | 727 ms / 153 MiB       |
|                                   | `list`                   | 780 ms / 621 MiB     | 159 ms / 232 MiB       |
| 10,000 turns (54 MiB, 90k frames) | first page               | 2,885 ms / 1,068 MiB | 9 ms / 139 MiB         |
|                                   | last page                | 2,060 ms / 1,054 MiB | 73 ms / 145 MiB        |
|                                   | `outline`                | 2,194 ms / 1,053 MiB | 1,184 ms / 157 MiB     |
|                                   | `--grep` (full scan)     | 2,842 ms / 1,072 MiB | 1,791 ms / 154 MiB     |
|                                   | `list` (3 sessions)      | 2,319 ms / 1,073 MiB | 241 ms / 333 MiB       |

About 120 MiB of each figure is the Node process baseline under gVisor. The
previous helper refused logs over 64 MiB; the incremental helper accepts up to
256 MiB and stays bounded because work, not file size, is capped.

The skill tells the agent to rely on the available context first, because a
compaction summary is often enough. It should use the helper only when a
specific detail is missing, with narrow queries, and ask the user when a detail
cannot be recovered. Reconstruction is limited to what DSH persisted for this
Workspace: a reset Workspace has no history, and the helper does not make
reconstruction complete or authoritative.
