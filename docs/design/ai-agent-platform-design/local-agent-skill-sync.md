# Agent Skills synchronization — copy-only installations and explicit conflict resolution

**Status:** Accepted design, 2026-10-17. **This document supersedes the 2026-10-16 symlink/working-copy/automatic-draft design** and is authoritative for Stage [#3855](https://github.com/magda-io/magda/issues/3855) in draft [#3850](https://github.com/magda-io/magda/pull/3850), and the compatible future [#3861](https://github.com/magda-io/magda/issues/3861) installation model. Workspace Manager UI retry belongs to [#3857](https://github.com/magda-io/magda/issues/3857). General sharing/OPA contract remains [skills-authorization-and-workspace-manifest.md](./skills-authorization-and-workspace-manifest.md).

## 1. Principles and threat model

1. **MAGDA is the durable authoritative publication store**; local coding-agent skills are **independent installed real-directory copies**, not linked live working copies. Local changes are unpublished until a user explicitly publishes them. A subsequent explicit sync propagates published changes to other harnesses.
2. **No automatic draft preservation, no merge engine, and no backup-draft management commands.** An **existing, locally modified directory** is a conflict until explicitly published (where appropriate) or discarded with `--force`. A **missing skill directory is absence, not modification**: ordinary `sync` is affirmative consent to recreate eligible remote skills. Existing `agent-skill init` and `pull` still create intentional user-controlled unpublished working directories; they are **not** automatically preserved drafts.
3. `sync --force` means **explicit consent without another prompt** to discard local changes in matching skill targets, and install or remove each target according to the verified desired remote state. This consent is **local filesystem consent only**, not permission to override server authorization, remotely overwrite another publication, or follow filesystem links outside approved roots.
4. Normal sync and profile switching must **preflight conflicts across all selected skill directories** before mutating installations. **Missing directories are safe to reinstall/forget**, and a regular directory whose complete content exactly matches its desired verified skill can have missing/invalid local installation metadata **repaired/adopted without `--force`**. Conflicts are real content modifications, unmatched recognized-name directories, unsafe paths, or name collisions. Reuse one reconciliation/planning/reporting engine online or offline; no destructive partial updates when another target has a conflict.
5. Preserve strict ZIP validation, authenticated source identity, typed OPA, checked publication checksum/If-Match, source-account separation, no traversal, conservative handling of symlink/unsafe roots, a process-wide/multi-process `mgd` projection lock, and recoverable filesystem transactions. Simplify *same-user adversarial TOCTOU* guarantees proportionately: use built-in **Node.js** fs operations; do **not** add Python, native compiled addons, OS-specific ctypes/syscalls or extra runtimes. Fail closed on ambiguous destructive operations. The MVP targets supported Node.js platforms through portable Node fs APIs; test supported macOS/Linux at minimum.
6. **No cross-account/profile activation:** only globally active MAGDA profile's eligible source set can be installed in harness directories. Never treat profile name alone as account identity. No background/implicit network sync on switching profiles.

## 2. Local vs Workspace source selection

| Context | Eligible publications | Targets |
| --- | --- | --- |
| User's local computer | Own READY `type=user` publications; after #3861 **explicitly installed**, still-authorized shared user publications | Supported, detected Codex/Claude Code/OpenCode/DSH **flat skill directories**, independent copies |
| MAGDA-hosted Sandbox | Visible READY system publications + own READY user publications + future explicitly installed authorized shared user publications | **Current user's** Sandbox DSH skill root, independent copies, alongside image-bundled untouched skills |
| Explicit `agent-skill pull` | Exactly specified readable source, including authorized system source | A user-chosen working directory; not installed or auto-activated |

Readable-but-uninstalled shared publications never become eligible automatically. Local `--type all` means all **locally eligible** sources, not system publications; system remains Workspace-only for automatic sync. Keep the trusted Workspace-image marker/mode selection; a caller-supplied `--workspace-status` flag must not be able to broaden local eligibility.

Use existing MAGDA API/tenant/user validation. The persistent source identity is a hash of **canonical instance base URL + tenant ID + authenticated user UUID**, independent of named profile alias or publication `type/id`. Preserve separately verified archives/manifests for offline switching, with source identity, source IDs, base checksum/content digest, effective name/alias (later #3861) and download verification. An unavailable/corrupt remote manifest never means successful empty manifest and must not destroy the verified offline cache.

## 3. Copy-only storage and installation metadata

Illustrative:

```text
~/.local/share/mgd/agent-skills/
  sources/<source-key>/
    archives/<published-record-id>.zip   # validated, immutable published snapshot
    state.json                            # published source identity/metadata/checksums
  installation-index.json                 # globally active profile, owned paths, baselines
  operation-journal.json                  # only incomplete transactions, not user drafts

~/.claude/skills/analyse-csv/
  SKILL.md
  examples.md
  .magda-skill-install.json

~/.agents/skills/analyse-csv/
  SKILL.md
  examples.md
  .magda-skill-install.json

~/.config/opencode/skills/analyse-csv/
  SKILL.md
  examples.md
  .magda-skill-install.json
```

Use **`.magda-skill-install.json`** as reserved on-disk installation metadata, shorter and purpose-specific. Contents: format version, verified account/source key, publication source ID/type, installation ID/alias if applicable, baseline **published archive checksum**, baseline **skill-content tree digest**, and a random installation ID/token to pair with the local index. No API key, credential or secret. The index remembers installed roots/paths even if a directory/marker disappears; source state remembers verified publication details.

**Content validation:** publication ZIP and raw new-skill validation must **reject** unexpected non-Markdown files for user skills, including marker injection. Only a recognized **local installed directory** (and a separately supported explicit publish-from-installed-directory flow) may **exclude exactly this internal metadata file** when computing skill-content digest or producing a published archive; do not change remote checksum semantics, allow arbitrary dotfiles, or permit the marker inside a server ZIP. Explicitly test DSH and each harness still discover skills containing the metadata.

All installed skills—including system skills in Workspace—remain verified **real directories**; do not symlink entire roots, skill directories or `SKILL.md`. Retain existing `mgd skills install|uninstall` bundled `magda-mgd` behavior and never claim/replace image-bundled/runtime reserved names. Reuse harness-native root resolution and deduplicate overlapping roots. Respect `MGD_AGENT_SKILL_DIR` single-target override; do not create unrelated local harness targets inside Workspace. Additional `.md` reference files travel with `SKILL.md`; user-skills remain Markdown-only.

### Recognition and conflicts

Derive matching candidates from (a) the latest **complete authorized** desired manifest and (b) the installation index of previously managed names/paths. **Unrelated names** are ignored entirely.

- **Path absent, not previously installed:** safe new installation if name is eligible.
- **Previously installed path absent (manual deletion):** treat as **absent**, **not** a modification. For an eligible desired skill, ordinary `sync` (or offline profile switch to a verified cache containing the skill) reinstalls it; if no longer eligible, safely clear its tracked installation record. No `--force` and no confirmation needed. Sync expresses intent to make locally installed skills match the verified desired set. Do not confuse a missing directory with a present but edited one.
- **Metadata present, matching prior tracked source/token and baseline:** calculate **actual content digest excluding metadata**. Match = clean. Mismatch, invalid Markdown, added files = modified.
- **Metadata missing/invalid (including malformed JSON, stale checksum, wrong/old installation source or absent marker), but the regular directory name matches a desired or previously tracked skill:** **first compare its full actual skill-content tree (all files, names, modes, bytes; exclude only the reserved metadata path) against the exact verified desired publication/alias**, not just `SKILL.md` and not a permissive partial check. If **identical**, ordinary sync **adopts/repairs** its `.magda-skill-install.json` and index to the current verified source/baseline without replacing the user's skill content, and reports `metadataRepaired`/`adopted`. If **different**, report an unrecognized/modified conflict and full path; `--force` may reset/remove that safe matching regular directory according to desired state. A previously installed clean but older publication is handled from a known valid previous baseline via the normal update path; don't incorrectly compare it against new remote bytes and call it locally modified. If the desired source has been deleted and there's no verified desired content to compare, don't silently adopt an unrecognized remaining directory.
- **Directory name unrelated to desired or tracked skills:** ignore it; never enumerate arbitrary skill dirs for deletion.
- **Symlink, mount/unsafe root, unexpected special file, outside-root path, reserved bundled skill:** don't traverse or overwrite it even under `--force`; report an actionable unsafe-path error. `--force` authorizes discarding **regular matching directories**, not arbitrary filesystem traversal.
- A **remote update alone is not local modification**. Compare local content with its *previous installed baseline*, not directly against newly published content. An unchanged old version is clean and can be updated by normal sync.

If a matching-name directory has no valid marker, it might be independently authored. **Exact content equality to the authorized desired skill justifies metadata-only adoption on ordinary `sync`**; any non-equal content requires `--force` to discard. If no desired skill exists, retain or retire only an authenticated/tracked, clean old installation, and flag an unrecognized same-name directory as a conflict. `--force` is intentional consent to discard safe regular matching-named content, with full path shown on non-force conflict and in forced result. Marker presence alone is **not** an authorization/security boundary; the manifest, verified bytes and index provide provenance. Never follow metadata-file or directory symlinks for repair, even with force. Avoid hostile same-user TOCTOU overengineering and separate `reserved` sidecars.

## 4. Reconciliation algorithm — one reusable engine

Input: verified desired source snapshot (online MAGDA manifest or selected profile's previously verified offline cache), selected target roots, current installation index, `force` flag. Distinguish **preflight**, **prepared**, **committing**, **complete** phases.

1. **Resolve manifest/source identity**, target roots and planned actions; collect all candidate matching names in all harnesses. For online sync require a trustworthy, complete authorized manifest, validated download/source ZIP checksums and identity; outages never imply delete-all.
2. **Preflight every candidate** against its previous valid installed baseline, desired verified content and index, recording clean/modified/absent/metadata-repair/unrecognized/unsafe paths. An absent candidate is **not** a conflict. A markerless/invalid-metadata candidate with **exact matching desired tree** is a safe **metadata-only repair**, not a conflict. Present actual conflicts grouped by harness/path/action. Without `--force`, fail before changing any installed skill or active profile if conflicts exist; with `--force`, still refuse unsafe symlinks or escaped roots.
3. **Prepare new content** from verified remote archives or offline cache into private staging with Node fs; validate before moving/removing old installation. No user data is modified during download/validation. Failures preserve current installed copies.
4. **Commit under the existing cross-process `mgd` lock** with a small recoverable journal: verify preconditions again where practical, move only known matching real directories to **temporary same-filesystem rollback locations** (not durable drafts), create replacements via Node `fs.mkdir`/`fs.cp`/`fs.writeFile`, write `SKILL.md` last to reduce partial discovery, validate content, and update marker/index/config only on successful operations. Detect existing/new path and refuse accidental clobber. A brief unavailable skill during replacement is acceptable; exact cross-directory atomicity is not promised.
5. On failure, **restore last installed contents when possible** and leave an actionable recovery journal; on restart, complete or roll back deterministically. Delete temporary rollback material after successful commit; never retain user-edited copies as automatic drafts. No independent Python process or OS-specific rename primitive. Keep the user's changed original untouched on a failed *preparation*, even when `--force`.
6. For **remote deletion/revocation**, retire all selected harness installations **before** dropping their references from source/index state. Journal or tombstone removal intent until no stale managed executable projection remains. With modified copies and no `--force`, retain files, report conflict, and do **not** claim complete reconciliation. With `--force`, remove eligible matching regular directories; maintain separate stricter Workspace authorization.

A complete remote manifest can still have warnings for individual sources. Do not delete entries whose authorization/source status was *not reliably resolved*. Preserve best-effort per-skill errors where required by Workspace, and avoid confusing network failure with clean absence.

### Operations and expected results

| Situation | `sync` / profile switch (no force) | `sync --force` / `profile use --force` |
| --- | --- | --- |
| Local clean, remote unchanged | unchanged | unchanged |
| Local clean, remote updated | install newer verified version | same |
| Local changed (any harness, content differs from installed baseline/verified desired) | conflict, no installed changes | replace with desired verified version |
| Previously installed directory manually deleted | **reinstall** if eligible; otherwise clear tracked record | same; no force required |
| Matching-name dir missing/invalid metadata, **content exactly matches verified desired skill** | **adopt or repair metadata/index**, leave skill files intact | same; no need to replace skill content |
| Matching-name dir missing/invalid metadata, **content differs from desired skill** | conflict, exact path and reason | replace/remove safe matching regular dir |
| Remote no longer has a tracked skill, local clean | remove | remove |
| Remote revoked/deleted, local modified | conflict, retain, do not claim success | remove, no resurrection |
| Unrelated-name dir | ignore | ignore |
| Unsafe symbolic link/parent or reserved bundled name | fail safely | fail safely |

`--force` never removes files before a valid manifest/cached target has been selected and any required new content is prepared. **No repeated interactive consent**: flag is the user intent signal.

## 5. Profiles: share reconciliation, preserve offline switching

`mgd profile use prod` is conceptually **select Prod's verified cached desired snapshot + reconcile without `--force` + commit active-profile setting**, not a network request. It uses **the exact same conflict detection/result format** as `mgd agent-skill sync`. Perform preflight and prepare **before changing active profile**; when conflict occurs, leave original profile selected and original installs intact. When target has no verified cache, desired managed skills are empty: deactivate only tracked old profile entries, still respecting conflicts. Preserve other account caches.

Offer `mgd profile use prod --force` so users can intentionally discard modifications **offline**; no additional confirmation. `mgd profile use prod --sync-skills` means successful offline switch followed by explicit online update; remote failure reports degraded state but must not revert to another profile's skill set or purge cached copies. Combined `--force --sync-skills` applies explicit consent to both phases. No network traffic on bare `profile use`, and no silent activation on one-off `MGD_PROFILE`/base-URL/credential overrides.

Store exact account identity and a transaction journal so an interrupted switch cannot leave `activeProfile=prod` while Dev's managed skills remain installed, or silently reactivate a remotely removed skill. A source/profile with no verified snapshot must be treated as unsynchronized, not as a successful network-confirmed empty manifest.

## 6. Publish contract and intentional local edits

`mgd agent-skill init <name> [--type user|system]` creates **only** a new user-owned working folder with a template `SKILL.md` and sample description; no Registry publication or harness installation. `--type user` is default; `--type system` is explicit and subject to its current authorization. `pull` obtains a separate user-controlled editable directory; neither creates an automatic managed draft/backup.

`mgd agent-skill publish <directory>` defaults to **user**. When given a recognized installed copy owned by the current source account:
1. Ignore only its **local** `.magda-skill-install.json` when building and validating the ZIP. Verify linked publication ID/user/tenant against authenticated account; never publish under a different account accidentally.
2. Replace the **same user's** published skill with its recorded base checksum using existing If-Match. On stale remote publication, fail with conflict unless `publish --force` explicitly requests the existing **remote overwrite** semantics (typed authorization still required).
3. On confirmed API success update the originating installation's local baseline marker/index and the verified account-local publication cache to that **published content**. This installed copy now matches remote; other harness copies still at an older clean baseline can be updated by ordinary sync. If another harness has independent unpublished edits, ordinary sync must conflict.
4. **Do not implicitly synchronize all harnesses after publish.** Clearly print publication success, affected source, and advise running `mgd agent-skill sync`. Network/other harness errors must not make a successful publication appear to have failed. No auto-merging; user/agent can compare/edit manually before publish.

A newly initialized skill can be published using `publish <dir>`; it remains outside harness installation until explicit `sync`. If `publish` is asked to publish a locally edited projection after the installation source has been remotely removed, it must not silently recreate/overwrite with ambiguous identity; require a deliberate new own-publication path or clear remedial guidance.

### Future #3861: fork an explicitly installed shared user skill

The recipient **must never update the original publisher's ZIP/record**. When publishing a local modified **installed shared** skill, plain `publish` must stop with a clear explanation: it would become the recipient's **own publication**, uninstalling the recipient's original installation. Tell the user to rerun **`publish --force`** as explicit, one-time consent for this **fork/replace-my-installation** operation; no extra interactive prompt. Do **not** overload this operation into remote overwrite of the original publisher. For own publications, `publish --force` continues meaning intentional override of stale own remote checksum.

An installed shared skill and own publication can have the **same deterministic recipient skill ID/effective name**. Therefore deleting the install record and creating the own publication might be required in that order **only after locally preparing/validating content, checking the name, and checking both install/delete and own/create authority**. Record a recoverable intent; delete only the recipient-owned installation record, never the shared source; create recipient's owned publication using regular typed lifecycle. On failure between those steps, preserve the edited **local skill directory**, report the partial state and provide retry/recovery or compensating re-install if authorized (no false success, no destructive rollback assumptions). On success, rebind originating local installation/cache metadata to the own publication; other harness copies reconcile on later sync. Never assume backend Registry operations are a single atomic transaction. Alternative own-name fork may avoid the collision, but must be explicit and not silently rename the user's installation.

Implement the installation/fork support in **#3861**, not #3855. #3855 should use metadata/index/source patterns compatible with a future installation ID and alias; no sharing functionality in Stage 2.

## 7. MAGDA Workspace sync and Manager/UI timing

### Workspace sync initiator/timing matrix (normative)

| Initiator / time | CLI invocation / semantics | Confirmation | Workspace/Manager result |
| --- | --- | --- | --- |
| **Manager, initial provisioning of a verified fresh, empty neutral Sandbox** | `mgd agent-skill sync --force --workspace-status` | **None**; there can be no earlier user-owned skill edits | Detached/best-effort skill sync; DSH/Workspace `READY` independent of success; Manager alone records claim-scoped counts/status |
| **Manager, existing Workspace/PVC reconnect, resume, restart or reattachment** | Do **not** silently force; retain existing content and use non-forced reconciliation where needed | No auto-discard; only an explicit user action may allow forced resolution | Existing sessions and edited skills survive; conflict reports do not block READY |
| **User clicks Workspace Retry / Re-check (#3857)** | After confirm, Manager invokes `mgd agent-skill sync --force --workspace-status` inside caller's current Sandbox | **Required visible dialog before action**, warning unpublished skill edits/matching directories may be discarded; Cancel does nothing | Manager authenticates own READY claim, dedupes, validates result, updates claim-UID/READY-CAS status; DSH remains available |
| **User runs `mgd agent-skill sync` in Sandbox terminal or via agent** | Ordinary non-forced conflict-aware sync with Workspace eligible sources | None | Reinstall absent eligible skills; repair exact-match metadata; otherwise report actual conflicts without discarding edits. Does **not** update Manager last-run status |
| **User runs `mgd agent-skill sync --force` in Sandbox** | Explicit force for recognized/matching safe targets | No additional confirmation; flag is consent | Reconcile desired sources even after local edits; Manager last-run status need not change |
| **User runs local-computer `mgd agent-skill sync[ --force]`** | Same content/conflict/force semantics, but own-user-only local eligible set | No confirmation beyond explicit flag | Local results only; **never** patch remote Manager Workspace status |

**Presence versus modification distinction:** A missing installed directory is absence, never a conflict by itself; the next ordinary `sync` should reinstall an eligible skill. Metadata missing/invalid on an otherwise safe regular directory is repairable on ordinary sync when its complete content tree exactly equals the verified desired publication (online or cached), not merely when a filename or prefix matches. These rules apply uniformly to manual Sandbox CLI and local-computer sync; Manager-owned forced startup/retry is not an exemption from source/ZIP/authorization verification.

**Use the same sync conflict/force semantics in the CLI, but a different eligible source set and target root.** The Sandbox is user-owned DSH storage; include visible system + own + future installed shared user. All selected publication ZIPs and authorizations must be verified, and no stale/revoked source should be executed after a successfully completed forced reconciliation.

- **First initialization on a genuinely new, empty, neutral Sandbox**: Manager may run `mgd agent-skill sync --force --workspace-status` to avoid local-file conflict prompts and retain best-effort skill status. Do not block essential DSH/Workspace **READY** on any sync failure. No user-authored files should exist yet; never use unconditional force on an already-live/reconnected/reused user Workspace without checking whether it contains user changes.
- **Reconnect/resume, Manager process retry, or claim reattachment to an existing user PVC**: must **not silently force-discard existing local modifications**. Preserve session state and use non-force sync, or require the user confirmation path for a forced retry. Do not equate reattach with fresh claim/bootstrap.
- **User-triggered Workspace Retry / Re-check button (#3857)**: use an explicit confirmation dialog **before** invoking a Manager-owned forced Sandbox sync, describing that unpublished local edits or matching-named folders may be discarded and allowing Cancel. After confirmation, execute verified `--force --workspace-status` in *the authenticated user's existing Sandbox*, update Manager-owned status via READY/claim UID CAS, show in-progress and result, and keep DSH/READY accessible even on error. Confirm once at UI; no CLI double prompt. Do not trigger button automatically on status refresh. If user cancels, do nothing.
- **Manual terminal/agent CLI inside Workspace**: `mgd agent-skill sync` = no-force, report conflicts and preserve user files; `mgd agent-skill sync --force` = explicitly discard with no additional prompt, same as on local computer. The trusted Workspace marker determines the system+user manifest and one DSH target, not permissions bypass.
- **Manager-owned last-run Workspace status** reflects only Manager-invoked attempts. Manual CLI sync in Workspace need not update it; local-computer CLI never updates it. Manager must perform own-user authorization and never accept client-supplied success. Failures in Registry/Storage/OPA remain separate degraded skill sync status and do not gate READY. Startup forced sync is not a guarantee of success.

Do not loosen source ZIP/type/OPA validation and do not introduce an admin user identity into the Sandbox. Treat stale/removed installations as uninstalled only after verified reconciliation. The #3857 endpoint/UI belongs to #3857, but #3855 must provide the trusted CLI `--force --workspace-status` and safe bootstrap mode discrimination.

## 8. Safety, migration and Stage-2 acceptance

- **Pure Node.js** for supported local install, stage, copy, detection, cleanup and recovery. No Python 3 dependency (including profile switch with zero skills), no native addon or platform syscalls. A malicious same-user process racing at the syscall level is **not** an MVP defense objective. Keep practical symlink/root/path checks, strict verified source ZIPs and no accidental clobber.
- One lock shared across profile switches, local sync and publication update of source/index (plus resolved target roots if needed). Do not claim a Node process runs no concurrency merely because its JavaScript uses a single event loop.
- Only `.magda-skill-install.json` may be ignored for **local installation** digests/ZIP creation. Reject user ZIPs containing it; preserve hash/checksum semantics for legitimate Markdown. For an otherwise safe regular installation whose full content exactly matches the authenticated desired publication, **missing/corrupt/stale metadata is repaired by ordinary sync**. For mismatched content, ordinary sync conflicts and `--force` is explicit user consent for matching-name regular paths. Detect and refuse symlinked metadata files or unsafe roots.
- Preflight **every target before writes** and expose actionable grouped conflict diagnostics; `--force` bypasses content conflicts but **not** invalid root/link/traversal, incomplete manifest, ZIP corruption or authorization errors. Failures after preflight use temporary rollback/journal, not persisted draft copies; no silent data loss during failed preparation or write.
- Handle remote removal **before** deleting source/index references; interrupted cleanup must not resurrect a revoked skill or fail merely because the source record was prematurely dropped. Preserve permission boundaries: server-side revoked downloads are impossible; local user retains physical control of files they already downloaded, so non-force conflict may leave stale edited copy locally with a clearly unsuccessful status.
- Migration from prior `agent-skills-v1.json`, the more recent `sources/.../state.json`, source `drafts/`, symlinks, `projection-content/`, `projection-links/` and external sidecar ownership files must **not silently destroy existing modifications or previously preserved drafts**. Legacy preserved drafts are user data: leave safe in place and point user to their locations, but create **no new** automatic drafts. When old projection metadata/links cannot be safely identified, report manual migration conflict; `--force` authorizes reset only safe matching target paths, not arbitrary data deletion.
- If a selected profile cache is missing, bare `profile use` disables old managed target skills only after conflict preflight; it does not download remotely. No reactivation from tombstoned/deleted source on an offline switch.
- Test: local profile isolation incl. same record names on distinct server/accounts; all-copy harness discovery incl. metadata file (Claude/Codex/OpenCode/pinned DSH); edits in multiple harness copies; **normal sync reinstalls manually deleted eligible directories and clears absent deleted-source entries without force**; absent/corrupt/stale metadata with **exact full desired content** is repaired/adopted non-force; metadata missing plus **different** content conflicts and requires force; unrelated-name preservation; matching-name unrecognized dir normal conflict and forced reset; safe symlink refusal even with force; clean old version vs new remote version; full preflight no partial updates; explicit online/offline switching; `profile use --force`; interrupted copy/replacement/remote deletion; failed download before modifications; publication from own installed copy updating baseline and cache but not other harnesses; stale remote optimistic concurrency; legacy migration/preserved user data; successful forced fresh Workspace bootstrap, manual non-force/force CLI; status ownership and non-blocking READY. Future #3861 includes shared-to-own fork and failed partial-state recovery.

**Stage allocation:** Implement the copy-only local/Workspace CLI and projection replacement in **#3855 / existing draft #3850**, then stop for review. Keep #3857 button, API and confirmation dialog in **#3857** (design contract only in Stage 2). Keep installation/fork in **#3861** (design compatibility only in Stage 2). Do not start #3856 without Stage-2 review. This replaces the complex ~1,000-line symlink/marker/Python projection stack rather than adding another wrapper around it.
