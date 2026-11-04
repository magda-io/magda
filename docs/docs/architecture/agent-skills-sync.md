# Agent Skill synchronization and local provenance

**Status:** Implemented for Workspace and local `mgd` use in merged #3850/#3864. This page describes the reconciliation contract. See [Agent Skills architecture](./agent-skills.md) for publication APIs, [authorization](./agent-skills-authorization.md) for access control and [ADR 0006](../adrs/0006-scan-based-agent-skill-synchronization.md) for the architectural rationale.

## Sources and desired sets

| Execution target | Eligible sources | Destination |
| --- | --- | --- |
| MAGDA-managed Sandbox | READY system skills, own READY user skills, and **explicitly installed**, currently readable shared skills | Single per-user DSH skill root |
| Local computer | Own READY user skills plus explicitly installed, currently readable shared user skills; *not* auto-installed system skills | Detected Claude Code/Codex/OpenCode roots and configured DSH root |

Each manifest is resolved and paginated for the current caller; an inaccessible shared source is not considered valid simply because an installation record exists. Both local and managed Workspace flows verify the instance/tenant/user identity before reusing cached archives.

## Durable per-installation provenance

The synchronizer makes an **independent actual directory copy** of each managed skill in each selected agent harness. A root-level `.magda-skill-install.json` describes the source account/publication, installed baseline digest and local installation identity. That marker must **not** be included in published ZIPs or authoring drafts.

There is **no** central installed-skill index, all-harness transaction journal or multi-harness rollback. The rest of the durable state is the account-isolated `mgd` verified source/archive cache and explicit `pull` provenance. Account-cache keys include canonical MAGDA URL, tenant and user to prevent cross-account contamination.

The reconciler scans the immediate children of each harness root and compares actual contents against the marker's baseline and the authenticated desired source snapshot. It never overwrites an unmarked unrelated skill directory just because the name matches.

## Reconciliation sequence and failures

1. Authenticate and resolve all required remote publication metadata/ZIPs. Verify signatures/checksums and source permissions before changing local installations.
2. If a required current source or infrastructure service cannot be verified, stop the **remote preparation** phase and preserve existing managed copies; do not treat an outage as an empty desired set.
3. Independently reconcile each selected harness. Clean copies may be added, replaced, removed or repaired; an edited copy produces `LOCAL_MODIFICATION` (or a related conflict) and is left untouched unless the user explicitly chooses force.
4. A partial per-skill failure does not roll back unrelated successful reconciliations. A crash or lost staging directory is recovered on a later scan. Local profile selection is committed before reconciliation, rather than rolled back as an across-harness transaction.
5. Workspace bootstrap and **READY** are independent of optional skill sync. The Manager reports `success`, `partial`, `failed` or `notAttempted` and allows user-confirmed **Retry / Re-check**. A manual CLI sync does not rewrite the Manager's last-run status annotation.

`mgd agent-skill sync` is ordinary, conflict-aware reconciliation. `--force` discards divergent managed edits, so UI-initiated force requires a warning/confirmation. Publishing an installed shared skill must first refuse; an explicit `publish --force` can fork after validating recipient authority. The source publication remains unchanged.

## Operations and tests

Use [deployment and operations](../agent-workspace-deployment.md) for paths/storage and [Agent Workspace E2E](../e2e-test-cases/agent-workspace.md) plus [sharing tests](../e2e-test-cases/agent-skills-sharing.md) for recovery, revocation, collision and outage tests.

Revoked source permissions prevent future authorised acquisition. **Already-synced offline copies are not continuously policed**; they are removed only through subsequent successful reconciliation under the documented conflict policy. The product must not promise instantaneous revocation of copies outside MAGDA.

## Agent Skill workspace manifest and synchronization

`GET /api/v0/agent/skills/workspace-manifest` is an ordinary authenticated-user
route. It independently traverses all pages of visible READY system publications
and READY user publications whose immutable `agent-skill.userId` is the current
user UUID. Every Registry request and typed read decision uses the caller session;
the lifecycle-only internal administrator identity is never used. A third,
independently paginated source adds the caller's explicitly installed shared
skills (see [sharing authorization](./agent-skills-authorization.md#manifests-revocation-and-outages)). A publication that
belongs to another user is never selected merely because it is readable.

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
tenant/user identity, adds explicitly installed shared skills, and excludes
system and merely readable foreign publications. Verified
publication snapshots, immutable archives and explicit `pull`/`publish` working
directory refs live under
`${XDG_DATA_HOME:-~/.local/share}/mgd/agent-skills/sources/<hash>/`, where the
hash covers canonical API URL, tenant and user UUID. This prevents identical
record IDs or names on different instances/accounts from sharing state. The
Workspace manifest returns the same server-derived tenant/user identity so the
Sandbox cache is keyed identically.

Installations follow the accepted scan-based design
([maintained sync contract](./agent-skills-sync.md),
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
[Retry / Re-check](./agent-skills.md#workspace-skill-sync-status-and-retry--re-check). Warm-pool Sandboxes
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
