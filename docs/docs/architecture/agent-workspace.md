# Agent Workspace architecture and deployment

## Status and scope

Agent Workspace is an opt-in Magda capability that gives each authorized user a
private, browser-based coding and data-analysis agent. The MVP embeds DeepSeek
Harness (DSH) Web under **Settings → Agent Workspace**, bundles the `mgd` CLI,
and connects the agent to Magda using the current user's authority.

The feature is disabled by default with `global.agentWorkspace.enabled=false`.
Access requires the grantable `agentWorkspace/access` permission, which is
assigned through ordinary Magda roles (see [Workspace access](#workspace-access)).
It supports one current workspace per user.

## Architecture

![Agent Workspace architecture](./_resources/agent-workspace-architecture.png)

The browser uses same-origin Settings, lifecycle, DSH HTTP/WebSocket, and LLM
routes. Agent execution is isolated in a per-user Sandbox and PVC; model-provider
credentials remain in the Magda namespace.

### Components

- **Magda Web** exposes the feature-flagged Settings route to users whose
  `whoami` permissions include `agentWorkspace/access`, and renders
  lifecycle state. When ready, it embeds the runtime through
  `/api/v0/agent/runtime/` with DSH's native responsive sidebar, session history,
  Search, and collapse/expand navigation.
- **Agent Manager** is stateless. It authenticates the Gateway session through
  `whoami`, checks the `agentWorkspace/access` policy decision, manages Kubernetes resources,
  bootstraps the runtime, proxies DSH HTTP/WebSocket traffic, and reconciles idle
  workspaces.
- **Kubernetes Agent Sandbox** provides the per-user execution boundary. The
  qualified release is Kubernetes Agent Sandbox v1.0.4. The installation renders
  exactly one selected runc, gVisor, or Kata template and warm pool.
- **Agent Runtime** pins DSH, bundles `mgd`, and applies a deployment-owned Cordis
  profile. The workspace is mounted at `/data/workspace`; runtime configuration
  and DSH state are stored on the same per-user PVC.
- **LLM Services** independently authenticates the Magda user and allowlists
  deployment-selected model IDs before proxying to LiteLLM. Provider errors are
  sanitized at this boundary.
- **LiteLLM** holds the provider configuration. Provider credentials enter only
  through a Kubernetes Secret and are never sent to the browser or Sandbox.
- **Authorization API and DB migration** provide expiring system-managed API
  keys. These keys are private, hidden from public key lists, and immutable
  through public key-management routes.

## Lifecycle and resource identity

A user UUID and stable installation ID map deterministically to the claim name
`magda-agent-<installation ID>-<user UUID>`. Claims carry both
`agent.magda.io/installation-id` and `agent.magda.io/user-id` labels.
The user-visible states are:

`ABSENT`, `ALLOCATING`, `BOOTSTRAPPING`, `READY`, `SUSPENDING`, `SUSPENDED`,
`RESUMING`, `DELETING`, `FAILED`, and `DEGRADED`.

Provisioning performs these operations:

1. Create the installation-scoped user's `SandboxClaim` from the selected warm
   pool, making interrupted provisioning discoverable before issuing a secret.
2. Rotate the installation-scoped reserved managed API key. Its expiry follows
   the current eight-hour inactivity deadline.
3. Wait for the claim and Sandbox Pod to become ready.
4. Send a one-time bootstrap payload through `pods/exec` over stdin.
5. Write `mgd` configuration and DSH environment to mode-0600 files on the PVC.
6. Restart the runtime container and require post-bootstrap readiness before
   returning `READY`.

Idle `READY` workspaces are suspended even if an otherwise idle runtime WebSocket
remains open. While the workspace iframe is visible, the Settings page continues
polling lifecycle status so suspension replaces the stale iframe with the Resume
UI. Resume reuses the PVC and Sandbox and renews the deadline. Reset, explicit deletion, and logout revoke the key,
close sockets, delete the claim and storage, and remove all DSH sessions and
workspace files. Logout waits for cleanup before destroying the Magda session.
Any destructive cleanup that is only partially completed remains durably
`DELETING`; reconciliation retries key revocation and claim/PVC deletion after a
dependency recovers rather than stranding the workspace in `FAILED`. Reset also
persists its replacement intent, so successful retry cleanup provisions the fresh
workspace requested by the user. Reconciliation is single-flight globally and
shares the per-user lifecycle lock with UI actions; Terminate durably clears the
intent and cancels any in-flight replacement before it can be reprovisioned.

### One workspace, multiple sessions

A Magda user has one current SandboxClaim, PVC, filesystem workspace, and managed
API key per Magda installation. That Sandbox can hold multiple native DSH
**Sessions**. New Session creates another conversation in the existing
`/data/workspace`; it does not allocate another Sandbox, PVC, or key. The DSH
sidebar provides creation, history, rename, Search, switching, and reopening.
Sessions and files survive browser refresh, Pod replacement, and suspend/resume
because DSH state and `/data/workspace` share the PVC. Reset, Terminate, and
logout remove all sessions and files with that single workspace.

The PVC uses deployment-owned names rather than upstream product names:

- `/data/agent-home` contains DSH profiles, credentials, session logs, and storage;
- `/data/workspace/agent-harness/default-workspace` is the default working tree.

The pinned DSH release hard-codes its `deepseek-harness` directory segment, so
the runtime Dockerfile performs a fail-closed, version-specific replacement when
building the image. This pre-release path rename deliberately has no PVC migration:
reset local test workspaces after deploying it so the new workspace starts with
only the deployment-owned names.

## Workspace access

One grantable OPA operation, `agentWorkspace/access` (#3858), lets an
authenticated user operate their **own** Agent Workspace: start, status,
resume, reset, terminate, the DSH runtime HTTP proxy, DSH WebSocket upgrades,
and the Workspace's model access through LLM Services. There are no
action-specific Workspace operations.

- **Registration:** authorization migration `V2_5__agent_workspace_access.sql`
  registers the `agentWorkspace` resource, the operation, and one unconstrained
  permission, **Access Own Agent Workspace**. It attaches the permission to the
  unassigned stock role **Agent Workspace Users** from `V2_4`. It is not granted
  to Authenticated Users, and **Agent Skills Admins** does not imply it.
- **Policy:** `magda-opa/policies/agentWorkspace/allow.rego`, reached from the
  entrypoint only for the exact URI `agentWorkspace/access`. It allows a
  non-anonymous user holding an unconstrained permission on the `agentWorkspace`
  resource. Global administrators keep access to their own Workspace through the
  existing entrypoint administrator override. No role is hard-coded in Agent
  Manager or LLM Services.
- **Self-only:** the decision carries no object input. Agent Manager derives the
  SandboxClaim from the verified session user and installation, never from a
  request body, query, header, user ID, claim name or pod name. Granting the
  permission (even to an administrator) never reaches another user's Sandbox.
- **Enforcement:** Agent Manager verifies the Gateway-issued `X-Magda-Session`
  JWT, confirms it with `whoami`, then requests a full-evaluation decision from
  `GET /v0/opa/decision/agentWorkspace/access?unknowns=`. Missing or invalid
  sessions return 401, a denial returns 403, and an unavailable policy engine
  returns 503 (fail closed). This applies to every lifecycle route and to every
  runtime HTTP request and WebSocket upgrade. LLM Services applies the same
  decision, because the Workspace calls the model with the user's own
  lifecycle-bound key.
- **Revocation:** each new lifecycle or runtime request is decided again. Open
  DSH WebSockets are re-checked every `RUNTIME_AUTH_RECHECK_SECONDS` (default
  60). A 401/403 closes them and logs `agent-websocket-access-revoked`; a
  transient policy outage keeps them until the next check. Revocation does not delete the Workspace; an operator or the
  normal idle lifecycle does that.
- **Navigation:** `whoami` permissions are only a hint for showing **Open
  Workspace**. The route and API remain the authorization boundary.
- **Independence from skills:** `agentWorkspace/access` grants no Agent Skill
  permission, and the typed `object/agentSkill/{system,user}/read` permissions
  grant no Workspace access.

To let a user open their Workspace, assign them **Agent Workspace Users** (which
also grants the typed own/visible skill permissions) or add **Access Own Agent
Workspace** to another role.

## Authentication and trust boundaries

- Browser cookies and Gateway session headers terminate at Agent Manager. They
  are stripped before proxying to DSH.
- Agent Manager exchanges the memory-only DSH launch token for a DSH cookie and
  never returns either credential to the browser.
- The runtime receives a lifecycle-bound Magda key as raw `<key-id>:<key>`.
  DSH's OpenAI adapter adds the HTTP authorization scheme. Adding `Bearer` to
  the stored value is incorrect because DSH expects a raw API key.
- `mgd` uses the same lifecycle-bound user key against the configured external
  Magda `/api` base URL, so normal Magda authorization remains authoritative.
- Agent Manager RBAC includes `pods/exec` for bootstrap and deliberately excludes
  `pods/log` to avoid exposing the one-time payload.
- Gateway logout cleanup uses both a system JWT and a separate randomly generated
  control-plane secret. Destructive cleanup is same-origin gated.
- The Sandbox NetworkPolicy allows DNS, the selected ingress controller, and
  explicitly configured external CIDRs/ports. Private address ranges otherwise
  remain denied.

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

The typed OPA policy delegates every concrete `agent-skill` record exclusively
by its actual or proposed `type`; a generic `object/record` permission alone
cannot read or mutate a valid typed publication. Read rules use
Registry-compatible literal/existence conditions for partial authorization, then
Agent Services validates the full deterministic identity of every returned
record before exposing it. Typed write rules validate each concrete state.

Cross-version business invariants belong to the supported Agent Services API in
this stage. Agent Services preserves immutable publication type, intended user,
ID/name, creator, archive key, and owner and fails closed on inconsistent or
wrong-type records. Generic Registry clients with sufficient permissions may
still bypass those service-owned invariants through marker removal, separately
authorised old/new states, bulk mutation, or source trimming. That accepted MVP
integrity limitation is not a supported Agent Skill management path; generic
Registry mutation-context and bulk hardening are deliberately isolated for
independent design, compatibility, concurrency, and performance review in
#3862 and draft PR #3863. The only Registry production adjustment retained by
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
Authenticated Users. #3858's later `V2_5` migration registers
`agentWorkspace/access` and attaches it to Agent Workspace Users, so `V2_4` never
references a nonexistent operation. Installation operations and their owner permission are
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
browser, DSH, or `mgd`. The initial Registry create and Storage upload use the
real caller, update writes use the caller's update authority, and final delete
uses the caller's delete authority. Explicit `createdBy`, `updatedBy`, and
`access-control.ownerId` always retain real-user attribution.

Storage API assigns the original object owner and `magda-record-id`; replacement
uses the same key and a trusted existing record link so neither can be rebound by
query parameters. It preserves ownership while Registry records the current
publisher in `updatedBy`.

Reads under the two reserved Agent Skill archive prefixes have a deliberately
stronger boundary than ordinary Storage objects. Every generic Storage-read
branch—including unconstrained, owner, matching-OrgUnit, and legacy missing or
empty-OrgUnit access—is excluded. A read requires an existing deterministic
Agent Skill record, exact trusted record ID/key/owner linkage, and the caller's
corresponding typed source-read permission. Missing, malformed, or mismatched
linkage fails closed. Public system skills remain readable through their
exemption-capable typed system-read grant, while shared user skills require an
applicable typed owner, OrgUnit, or explicit pre-authorised grant. The existing
top-level global-administrator override remains unchanged and covers MAGDA's
trusted internal lifecycle inspection; Agent Services never uses that identity
for caller downloads.
Ordinary standalone objects, dataset/distribution files, and their historical
missing/empty-OrgUnit read behavior are unchanged. Generic upload/delete rules
are also unchanged in this focused revision.

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
counts, timestamps, and a bounded diagnostic code. Failure or total API outage
never changes lifecycle READY or blocks the runtime iframe. Warm-pool Sandboxes
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

### Stage 2 qualification procedure

The Stage 2 Minikube gate builds the Manager and Runtime images from the working
tree, publishes one current-user and one system archive through Agent Services,
and starts a claim from a neutral warm Sandbox. Inspect both the claim's
`agent.magda.io/skill-sync-*` annotations and `/data/agent-home/skills`: READY
must precede a successful two-item sync, while the replacement warm Sandbox must
have no `mgd` profile, sync state, or user skill directory. Invoke the pinned
filesystem provider in the adopted container to confirm both names are listed.
Then replace the user archive, delete the system publication, run
`mgd agent-skill sync --json`, and require one update and one removal followed by
DSH listing only the updated skill. A second user's manifest must not select the
first user's publication.

Scan-based checks: the fresh claim's sync must be the forced form and install
real directories with markers; an edited copy must survive a Manager restart
(non-forced recovery, `partial`); a manual ordinary sync must reinstall a
deleted directory and repair a corrupted marker; `--force` must reset an edit;
and sync must succeed with no `python3` on `PATH`. No installation index or
journal may appear under the Sandbox's `$XDG_DATA_HOME/mgd/agent-skills`. See the E2E test cases for
the full list.

For the failure gate, make Registry unavailable and run both normal sync and the
Manager's bounded `--workspace-status` form. Normal CLI sync must exit non-zero;
the Manager form must return a summary-only `failed` result without making its
exec fail. In both cases the claim stays READY, the DSH iframe remains available,
and the previously installed tree remains unchanged. Restore Registry and require
a subsequent sync to report the copy unchanged. The Storage API download path
must forward the existing object's `magda-record-id` and `magda-owner-id` as
S3-style metadata headers; Agent Services uses those trusted response headers to
validate archive linkage before publication or download.

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

## Managed DSH profile decisions

The deployment, not the user, owns provider, model, plugin, permission, and
reasoning configuration. The managed profile therefore:

- defaults to `workspace-write` with approval policy `ask`;
- exposes only the deployment-selected model and reasoning levels;
- hides provider/model/plugin configuration pages;
- removes the Model, Permission, and Feedback commands from the composer menu;
- disables persistent `danger-full-access` selection;
- keeps DSH's native sidebar, New Session, session history/switching, Search, and
  collapse/expand behavior;
- brands the sidebar **Agent Workspace** through DSH's `sidebar.brand.mark` and
  `sidebar.brand.name` slots and uses the same **M** mark in the empty-chat hero
  through `conversation.hero.brand.mark`;
- hides Automation tasks, Plugins, the Settings trigger, Workspace View Options,
  Add Workspace, Delete workspace, and the redundant new-session workspace
  chooser; and
- keeps every session rooted in the one managed `/data/workspace` filesystem.

The Settings and permission services remain mounted even though their buttons or
selectors are hidden. This preserves enforcement while removing the interactive
selector from the managed UI. DSH registers `/permission` from that same core service, so the
runtime includes a small client-only managed-profile plugin that filters the
command from composer candidates without weakening host-side enforcement.

For reasoning models with tools, the DSH route uses the OpenAI Responses API.
For example, GPT-5.6 Sol with `reasoningEffort: high` cannot use function tools
through Chat Completions, but it does support them through `/v1/responses`.
LLM Services proxies both Responses and Chat Completions for compatibility.

## Key implementation decisions

### Stateless manager, Kubernetes-owned state

The manager can restart without an application database. Claims, Sandbox status,
annotations, PVCs, and the Authorization DB are the durable sources of truth.
Per-user in-flight operations are serialized; destructive operations queue
behind provisioning rather than being silently dropped. Agent Manager is pinned
to one replica with a `Recreate` deployment strategy. Activity updates also use a
Kubernetes `resourceVersion` compare-and-swap, and Authorization applies API-key
expiry as `max(current, requested)`, so even a stale writer cannot shorten a
durable deadline. Every installation gets
a stable release/namespace-derived identifier. Claim names, labels, list
selectors, warm-pool resources, RBAC, and managed API-key names include that
identifier, so two Magda installations cannot adopt or delete one another's
workspaces even if an operator deliberately shares a Sandbox namespace.

### Meaningful inactivity lifecycle

The accepted lifecycle is 30 minutes of meaningful inactivity before suspension
and eight hours before permanent deletion. Both values are configurable. For the
alpha, **meaningful activity** begins when Agent Manager accepts an authenticated,
allowlisted DSH mutation RPC (for example prompt, session/terminal create, rename,
write, cancel, or delete), plus an explicit resume or an executing foreground
Agent turn. The lease is persisted before the mutation is sent to DSH; if lease
persistence fails, the proxy rejects the request without executing it. DSH uses
HTTP `POST` for both reads and writes, so method alone is deliberately
insufficient. DSH reports foreground execution through the
`api-session/status` Remote event. While that state is running, Agent Manager
renews activity at a bounded interval, including turns longer than the
30-minute suspension threshold. Per-socket ownership prevents one of several
browser sockets from clearing another, a short disconnect grace covers transport
reconnect, and the authoritative `session/list` running snapshot restores the
baseline after reconnect. Each request is tagged with its browser-connection
epoch and a monotonic sequence. A snapshot is accepted only while that exact
epoch is active and it is newer than the last successfully applied snapshot.
An older successful response is buffered while any newer request remains pending:
a newer success supersedes it, while failure, malformed data, oversize or abort
cancels the newer token and releases the newest buffered valid response. Zero/live
transport boundaries and
Remote status events invalidate older requests, while unrelated secondary-socket
churn does not discard a surviving baseline. Consequently,
out-of-order responses and responses arriving after disconnect/reconnect cannot
create or resurrect foreground activity. Existing snapshot ownership expires
after the last browser transport disconnects, so a missed settlement cannot
renew an abandoned workspace forever. Page loads, other list/catalog/status RPCs,
unauthenticated or non-allowlisted requests, oversized bodies rejected by the
proxy, lifecycle polling, merely opening a WebSocket, ordinary Remote-stream
traffic, and WebSocket heartbeat/ping-pong frames do not renew the deadline.

A meaningful request first advances the persisted claim activity timestamp and
`SandboxClaim.spec.lifecycle.shutdownTime`, then extends the managed Magda API
key to the same deadline. Per-user writes are serialized and take the maximum of
the requested and persisted timestamps, so old or concurrent requests cannot
shorten either deadline. Failed writes remain retryable; key extension has a
bounded immediate backoff before periodic reconciliation takes over. Reconciliation reads the
persisted timestamp after Manager restart and repairs a partial key extension.
It also completes persisted suspend/resume/delete transitions;
an interrupted allocation/bootstrap is destroyed after credential revocation.
If revocation is temporarily unavailable, the claim remains `DELETING` with key
identity intact and reconciliation retries before removing the PVC. It suspends a running
Sandbox after 30 minutes and permanently
deletes the claim (and its owner-controlled PVC) and credential after eight
hours. Reset and logout remain immediate destructive operations.

### Warm pools

Warm Sandboxes reduce first-use latency. The claim's reported Sandbox name is
always used rather than predicting a Pod name. A replacement unclaimed Sandbox
is created automatically after adoption.

### External Magda route from the Sandbox

`mgd` and LLM calls intentionally use the external Gateway rather than bypassing
it with service-to-service URLs. This exercises ordinary authentication,
authorization, routing, and audit boundaries. Local self-signed deployments must
map the external hostname to the ingress Service IP and mount its CA certificate.

### Memory-only token handoff

The DSH launch token is written to a memory-backed `emptyDir`, read by Agent
Manager with `pods/exec`, and exchanged server-side. It is not stored on the PVC
or exposed through Pod logs.

### Same-origin runtime proxy

Serving DSH below the Magda origin avoids third-party-cookie and iframe-origin
problems. The proxy supports WebSockets, pins the upstream Host, caps request
bodies, authenticates before buffering, deduplicates cookie exchange, and closes
open sockets during destructive lifecycle operations.

## Helm configuration

LLM Services is independently deployable. Agent Workspace requires it:

```yaml
global:
  agentWorkspace:
    enabled: true
    # Empty derives <release-namespace>-agents with collision-safe truncation.
    sandboxNamespace: ""
  llmServices:
    enabled: true
  defaultAgentModel:
    # Stable MAGDA/DSH-facing alias; provider upgrades do not change it.
    alias: magda-agent-default
    providerModel: openai/gpt-5.6-sol
    # Set to "" to omit the setting and use the provider default.
    reasoningEffort: medium
    contextWindow: 1050000
    maxTokens: 128000

agent-services:
  warmPool:
    type: gvisor # runc, gvisor, or kata
    size: 2
  runtimeClasses:
    gvisor: gvisor
    kata: kata
  hardDeleteSeconds: 28800
  idleSuspendSeconds: 1800
  # Optional overrides inherit global.defaultAgentModel when omitted.
  llm:
    model: ""
    contextWindow: null
    maxTokens: null
  runtime:
    storage:
      size: 5Gi

llm-services:
  # An empty list inherits global.defaultAgentModel.alias.
  allowedModels: []
  litellm:
    enabled: true
    # Optional overrides; empty values inherit global.defaultAgentModel.
    model:
      alias: ""
      providerModel: ""
```

The merged `agent-services` chart owns the Manager Deployment, Service, RBAC,
control Secret, Sandbox namespace, and exactly one selected SandboxTemplate and
SandboxWarmPool. `runc` omits `runtimeClassName` and is intended only for trusted
local development. gVisor and Kata default to RuntimeClasses named `gvisor` and
`kata`, which may be overridden.

Changing `warmPool.type` while claims exist is a migration, not an in-place
runtime switch. Drain or reset active workspaces, confirm their claims and warm
Sandboxes are gone, then upgrade the release and admit new workspaces.

### Mandatory migration from the split charts

Upgrading from the earlier `agent-manager` + `agent-runtime` charts to
`agent-services` is also a **drain/reset migration**. Legacy claim names and
managed-key names were user-scoped but not installation-scoped. The new Manager
intentionally does not adopt those resources, and Helm replaces the old
unhashed Template/WarmPool. Before upgrading:

1. Ask every user to publish durable results, then reset or log out through the
   old Manager. Do not manually delete a claim first: reset/logout revokes the
   legacy `magda-agent-workspace` managed key before deleting its claim and PVC.
2. Confirm no claimed legacy workspaces remain. Unclaimed old warm Sandboxes may
   remain until Helm removes the old pool during the upgrade:

   ```sh
   kubectl -n <sandbox-namespace> get sandboxclaims,sandboxes,pvc
   kubectl get sandboxclaims -A \
     -l '!agent.magda.io/installation-id'
   ```

3. If the old Manager cannot perform cleanup, use an administrator-issued system
   JWT with the trusted Authorization API private route to revoke each user's
   key named `magda-agent-workspace`, and only then remove that user's legacy
   claim/PVC. Never carry a raw legacy credential into the new runtime.
4. Upgrade Helm. Verify that exactly one installation-hashed Template/Pool is
   present, every new claim has `agent.magda.io/installation-id`, and no legacy
   managed keys, unscoped claims, claimed Sandboxes, or user PVCs remain. Users
   can then start clean installation-scoped workspaces.

With bundled LiteLLM enabled, its service URL and retained master-key Secret are
derived automatically. To use an external backend, set
`llm-services.litellm.enabled=false` and provide all of
`llm-services.backend.url`, `masterKeySecret.name`, and `masterKeySecret.key`.
Provider credentials remain confined to LiteLLM. The bundled chart reads an
optional provider credential from `providerSecret.name`/`providerSecret.key`
through the fixed internal environment name `LITELLM_PROVIDER_API_KEY`; leave
both Secret fields empty for a workload-identity or credential-free provider.
The bundled LiteLLM configuration exposes exactly one model, so its effective
allowlist must contain exactly one matching alias. An external
LiteLLM-compatible backend may expose multiple aliases:

```yaml
llm-services:
  allowedModels:
    - magda-agent-default
    - another-model
  litellm:
    enabled: false
  backend:
    url: https://llm.example/v1
    masterKeySecret:
      name: external-litellm-key
      key: master-key
```

MAGDA cannot inspect an external backend's model catalog. The operator is
responsible for ensuring every allowlisted alias exists there, and the Agent
Workspace model is included in the list. This deployment-wide allowlist remains
an independent restriction even when per-user OPA model authorization is added.

The stable public alias is `magda-agent-default`; changing only
`global.defaultAgentModel.providerModel` changes the bundled backend route
without changing DSH or LLM Services clients. The default explicitly selects
`medium` reasoning, with a 1,050,000-token context window and 128,000-token
maximum output. Set `global.defaultAgentModel.reasoningEffort: ""` to omit the
reasoning setting from both DSH and LiteLLM and let the provider choose its model
default. This is distinct from the explicit `off` effort. When selecting another
model, update `providerModel`, `reasoningEffort`, `contextWindow`, and `maxTokens`
to its capabilities. See the
[GPT-5.6 Sol model specification](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

Model settings are written into a workspace during provisioning. Existing
PVC-backed workspaces are intentionally not rebootstraped during a Helm upgrade;
reset development or pre-release workspaces after changing these settings so a
stale alias or reasoning effort is not retained.

## Deployment

### Prerequisites

1. A Kubernetes cluster with an ingress controller and a working Magda release.
2. Kubernetes Agent Sandbox v1.0.4 installed cluster-wide:

   ```sh
   kubectl apply --server-side -f \
     https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v1.0.4/sandbox-with-extensions.yaml
   kubectl -n agent-sandbox-system rollout status deploy --timeout=300s
   ```

   KAS remains a cluster prerequisite, not a Magda Helm dependency. An
   `agent-services` pre-install/pre-upgrade hook checks the expected v1beta1 APIs
   and the selected gVisor/Kata RuntimeClass. The hook runs only during a real
   installation, so offline `helm lint` and `helm template` continue to work.

3. A Magda authentication plugin or another way to establish a user session,
   and a role assignment granting `agentWorkspace/access` to Workspace users
   (administrators already have it). `magda-auth-internal` is not a dependency of `magda-core`.
4. Images for Agent Manager, Agent Runtime, LLM Services, Authorization API,
   Gateway, Web Server, and Authorization DB Migrator published to a registry
   accessible by the cluster.
5. A provider API key stored outside Helm values:

   ```sh
   kubectl -n <magda-namespace> create secret generic litellm-provider \
     --from-literal=api-key="$OPENAI_API_KEY" \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

### Build local images

From the repository root, the following commands build the new services. Use
organisation-specific image names/tags for a shared registry:

```sh
(
  cd magda-agent-manager
  ../node_modules/.bin/create-docker-context-for-node-component \
    --build --tag localhost:5000/magda-agent-manager:latest --local
)
(
  cd magda-llm-services
  ../node_modules/.bin/create-docker-context-for-node-component \
    --build --tag localhost:5000/magda-llm-services:latest --local
)
yarn workspace @magda/agent-runtime docker-build-local --version latest
```

Build the changed existing components using the repository's standard component
builder, including `magda-authorization-api`, `magda-gateway`,
`magda-web-server`, and `magda-migrator-authorization-db`.

### Minikube-specific setup

The supplied `deploy/helm/magda-core/agent-workspace-minikube-values.yaml`
expects local images loaded into Minikube. For each local image:

```sh
minikube -p <profile> image load localhost:5000/<image>:latest
```

Create the Sandbox namespace and trust the local ingress certificate:

```sh
kubectl create namespace magda-agent --dry-run=client -o yaml | kubectl apply -f -
INGRESS_IP=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.spec.clusterIP}')
kubectl -n ingress-nginx get secret magda-test-tls \
  -o jsonpath='{.data.tls\.crt}' | base64 --decode >/tmp/magda-agent-ca.crt
kubectl -n magda-agent create secret generic magda-agent-trusted-ca \
  --from-file=ca.crt=/tmp/magda-agent-ca.crt \
  --dry-run=client -o yaml | kubectl apply -f -
```

Generate the cluster-specific ingress override. Do not commit the ephemeral
Service IP:

```sh
cat >/tmp/agent-workspace-ingress-values.yaml <<EOF
agent-services:
  runtime:
    hostAliases:
      - ip: ${INGRESS_IP}
        hostnames: [magda.test]
    externalPrivateCidrs: [${INGRESS_IP}/32]
    externalPrivatePorts: [443]
EOF
```

Refresh chart dependencies and deploy:

```sh
helm dependency update deploy/helm/magda-core
helm upgrade --install magda deploy/helm/magda-core \
  --namespace magda --create-namespace \
  -f deploy/helm/magda-core/agent-workspace-minikube-values.yaml \
  -f /tmp/agent-workspace-ingress-values.yaml \
  --set global.agentWorkspace.enabled=true \
  --timeout 15m --wait
```

Because `magda-core` deliberately does not own authentication plugins, install
the internal password plugin as a separate release for local sign-in. The
Minikube values above already register its service URL with Gateway:

```sh
helm upgrade --install magda-auth-internal \
  deploy/helm/local-deployment/charts/magda-auth-internal-4.0.0.tgz \
  --namespace magda \
  --set global.magdaCompatibilityCheck=false \
  --set global.externalUrl=https://magda.test:18443 \
  --timeout 5m --wait
curl --fail --silent --show-error --insecure \
  https://magda.test:18443/auth/plugins
```

The final command must return an entry whose key is `internal`; an empty array
means Gateway has not registered the plugin and the password form will not be
shown.

If deploying through the top-level `deploy/helm/magda` umbrella, run
`helm dependency update deploy/helm/magda` first so its generated local
`magda-core` dependency is current.

For a Docker-driver Minikube profile, expose ingress ports when creating the
profile or use a persistent port-forward. Map `magda.test` to `127.0.0.1` on the
browser host when using a local port mapping:

```text
127.0.0.1 magda.test
```

### Production deployment

Use the same values through the normal Magda umbrella or deployment repository,
with these differences:

- publish versioned images and configure the standard global image registry and
  pull secrets;
- use a real external hostname and trusted TLS certificate;
- omit local `hostAliases` when cluster DNS resolves the external name, while
  retaining the required NetworkPolicy destination;
- provision `litellm-provider` through the platform secret manager;
- select a qualified gVisor or Kata RuntimeClass and size the one selected warm
  pool and its PVCs (`runc` is trusted local-development only);
- set permanent-delete and idle-suspension inactivity values for the
  organisation's policy;
- include the Authorization DB migration before starting the updated
  Authorization API; and
- retain `global.agentWorkspace.enabled=false` until all dependencies, secrets,
  and security qualification checks are ready.

### GKE alpha reference profile

The GKE work in [PR #3852](https://github.com/magda-io/magda/pull/3852)
provides real interoperability evidence for GKE Standard, a dedicated GKE
Sandbox/gVisor node pool, KAS v1.0.4, a regional L4 passthrough NLB terminating
TLS at community ingress-nginx, HTTPS/WSS, and PD CSI provision/remount/reclaim.
It also found the CSI ownership issue addressed by
`fsGroupChangePolicy: OnRootMismatch`.

It did **not** qualify the integrated Magda Gateway/auth/logout path, real
LiteLLM/provider access, effective GKE NetworkPolicy enforcement, Workload
Identity isolation, warm pools greater than zero, multiple users, HA,
multi-zone operation, node upgrades, cert-manager, or native GCE L7/Gateway API.
The supplied `agent-workspace-gke-values.yaml` is therefore an **alpha reference
profile**, not a qualified production profile. Do not claim GKE production or
security qualification until the functional gates below pass.

#### Cluster and gVisor prerequisites

Use GKE Standard with NetworkPolicy enforcement provided by **GKE Dataplane V2**
(preferably selected at cluster creation with `--enable-dataplane-v2`) or a
separately qualified Calico configuration. Create a dedicated, non-default
COS_CONTAINERD node pool with `--sandbox type=gvisor`; production Sandbox nodes
must not be Spot/preemptible. Keep ordinary system workloads on a non-Sandbox
pool. Verify the GKE-managed `gvisor` RuntimeClass and its
`sandbox.gke.io/runtime=gvisor` scheduling requirements:

```sh
gcloud container clusters describe "$CLUSTER" --location "$LOCATION" \
  --format='yaml(datapathProvider,networkPolicy,workloadIdentityConfig)'
gcloud container node-pools list --cluster "$CLUSTER" --location "$LOCATION"
kubectl get runtimeclass gvisor -o yaml
kubectl get apiservice | grep agents.x-k8s.io
```

KAS v1.0.4 remains an external prerequisite. `pods/exec` must work because Agent
Manager uses it for the one-time launch-token/bootstrap hand-off. GKE gVisor does
not support `kubectl port-forward`, but this architecture does not depend on it.
Published runtime images must include amd64 and be pullable from Artifact
Registry by the nodes or configured image pull secrets.

#### NetworkPolicy is a hard functional prerequisite

Creating or listing NetworkPolicy objects does **not** demonstrate enforcement.
The #3852 cluster accepted KAS-managed policies while an unauthorized Pod could
reach DSH and the Sandbox could reach private services and the control-plane
endpoint. The Helm KAS preflight intentionally checks APIs and RuntimeClass only;
it cannot prove dataplane behavior.

Before enabling Agent Workspace for untrusted workloads, run a disposable traffic
matrix and retain the evidence:

1. confirm Agent Manager can reach the claimed Sandbox Service on TCP 3080;
2. confirm ordinary probe Pods in both the Magda and Sandbox namespaces, without
   the allowed labels, time out when connecting to Sandbox TCP 3080;
3. from the Sandbox, confirm kube-dns, the configured external Magda HTTPS
   endpoint, and an approved public HTTPS endpoint work;
4. from the Sandbox, confirm direct Agent Manager, Registry, Authorization,
   PostgreSQL and other Sandbox ClusterIPs, every private or public
   Kubernetes/control-plane endpoint, and `169.254.169.254` time out; public
   control-plane addresses must be added as exact `/32` entries in
   `agent-services.runtime.deniedCidrs`;
5. repeat after suspend/resume and Sandbox Pod replacement.

Any forbidden successful connection fails qualification. If enforcement cannot be
verified, leave Agent Workspace disabled. The authoritative intended matrix is in
`agent-services/templates/runtime.yaml`; the executable procedure is in the
Agent Workspace end-to-end test document.

#### Sandbox Kubernetes and Google Cloud identity

Every Sandbox Pod uses a dedicated installation-scoped Kubernetes ServiceAccount
in the Sandbox namespace. It has no RoleBinding or ClusterRoleBinding, no Google
IAM binding, and `automountServiceAccountToken: false`. Agent Manager has a
separate KSA and Kubernetes RBAC; never reuse that identity for a Sandbox.

On GKE, `automountServiceAccountToken: false` prevents a projected Kubernetes
credential but does **not** make the GKE metadata server inaccessible. PR #3852
received HTTP 200 from the Workload Identity token endpoint; obtaining a token
alone does not prove that the identity has useful IAM permissions. Operators must:

- inspect the Pod `serviceAccountName` and KSA annotations and confirm Kubernetes
  API authorization is denied;
- audit direct IAM bindings for the Sandbox KSA and broader Workload Identity
  Federation grants to namespace or pool-wide `principalSet` principals;
- grant neither `roles/iam.workloadIdentityUser` nor Google resource roles to the
  Sandbox identity by default; and
- identify the metadata identity, audit its effective permissions, and verify
  access to unrelated Google Cloud resources is denied.

Metadata-server blocking through NetworkPolicy remains unverified until tested on
an enforcing GKE dataplane. If the identity has unintended permissions or the
required isolation cannot be established, do not enable Agent Workspace.

#### ingress-nginx, IngressClass and external NLB

Install the controller separately with a unique class and verify ownership:

```yaml
controller:
  ingressClass: magda-agent-nginx
  ingressClassResource:
    name: magda-agent-nginx
    controllerValue: k8s.io/ingress-nginx
  service:
    type: LoadBalancer
    externalTrafficPolicy: Local
    annotations:
      cloud.google.com/l4-rbs: "enabled"
    loadBalancerSourceRanges: ["<approved-cidr>"]
```

```sh
kubectl get ingressclass magda-agent-nginx \
  -o jsonpath='{.spec.controller}{"\n"}'
```

The result must be `k8s.io/ingress-nginx`. Do not assume a class named `nginx` is
community ingress-nginx: the #3852 cluster's class with that name belonged to the
F5 controller (`nginx.org/ingress-controller`), which does not consume community
annotations. Set `cloud.google.com/l4-rbs: enabled` when creating the controller
Service; adding it later does not migrate a legacy target-pool load balancer.

Verify in GCP that the external forwarding rule is regional EXTERNAL TCP on ports
80/443, targets a regional TCP backend service using GCE_VM_IP NEGs, and has no
URL map or target HTTP(S) proxy. TLS terminates in ingress-nginx. Native GCE L7
Ingress/BackendConfig and Gateway API remain outside this alpha profile.

Set `ingress.proxyReadTimeout` and `proxySendTimeout` to 3600. The NLB has no HTTP
timeout, but nginx defaults close quiet sockets after about 60 seconds. Test a
quiet socket beyond 60 seconds and the selected operational window, streaming,
and browser reconnect after Gateway/Manager restart. A controller config reload
can close existing sockets at `worker-shutdown-timeout` (240 seconds by default)
without a WebSocket close frame; DSH must reconnect. Shared-controller changes
can therefore interrupt sessions.

> **Controller lifecycle warning:** community ingress-nginx v1.15.1/chart 4.15.1
> was its final release in March 2026 and receives no future fixes. Its GKE PoC
> evidence remains useful only as a frozen alpha path. New production adoption
> requires explicit risk acceptance and a time-bound migration plan. Any
> successor controller requires fresh WSS, timeout, reload, and NetworkPolicy
> qualification; F5 NGINX is not a drop-in replacement.

#### Persistent storage

The tested GKE profile explicitly selects `standard-rwo`: PD CSI
(`pd.csi.storage.gke.io`), ReadWriteOnce, `WaitForFirstConsumer`, and reclaim
policy `Delete`. Zonal PD pins the Sandbox to one zone; regional/multi-zone
storage, capacity, performance, and backup policy remain operator decisions and
are not qualified. Workspaces remain temporary.

Verify a marker file, DSH session, and credential mode before and after
suspend/resume and Pod deletion. The same PVC must survive and the credential
must remain mode 0600. Deleting the claim must remove Sandbox, Pod, Service, PVC,
PV, and GCE disk. A StorageClass with reclaim policy `Retain` requires explicit
operator cleanup and does not satisfy the automatic deletion claim.

### Basic smoke verification

After deployment:

```sh
kubectl -n magda rollout status deploy/agent-manager
kubectl -n magda rollout status deploy/llm-services
kubectl -n magda rollout status deploy/litellm
kubectl -n magda-agent get sandboxclaims,sandboxes,pods
```

Log in as an administrator or a user with **Agent Workspace Users**, open
**Settings → Agent Workspace**, start the
workspace, and wait for `READY`. Verify the managed DSH UI, a real model/tool
response through `/api/v0/llm/v1/responses`, `mgd auth status`, a Registry read,
and destructive cleanup of the claim and managed key.

This smoke test is not a GKE security qualification. The full lifecycle test and
mandatory GKE qualification gate—including gVisor, positive/negative networking,
KSA/IAM/metadata, NLB shape, WSS reload/reconnect, CSI lifecycle/reclaim and
cleanup evidence—is in `docs/docs/e2e-test-cases/agent-workspace.md`.

## Operational notes

- Agent Runtime is a versioned workspace package. The normal Docker CI publishes
  both amd64 and arm64 manifests and the release retag/push path copies
  `magda-agent-runtime` alongside other Magda images. DSH remains pinned to the
  qualified runtime version in the Dockerfile.
- A same-tag local runtime image does not replace existing warm Sandboxes. Delete
  only the unclaimed warm Sandbox and wait for its replacement before resetting a
  test workspace onto a rebuilt image.
- LiteLLM configuration changes require a Pod restart unless the deployment
  template checksum changes.
- A `runAsNonRoot` image must declare a numeric UID. Agent Manager and LLM
  Services use UID 1000; Agent Runtime uses UID/GID 10001. Its Pod security
  context sets `fsGroupChangePolicy: OnRootMismatch`; this is required on GKE PD
  CSI and similar volumes so remounts do not broaden DSH's mode-0600 credential
  file and break resume or Pod replacement.
- Local GPT-5.6 Sol use required a 1 GiB LiteLLM memory limit during qualification.
- Reset and logout are destructive by design. Publish important outputs to Magda
  or another durable store first.
