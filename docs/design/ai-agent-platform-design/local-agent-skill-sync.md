# Local Agent Skill sync: multi-profile cache and harness activation

**Status:** Accepted design decision, 2026-10-16; implementation follow-up in [#3855](https://github.com/magda-io/magda/issues/3855) within draft [#3850](https://github.com/magda-io/magda/pull/3850). This is the **local-computer** contract. [Workspace synchronization](./skills-authorization-and-workspace-manifest.md#workspace-manifest-best-effort-synchronization-and-ui-feedback) has a different source set and status owner.

## Intent and supported modes

`mgd agent-skill sync` on a local computer is an **explicit request to download and activate** eligible MAGDA skills for supported, locally installed agent harnesses. Do **not** require a second activation command in the normal case. Local CLI profile switching is distinct from remote publication and from a MAGDA-hosted Workspace's own Sandbox bootstrap.

| Context | Skills included by default | Destination/status |
| --- | --- | --- |
| MAGDA Agent Workspace Sandbox | Visible READY **system** + current user's READY **own user** publications; future recipient-owned installed user publications (#3861) | Current user's DSH-compatible Sandbox skill directory/PVC; Manager-owned claim status for Manager-triggered sync. Workspace READY/DSH remains independent of sync failures. |
| Local computer | Current user's READY **own user** publications; future recipient-owned explicitly **installed shared user** publications only (#3861) | Source-separated local library and selected active profile's flat harness projections. Local sync never modifies Workspace claim annotations. |
| Explicit CLI `pull` / local drafts | Exactly requested readable published source; no automatic activation | User-provided draft/review path; explicit publish still required. |

Do **not** automatically download/activate system publications on a local computer (they may contain executable scripts, models and large assets). Do **not** auto-activate other-user publications merely because they are readable: recipients must explicitly install them through #3861. Even Markdown-only skills can contain untrusted instructions; continue validating archive/frontmatter/metadata and warn about trusting content. A user can use the existing explicit `pull` command to inspect an authorized system publication without automatically installing it.

For local `sync`, `--type all` means **all locally eligible skills** (own plus installed shared after #3861), **not** all server-visible system publications. `--type user` selects the user-publication subset; ensure no compatibility path silently broadens local selection to system. Document/validate any legacy `--type system` invocation clearly (do not secretly auto-install systems); the Workspace mode retains its system/user filtering. Make source selection by explicit mode/context, not an untrusted caller-controlled claim to be a MAGDA Workspace.

## Profile identity and persistent source-separated library

Reuse the existing `mgd` profile/configuration and authentication system, including `MGD_PROFILE`, `MGD_BASE_URL`, `MGD_API_KEY_ID`, `MGD_API_KEY` and `XDG_CONFIG_HOME`. A **named profile is a selection alias**, **not** a secure identity or cache key.

A durable source identity must include the **canonical MAGDA instance base URL, tenant, and authenticated user UUID**; derive a filesystem-safe stable hash/key from this tuple (never include raw API keys). Obtain/verify tenant and user identity via the appropriate authenticated MAGDA account endpoint when online. Cache the verified identity for offline profile switches; on later authentication compare against that identity before mutating or reusing an existing source library. If a profile is edited to a new instance/user/tenant, treat it as a different source rather than migrating or reusing unrelated skill state. Different friendly profile aliases for the same source should not duplicate or overwrite its library.

Suggested local durable layout (illustrative; use `XDG_DATA_HOME` where appropriate; provide migration from earlier state):

```text
~/.config/mgd/config.json                          # existing named profiles, API credentials
~/.local/share/mgd/agent-skills/
  sources/<source-key>/
    state.json                                     # own checksums, managed digests, draft refs
    skills/<published-source-id>/...                # verified cached extracted content
    drafts/...                                     # unpublished/modified local copies
  projection.json                                  # active profile/source and managed outputs
~/.agents/skills/
  magda-mgd/                                       # existing separately installed bundled CLI skill
  analyse-csv/                                     # active profile only, real flat skill directory
~/.claude/skills/
  magda-mgd/                                       # existing bundled CLI skill
  analyse-csv -> ~/.agents/skills/analyse-csv       # example per-skill link when supported
```

`agent-skills-v1.json` is an **index/state file**, not ZIP contents: its previous single global version and state keys `type/id` cannot distinguish two servers publishing the same deterministic record ID, or two users. The current `~/.agents/skills/<name>/SKILL.md` files are **actual active skill content**, not the source-scoped state. Neither may be treated as implicitly associated with whichever profile is selected today.

Source-keyed state must include downloaded source identity, checksum, installed tree digest, source publication reference, intended user, local-draft provenance and effective name; do not accidentally publish a draft against a different source with the same `type/id`. Support offline activation from a **previously verified cache**, but never infer an account identity from the unauthenticated profile name alone. Preserve old source caches on profile removal until explicitly cleaned up.

## Active flat projection and harness integration

**Only the current globally active profile's eligible skills** enter shared local active harness projections at a time. No cross-profile simultaneous activation by default. Consequently equal skill names on different MAGDA servers do **not** require automatic profile prefixes in the visible `SKILL.md` name. Same-profile own/installed alias collisions must be rejected through the publication/installation namespace; still detect collisions with bundled skills and any unmanaged/other-harness skill directory.

Avoid nested `<skills-root>/<profile>/<name>/SKILL.md` as the general active representation: harness discovery depth is not portable. Do not generate a combined index skill. Keep **flat** `<harness-root>/<effective-skill-name>/SKILL.md` entries; synchronize one source copy and create **per-skill directory symlinks** only for harness versions where discovery and safety have been tested. Where symlinks are unsupported or the root itself is unsuitable, create managed verified directory copies using staging/atomic replacement. **Do not symlink whole skill roots or individual `SKILL.md` files as a portability assumption.** Do not rewrite a source ZIP to force profile qualification; only apply a validated alias to a derived projection when future #3861 installation alias support needs it.

Reuse/extract the existing harness resolution from `packages/mgd/src/skills.ts` (`mgd skills install` knows global/project paths for Claude Code, Codex and OpenCode); retain that command's existing bundled `magda-mgd` copy-install/uninstall semantics unchanged. Use documented/verified roots for DSH (including `DSH_HOME` and configured skill directory), Codex `~/.agents/skills`, Claude `~/.claude/skills`, and OpenCode's native/shared roots; **deduplicate overlapping roots**, do not blindly duplicate per harness. Preserve `MGD_AGENT_SKILL_DIR` override for explicit single-target/Workspace integrations; do not silently replace Sandbox-managed paths with the multi-harness local-computer layout. Confirm discovery, per-skill directory symlink compatibility, live refresh and behavior with multiple agent conversations on supported pinned versions; copy fallback is required where necessary.

Each projection entry must be tracked as `mgd`-managed and have safe path/link identity checks. Never delete, replace or follow an **unmanaged** existing skill folder, symlink or a bundled `magda-mgd` skill. Report conflicts rather than shadowing or replacing another user's skills. Cache remains authoritative: projection removal on profile switch must **never delete cached originals**. Stage verified files atomically and preserve relative resources and safe file permissions; avoid symlink traversal and TOCTOU exposure, and do not follow untrusted filesystem links for cleanup.

## Profile switching, explicit sync and overrides

`mgd profile use prod`:
1. Selects `prod` as the global active profile in existing config.
2. **Offline and without network access**, switches the active, owned local projections to `prod`'s previously verified cache (if any) and deactivates only the previous `mgd`-managed projections, protecting local modifications as drafts under their **original source**.
3. Preserves bundled `magda-mgd` and all unmanaged skill directories, leaves other profiles' caches intact, and reports missing cache/conflicts or partial activation visibly.
4. If `prod` has never been synchronized, **does not leave dev's managed skills active**: safely deactivate old managed entries and explain that `mgd agent-skill sync` is required. No implicit remote download is attempted.

`mgd agent-skill sync` with the currently active profile: fetches the current profile's authorized **local-eligible** manifest, verifies identity and ZIPs, reconciles its persistent source library, preserves drafts/conflicts, and refreshes active harness projections. Remote outage cannot be misreported as a clean empty manifest and must not destructively delete the last verified cache. A user-requested `mgd profile use prod --sync-skills` may combine offline switch and explicit online update; network failure should retain the cached projection, report degraded/failed sync and not revert to an unrelated account. No background daemon, watcher or auto-sync on every profile change.

A one-off `MGD_PROFILE=dev mgd agent-skill ...` or `MGD_BASE_URL=...` override **does not silently switch the machine-wide active harness projection** when the configured global active profile is `prod`. It may fetch, inspect, publish or refresh only that source's isolated cache; activation requires explicit global `profile use` (or a separately explicit switch, if implemented). Distinguish selected API profile from global active projection in code and documentation.

Operations `init`, `pull`, `publish`, `delete`, `sync` and future `install/uninstall` must carry correct source provenance. Local drafts are unpublished until explicit publish; tracked checksums and strong `If-Match` remain scoped to the exact source identity. A remote deletion/revocation is reflected on **successful** authorized reconciliation; if a projected copy was edited, preserve it as a non-managed local draft and remove it from the executable skill projection rather than silently losing user work.

## Locking, crash recovery and migration

- The existing OS-released single-process lock protects the old shared state path. Moving to source-specific state paths **must not allow concurrent operations from distinct profiles to mutate the same shared active projection**. Use a stable **projection-wide lock** for all activation/profile changes and coordinate per-source state writes under that lock (or a proven consistent lock order). Avoid stale-lock deadlocks, lost updates, and a false assumption that profile-specific locks serialize shared targets.
- Make multi-harness projection updates crash-safe and idempotent. Source cache should not be destroyed by failed projection, interrupted downloads, unavailable services, or a failed link creation; recover safe incomplete projection from its journal/manifest. Do not claim cross-directory all-or-nothing atomicity unless implemented; use explicit recovery and clear diagnostics.
- Existing Stage-2 `~/.config/mgd/agent-skills-v1.json` and active `~/.agents/skills` may exist. **Do not blindly reassign them** to the newly active profile or silently remove them. Migrate only when source identity is verifiable; otherwise preserve/backup and explain manual reconciliation. Keep compatibility with current Sandbox environment and users who explicitly set `MGD_AGENT_SKILL_DIR`.
- Validate mismatched/corrupt state, link escape, non-directory/symlink parents, checksum drift, local edits and duplicate names. On any conflicting unmanaged path, stop/skip only the affected projection, preserve all original data and return actionable status.
- Permissions: follow normal real-user MAGDA API auth, never source ZIP reads as Agent Manager's internal administrator. Local sync has **no API to patch Workspace status**.

## Verification / Stage-2 acceptance additions

- Two distinct MAGDA instances/accounts publishing the **same deterministic skill ID/name** retain separate source caches, checksums, tracked drafts and publications; syncing one never deletes or overwrites another source's cache.
- Switching `dev -> prod -> dev` changes only `mgd`-managed active projections; works offline, never contacts MAGDA unless `--sync-skills` requested; unsynced prod removes visible dev-managed copies safely. Profile override `MGD_PROFILE=prod` for a one-off command does **not** swap global active skills.
- Changes to URL/tenant/user behind an existing profile do not reuse another identity's source state; local publish/delete with the wrong account is prevented.
- A local sync automatically exposes own eligible user skills in tested Codex, Claude Code, OpenCode and configured DSH directories through documented root mapping, using tested symlinks or safe copy fallback and preserving `mgd skills install` behaviour. Validate actual harness discovery (including DSH depth-1 scanning) rather than only filesystem existence.
- System publications and merely readable uninstalled foreign user publications are **excluded from local automatic activation**; future #3861 explicitly installed, still-authorized shared user publications are eligible. Workspace mode retains system+own and future installed sources.
- Managed/unmanaged name collision, bundled `magda-mgd` preservation, symlink/root safety, local edit preservation, `--force` reconciliation even with unchanged remote checksum, atomic recovery and concurrent profile-switch/sync cases.
- During Registry/Storage/OPA outage, local cache and projections remain safe; manual CLI operation does not alter remote Workspace Manager status. Distinguish cache freshness from successful remote reconciliation.

## Scope and cross-stage dependencies

This refines **Stage #3855** before sign-off, not Stage #3856 or #3857. Stage #3857 separately owns the MAGDA Workspace **Retry / Re-check skill sync** Manager endpoint/UI; it is **not** a side effect of the local CLI. Future #3861 implements recipient installations/sharing and extends the local eligible-set resolver without changing the source-library/projection model. Generic Registry hardening remains in #3862/#3863.

This document is authoritative for the accepted multi-profile and local harness behavior, superseding the older Stage-2 example of `mgd agent-skill sync --type all` blindly projecting system + user sources into one `~/.agents/skills` tree.
