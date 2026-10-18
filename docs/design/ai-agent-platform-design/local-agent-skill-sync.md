# Agent Skill sync: authoritative scan-based, self-contained copy design

**Status:** Accepted design, 2026-10-18; implement in existing draft [#3850](https://github.com/magda-io/magda/pull/3850) as Stage [#3855](https://github.com/magda-io/magda/issues/3855). This **supersedes the 2026-10-17 global installation-index, multi-harness transaction journal, cross-harness rollback and profile-switch rollback requirements**, and the earlier symlink/Python/automatic-draft design. For authorization and source eligibility also read [skills-authorization-and-workspace-manifest.md](./skills-authorization-and-workspace-manifest.md); Manager UI retry belongs to [#3857](https://github.com/magda-io/magda/issues/3857); installed shared-source fork belongs to [#3861](https://github.com/magda-io/magda/issues/3861).

## 1. Goals, boundaries, trade-offs

- **MAGDA published skill ZIPs are the authoritative desired content**, selected through a verified source identity and complete authorized manifest, or through a previously verified cache for offline use. There is **no automatic local daemon**, cross-harness mirroring after publish or implicit network request from a bare profile switch.
- **Each installed skill is a real independent directory** in the harness's native flat skills root. Its root-level `.magda-skill-install.json` is **the sole authoritative durable installation record** (not a shared sidecar or centrally duplicated per-installation registry). Content is assessed against the recorded installed baseline and/or verified desired ZIP.
- **Scan harness roots and reconcile observed state.** **Remove `installation-index.json`**, any smaller previous-installation name/path inventory, **`operation-journal.json`**, global all-or-nothing transaction/rollback machinery, projection-content/links/symlinks, Python helpers and new automatic draft preservation. Keep the existing `mgd` config's active profile, account-separated verified source archive/snapshot cache, and explicit `pull` working-directory provenance, as distinct purposes. Do not introduce another hidden persistent installation database under a different name.
- **Preflight predictable conflicts across all selected harnesses before replacing/removing installed content**. Once preflight and verified download/staging succeed, execute independent **per-skill** changes. Successful operations **stay successful** when a later skill/harness encounters an unexpected disk/I/O failure. The command reports partial/failure and the next sync converges. We **no longer guarantee cross-harness or profile+installation atomicity**.
- Preserve **per-skill crash safety** with limited same-filesystem staging/temporary rollback and recoverable, identifiable leftovers. Never publish a half-written skill as a complete installed directory. Do not reintroduce a global transaction coordinator or a permanent auto-draft store.
- Remote authorization, ZIP/manifest validation, account identity, path traversal/symlink safety and a cross-process `mgd` lock remain. The threat model protects against **ordinary user mistakes and interrupted processes**, not hostile same-user syscall races; use portable Node.js fs, not Python/native extensions.
- A user-controlled local computer or existing Workspace can retain old-profile or revoked locally edited skill files after a non-forced conflict. **This is an explicitly accepted degraded state**, visibly reported, not a claim that changing an active profile or remote revocation prevents the user from executing previously downloaded material. Workspace authorization and DSH provisioning remain independent of skill sync.

## 2. Context and eligible source sets

| Execution context | Verified desired source set | Installation target | Sync authority |
| --- | --- | --- | --- |
| **Local computer** | Authenticated user's own READY **user** publications; future #3861 explicitly installed and currently readable shared user publications only | Detected Codex, Claude Code, OpenCode, configured DSH **native flat directories**, each an independent real copy | Explicit CLI sync or offline profile-use reconciliation |
| **MAGDA-hosted Sandbox** | Visible READY **system** + own READY user publications; future #3861 installed, still-authorized shared user publications | User's single Sandbox DSH skills root/PVC, independent real copies | Manager-triggered startup/recovery/retry or manual in-Sandbox CLI |
| **Explicit `mgd agent-skill pull <ref>`** | Exactly specified readable source (including authorized system source) | User-chosen unpublished working directory, **not activated** | User |
| **`mgd skills install`** | Existing bundled runtime skill | Its existing explicit bundled installation locations | Existing command semantics remain unchanged |

Do not auto-activate a merely readable but uninstalled third-party user publication, or system publications on a **local computer**. `--type all` on a local computer means all **locally eligible** sources, not automatic system installation. Type-scoped synchronization must not delete other types that were not selected. Use the trusted root-provisioned Workspace runtime marker to select the wider Workspace source set; untrusted `--workspace-status` alone cannot grant system-skill eligibility. Source ZIP reads and installation records must be authorized for the real user.

Preserve `MGD_AGENT_SKILL_DIR` as explicit single-target override, native root resolution/deduplication, DSH depth-one discovery and no influence on existing bundled `magda-mgd` copy management. Allow another explicit configured DSH root where previously supported. Unsafe links or special files are never traversed for installation or deletion, including with `--force`.

## 3. Verified source identity and *non-installation* cache

`mgd` profiles contain MAGDA base URL and credentials; an installation marker contains **no credentials**. Stable verified source identity is SHA-256 of canonical base URL + tenant ID + authenticated user UUID. Do not derive it from a mutable profile nickname or publication `type/id` alone. Verify identity via authenticated MAGDA endpoints when online; never use data cached for one tenant/user/account as another's. Preserve source-separated, validated ZIP files and snapshots for explicit online sync, offline `profile use`, checksum integrity and publication operations; archives should be immutable/content-addressed. Preserve snapshots of unresolved entries when manifest warnings/failed downloads prevent authoritative removals.

Illustrative layout (implementation may reorganize the cache internally):

```text
~/.local/share/mgd/agent-skills/
  sources/<verified-source-key>/
    state.json                          # verified source identity, manifest snapshot;
                                        # separately tracked intentional pull working dirs
    archives/<published-record>-<sha256>.zip

~/.claude/skills/analyse-csv/
  SKILL.md
  examples.md
  .magda-skill-install.json

~/.agents/skills/analyse-csv/
  SKILL.md
  examples.md
  .magda-skill-install.json
```

**There is no durable installation index, previous-name inventory or global operation journal.** Existing `mgd` profile configuration remains the sole active-profile selector. Account source state may track explicitly pulled working directories for `publish` optimistic concurrency; these are user-authored workspaces, not an installed-skill inventory and not automatically preserved drafts.

The metadata filename is **`.magda-skill-install.json`**, reserved at the skill root; include format/version, verified `sourceKey`, publication type/ID/kind, original installed archive checksum, installed content tree digest, effective name/alias, future recipient installation ID where applicable, and a random per-installation identifier when useful for per-skill recovery. Never include an API key, bearer token or password. For a recognized local installation, exclude **only** the exact root marker from content hashing or ZIP creation. Reject this marker and any other disallowed files in published user ZIPs; user skills remain Markdown-only. Check complete paths, file bytes and applicable normalized modes, not just `SKILL.md`. Local marker and source-account identity are **provenance hints to validate**, never authorization to use another account.

## 4. Scanning and classification (no central inventory)

For each selected harness root, **enumerate only immediate child entries** safely. Read an eligible regular child directory's root marker without following filesystem links. Construct the reconciliation candidate set as:

1. all eligible **desired** skill names from the complete authenticated manifest or previously verified offline snapshot, even if absent locally;
2. all **valid, recognized MAGDA-installed** child directories discovered from their markers, **regardless of recorded source profile**, including names absent from the current desired set;
3. only clearly identified per-skill interrupted-operation directories for recovery, never arbitrary unrelated directories.

**No historic-index fallback.** A folder with **no valid MAGDA marker and no name in the desired set** is *unrelated* and must be ignored, even if it used to be a MAGDA skill but the remote publication and marker were both removed. This is an accepted user-owned/orphan case. A malformed marker on a name **not** in the current desired set is likewise not proof of MAGDA ownership: do not remove the folder solely on that basis. A matching-name directory is included because the current manifest desires the name, not because a marker is required.

For recognized metadata, resolve the `sourceKey` to its verified cached identity and baseline content; validate marker format/ref/name/checksum, and do not trust arbitrary user-written JSON to expand deletion scope. A marker from another (previously active) profile is still a recognized installed skill; it is not automatically a modification, only **the local content digest versus its own recorded baseline** determines whether unpublished edits exist.

| Observed local path | Desired for current active source? | Ordinary `sync` action | `sync --force` action |
| --- | --- | --- | --- |
| Directory **absent** | Yes | **Install/reinstall** verified desired skill (absence is not modification) | Same |
| Directory absent | No | Nothing to do; no inventory to clear | Same |
| Marked installed content **clean** against its marker's previous verified baseline | Same source/name, unchanged | Keep | Keep |
| Marked content clean, desired updated or source changed | Yes | Update/replace from verified desired publication; preserve original until new ready | Same |
| Marked content **exactly equals current verified desired content**, but marker missing/malformed/stale/foreign | Yes | **Adopt or repair root marker only**, leave user content files unchanged | Same |
| Marked content differs from its trusted **previous installed baseline** | Yes | **Conflict**: preserve files, show source/path | Replace with desired |
| No valid marker; same-name existing regular dir **differs** from desired | Yes | **Conflict**: preserve files | Replace safe regular matching dir |
| Marked clean skill of old source, remotely deleted or not desired in current profile | No | Remove recognized clean directory | Remove |
| Marked **modified** skill of old source, remotely deleted or not desired | No | **Conflict**: retain directory and show its source | Remove |
| No marker or invalid marker, name **not in desired** | No | **Ignore as unrelated local directory** | Ignore |
| Root, directory, marker or descendant unsafe link/special file/path escape, reserved bundled name | Either | Report unsafe error | **Still refuse**; no traversal or unsafe deletion |

For an old-source marked skill with a clean *verified* baseline, normal sync may replace/remove as needed. If its baseline cache cannot be validated and its content is not equal to a verified desired version, treat ownership/cleanliness as ambiguous, preserve it, and report an actionable conflict rather than discarding under ordinary sync. `--force` may reset a **safe matching, recognized installation** when the desired set is verified; preserve unsafe paths. Missing marker + current desired complete content equality needs no `--force`, while different content requires it.

**Remote deletion and revoked authorization:** successful authoritative reconciliation removes clean marked installations (or forced modified ones) discovered by scan, including foreign-profile sources. A failed/incomplete manifest, per-source download failure or warning is **not** authoritative absence; do not delete potentially affected installations on that basis. A user who manually removes both the remote record and local marker leaves an unrelated local folder that may still be discoverable by the harness; document this local-user-control limitation rather than reintroduce an index.

## 5. Sync pipeline and partial failure semantics

1. **Resolve** active profile/source and online authenticated complete authorized manifest (or explicitly requested verified offline snapshot). Fail closed for unknown profile identity or unavailable/invalid/ambiguous manifest. Retain old files/cache on outage; don't turn network failure into empty desired set.
2. **Recover** recognizable per-skill staging/backup leftovers in selected roots conservatively. If the old verified directory can be restored unambiguously, restore it; if current complete installation is valid, keep it; if ambiguous, retain files, identify their exact paths and report a conflict—no silent deletion of user content.
3. **Scan** candidate names as `4, inspect markers and installed files without following links; compare to recorded baseline and desired publication; enumerate **all** actionable local content conflicts **before destructive changes**. `--force` is explicit consent and requires **no second confirmation** in the CLI. `--force` does not bypass OPA, missing source integrity or unsafe paths.
4. **Prepare** required remote/cache ZIPs: validate full content, name, effective alias, owner/tenant where relevant, checksum and ZIP limits; stage complete replacement real directories in a hidden same-filesystem location before moving/removing any old installation. A download/stage failure **cannot destroy existing copies**; operations for unaffected skills may still succeed if the desired set is reliable, with accurate result.
5. **Apply each candidate independently**, using only Node.js portable fs. Metadata-only repair writes a validated marker without rewriting `SKILL.md`. For replacement, use a narrowly scoped per-skill temporary old-tree backup and complete prepared new-tree install. Make the final visible tree valid and self-describing, preferably with all files including marker staged before final rename. If install fails, restore that one skill where possible. No global all-or-nothing transaction. Successful Claude copy stays updated if later Codex update fails.
6. **Converge on subsequent sync** from actual markers and verified desired snapshots, not an installation index. Clean up safe completed per-skill temporary files; if a crash leaves ambiguity, preserve files and return a recoverable diagnostic. Temporary rollback is **not** a durable draft, source inventory or global journal.

**Result and process exit:** classify success only when requested eligible targets reconciled without unresolved failures/conflicts; partial if some actions succeeded but failures/conflicts remain, failed if all relevant work cannot proceed or source authority unavailable. Include skill, source identity/profile, harness, absolute path, action, cause and remedy; show both successes and failures. Return a **nonzero CLI exit code for any unresolved conflict, partial or failed result** so scripts never treat a partly reconciled source as fully installed; Workspace Manager receives structured status and independently updates claim annotations. The user can rerun ordinary `sync` or `sync --force` to converge. Completion of some operations doesn't imply same version across all harnesses.

### Per-skill crash recovery boundary

A complete, already-visible installed directory contains valid `SKILL.md`, complete assets and the installation marker. A temporary replacement under e.g. `<harness-root>/.magda-skill-staging/<operation-id>/...` may hold **prepared new** and **previous old** copies, both with enough validated marker/operation context to identify their intended skill and original path. On startup/re-sync enumerate only this tool-owned reserved staging root; never mistake it for an ordinary installed skill or follow symlinks there. For interrupted forced replacement, retaining/restoring the old locally modified copy when no valid final new copy exists is safer than deleting it; a later explicit `--force` can retry. If both old and complete new copies exist, keep the valid installed final copy and remove old temporary backup only when safely identifiable. If neither can be identified, stop that skill and explain manual recovery. Avoid a shared multi-harness journal, cross-root rollback and duplicate index/metadata commit points.

## 6. Commands and user intent

| Command | Authority and effects |
| --- | --- |
| `mgd agent-skill sync` | Explicit online sync for current profile, conflict-aware, repairs exact-match markers, reinstalls missing skills, removes clean no-longer-desired marked skills; never discards genuinely modified content |
| `mgd agent-skill sync --force` | Explicit, **non-interactive** consent to discard local content conflicts of matching safe desired names and recognized marked old-profile/removed skills; install or remove according to current **verified** desired source set |
| `mgd profile use prod` | **Step 1 persist active profile = prod; Step 2 offline normal reconcile** from Prod's previously verified cache. Errors/conflicts don't undo Step 1; active profile remains Prod. No network unless requested |
| `mgd profile use prod --force` | Profile remains changed; Step 2 performs forced reconciliation (offline verified cache). No extra confirmation |
| `mgd profile use prod --sync-skills` | After selecting profile, explicitly fetch online manifest/ZIP updates and run ordinary reconciliation; optional `--force` applies to reconciliation |
| `mgd agent-skill publish <dir>` | User publication by default; recognized installed copy targets **its recorded source account**, regardless of the current active profile. Does **not** sync other harness copies |
| `mgd agent-skill init <name>` | Create template local user-skill working directory, **not** install or publish |
| `mgd agent-skill pull <ref>` | Copy an explicitly readable publication into user-controlled unpublished working directory |

**Profile switching has no rollback**. If skill sync fails, show a detailed warning such as `Active profile: prod; skill sync: PARTIAL; one edited skill from dev remains installed`, and return nonzero. The old profile's modified skill may still be visible to harnesses until resolved. This is acceptable but must be plainly documented. `mgd profile use` can succeed as a **profile selection** even when overall command exits nonzero due to skill reconciliation; CLI messaging must distinguish both states. An uncached target has **no verified desired snapshot**: switch profile, report not-yet-synchronized/unavailable and avoid making an unverified empty desired-set deletion; user can run online `sync`. Do not silently activate a one-off `MGD_PROFILE`, URL or credential override in the user's global harness roots. Profile create/update/remove need the same no-stale-account/no-accidental-delete rules; do not retain any hidden two-phase config+install transaction.

**Publishing from an installed copy**: The marker (`sourceKey`, exact original publication ID/kind, base archive checksum) determines target. Resolve sourceKey to previously verified account identity in the source cache; locate a configured profile with currently valid credentials matching that canonical instance+tenant+user. Do not use the active profile as target unless it actually matches; do not automatically change global active profile. Authenticate with the real user's permissions, verify the source identity and publication, use the recorded base checksum/If-Match (or explicit own `publish --force` stale-pub overwrite), and refuse with guidance if no credentials/source access. Do **not** publish merely because marker JSON claims another account; provenance and authorization must be corroborated. A removed original publication must not silently be recreated. Exclude installation marker only from a recognized safe installed directory. After API-confirmed success, refresh that copy's marker/baseline and its verified origin account cache; other harness copies remain unchanged until explicit sync. If local post-publish bookkeeping fails, clearly report remote publication succeeded and give recovery instructions, never retry as a new publication blindly.

For *intentional `pull` working directories*, retain the existing tracked source/base-checksum semantics so they publish to their original account rather than accidentally using a new active profile; when no stored provenance exists, creation targets current explicitly selected/authenticated user account. Do not confuse this explicit authoring provenance with an installation inventory.

**Future installed shared skill #3861**: the original publisher's ZIP is **never modified** by recipient publishing. Plain `publish` of a recipient-installed shared skill must refuse with explanation; `publish --force` explicitly consents to converting it into a **recipient-owned user publication**, removing only recipient's installed-sharing record if necessary for deterministic name/ID collision. Resolve recipient credentials from the installation's *recipient* sourceKey, validate/create authorization, stage first, use a recoverable server-side uninstall/create sequence without pretending multi-record Registry atomicity, and preserve edited local copy on failure. After success rebind origin copy's marker; other harnesses sync later. Implement #3861 later; only ensure Stage-2 marker and source cache permit this.

## 7. Workspace — same engine, different initiator and desired sources

Workspace sync uses **the same scan/classify/preflight/apply/`--force` semantics** and independent real DSH directory copies. The only substantive differences are **who initiates sync, when to force, eligible sources, and status/UI ownership**; do not duplicate an entire Workspace reconciliation algorithm.

| Initiator and time | Sync behavior | Confirmation | Workspace status / DSH |
| --- | --- | --- | --- |
| Manager bootstraps **genuinely new empty** user Sandbox/PVC | Execute `mgd agent-skill sync --force --workspace-status` in Sandbox; verified Workspace system+own+future-installed manifest | None needed (no existing user edits) | Best-effort, never blocks essential Workspace/DSH `READY`; Manager writes claim-owned summary |
| Manager startup recovery, existing Workspace reconnect, resume or claim reattachment | Non-forced sync if desired; **do not silently discard previous edits** | None | Conflicts/errors reported without disabling DSH/READY; status Manager-owned only for Manager attempts |
| User selects **Retry / Re-check** in Settings (#3857) | **After confirmation**, Manager performs `mgd agent-skill sync --force --workspace-status` against authenticated user's current READY Sandbox | Required dialog warning unpublished changes or same-name directories may be discarded; Cancel makes no call; no second CLI prompt | Reuse claim-UID/READY CAS, dedupe/race protection, Manager validation/result counts; DSH remains usable |
| User/agent runs `mgd agent-skill sync` in Sandbox terminal | Normal non-force sync, same semantics as local CLI | None | Repairs matching markers, reinstalls missing eligible skills, reports conflicts; Manager last-run status not necessarily changed |
| User/agent runs `mgd agent-skill sync --force` in Sandbox terminal | Force sync, same semantics as local CLI | No second confirmation | May discard safe conflicting skill copies; no Manager last-run annotation mutation |
| User runs local computer sync | Same engine but **only local eligible sources** and native harness targets | Only explicit CLI flag is consent | Never updates remote Workspace Manager state |

Manager sync errors and local conflicts **never make Workspace unusable**; surface a clear last-attempt status/banner and future #3857 user Retry button for eligible failure/partial outcomes. If sync is triggered by the system, its result belongs to Manager's last-run status. Manually run CLI sync does not rewrite that claim status. A GET/status refresh never represents a new synchronization attempt. Manager retry requires own `agentWorkspace/access` and authenticated current Sandbox, never arbitrary pod targeting or client-supplied success; no admin identity for user ZIP download. Keep Stage-2 Manager exec/status foundation, reserve Retry UI/API for #3857.

## 8. Implementation strategy, compatibility and acceptance

**Stage #3855:** In draft #3850 replace/simplify current `agentSkillReconcile.ts` and source/index integrations instead of layering another index/journal on top. Keep portable Node fs, verified ZIP cache, real directory-copy harness discovery, metadata, cross-process operation lock, existing bundled skill install, explicit `pull` authoring and genuine local conflict checks. Remove central install index, global journal, global rollback, saved pending-profile transaction, Python, symlinks and new auto drafts. Implement directory scanning and independent per-skill recovery. Change profile CLI/config handling to **commit selected profile before reconciliation**, without reverting selection on sync failure. Change `publishInstallation()` to select credentials through the marker's verified original account instead of requiring current profile match. Preserve auth/source identity protection and privilege boundaries.

**Existing pre-release artifacts:** no released persistent state requires live migration, but do **not destroy** local user data or old retained drafts referenced by pre-release files. Obsolete `installation-index.json` / `operation-journal.json` may be safely ignored/retired after inspecting that no incomplete operation owns recoverable user data; don't run former global rollback code automatically against a newer scan-based state. Leftover old symlinked projections are unsafe and should be reported, not followed or deleted without explicit manual action. Don't make a clean fresh install depend on Python or legacy files.

**Test matrix** (at least):
- Scan roots with many unrelated dirs; valid current-source/old-source markers; absent source and marker (ignored); invalid marker and no desired matching name (ignored); unknown matching desired name exact full content (adopt), different content (conflict/force), and marker symlink/special file unsafe.
- Normal `sync` reinstalls a manually deleted desired skill; metadata-only repair leaves `SKILL.md` inode/mtime unchanged; previous baseline used to distinguish local edit from remote-only version change.
- Remote removal/revocation cleans **marked unmodified** installations by scan; preserves marked modified conflict; forced removes; **both remote source and marker missing** leaves unrelated user folder alone; incomplete manifest/outage/failed download never implies deletion.
- Partial I/O: Claude update succeeds, Codex fails, Claude stays new; result `partial` and nonzero; next sync continues. Download/staging failure leaves old copy intact; no global rollback. One-skill crash after old-to-temp move, after new rename, with ambiguous backups; no loss or silent unsafe deletion and next sync recoverable.
- `profile use prod` commits Prod **before** offline reconciliation. If Dev edit conflicts or I/O fails, Prod stays active, conflict names Dev source, nonzero; subsequent `sync --force` clears old-profile marked directories not desired in Prod. `--sync-skills` expressly performs network sync; uncached profile reports no verified snapshot and does **not** purge from imaginary empty manifest.
- Publish edited **Dev** installed copy while **Prod** active: credentials resolved via Dev marker+verified cache+matching configured Dev profile, verified Dev user/tenant and If-Match, Dev publication updated, only origin marker/cache updated, Prod remains active, other harnesses unchanged; nonexistent/renamed/revoked credentials and wrong user fail safely; no wrong-account writes. Explicit `pull` working-directory provenance remains correct.
- Workspace: genuinely fresh forced startup; existing-reconnect/non-forced sync; manual ordinary and forced CLI same engine; Manager status best effort/non-blocking DSH/READY; #3857 retry dialog/API not implemented in #3855; Minikube Manager fresh-claim → exec/status and restart non-force recovery where possible.
- Real harness discovery with marker (Claude/Codex/OpenCode/pinned DSH), cross-process lock, malformed ZIP/OPA/path safety, builds and CI.

**Stage allocation:** #3855 implements the shared scan engine/CLI/Manager bootstrap and stops for review. #3857 adds the confirm-then-force Retry UI and endpoint using Stage-2 Manager primitives. #3861 implements sharing/recipient fork. Do not start #3856 until Stage-2 review is complete. PR #3850 remains **draft**.

**Accepted trade-off summary:** durable source snapshots and standalone installed directories, no installation inventory/journal, independent successful sync actions, non-atomic profile switching, local-user-controlled orphan retention, and per-skill—not multi-harness—crash recovery. Convergence and non-destructive ordinary sync are more valuable than perfect cross-harness atomicity.
