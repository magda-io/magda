# Agent Skill authorization, sharing, identity and Workspace manifest

**Status:** Accepted design decisions, 2026-10-14; authoritative on these subjects for [skills.md](./skills.md), [authentication.md](./authentication.md), [web-ui.md](./web-ui.md) and implementation tickets #3854, #3855, #3857, #3858, #3861. Stage #3854 is under review; **do not begin #3855 or silently implement #3861 in PR #3850** before its review gate. Existing Registry/Storage API stay generic; no skill-only Registry/Storage feature or shared bucket is introduced.

> **Principle:** **Skill discovery is based on the intended user; skill access is based on authorization; skill synchronization is optional to Workspace availability.**

## Typed records and identity

| Registry record | Fields | ZIP and immutable identity |
| --- | --- | --- |
| Published user skill | `agent-skill.type = "user"`, **required** `agent-skill.userId`, `access-control` | One source ZIP linked to publication ID `agent-skill-<userId>-<name>` |
| Published system skill | `agent-skill.type = "system"`; **no** `userId`; `access-control` | One source ZIP linked to `agent-skill-system-<suffix>`, where name is `system-<suffix>` |
| Installed shared skill | `agent-skill-installation.userId`, `sourceSkillId`, optional `alias`, `access-control`; **no** `agent-skill` aspect | No ZIP; ID `agent-skill-<userId>-<effective-name>`; source remains another user's published skill |

Rename the old `agent-skill.scope` publication field to immutable **`agent-skill.type`** with `system|user`; do not represent installation as a third value of this field. Names from `SKILL.md` are immutable, regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 46 characters; system names start `system-`; user/installation names cannot, and runtime names are reserved. Preserve PENDING/READY/DELETING publication state, ZIP checksum, immutable creator and archive linkage.

**`userId` and `access-control.ownerId` have distinct meanings.** `userId` names the target user/namespace and is required for user publications and installations, immutable, **and must match the UUID embedded in the deterministic record ID**. `access-control.ownerId` is the Registry record owner used for permission constraints. Ordinary MVP creation requires `userId == ownerId == authenticated actor UUID`. Future explicitly permitted delegated provisioning may allow them to differ, but `userId` is **never itself permission to read**; the intended user still needs OPA access. For system publications, no `userId`. Enforce deterministic ID/userId consistency on all Agent Services creation, update, read and Workspace manifest resolution paths, fail closed for malformed records. Do not derive ownership from the ID, or infer target user from ownerId.

Preserve deterministic per-user ID uniqueness across own publications and installed shared skills; owner/alias/name changes must not bypass identity restrictions. For an installation **alias rename = uninstall then reinstall** under a new ID, requiring both install/delete and install/create permissions. Register install/update for later non-identity settings; initially it cannot rename an alias.

## Registered authorization resources, operations and stock roles

MAGDA Authorization DB registers resources and their CRUD operations:

```text
object/agentSkill/system/{create,read,update,delete}
object/agentSkill/user/{create,read,update,delete}
object/agentSkill/install/{create,read,update,delete}
agentWorkspace/access
```

**Do not register or implement `object/agentSkill/*/read`.** Use the Agent Services Workspace manifest API below. Operations remain independently grantable; a user may install without delete, or manage system skills without global MAGDA administrator status.

Ship **unassigned** configurable stock roles (do not auto-grant them to all Authenticated Users; retain admin-only initial Workspace access). Use generated or fixed UUIDs in DB migrations as convenient; app logic should depend on stable operation URI/semantic role identification, not hardcoded generated UUIDs.

| Stock role | Permission operations | Constraint | allowExemption |
| --- | --- | --- | --- |
| Agent Workspace Users | `agentWorkspace/access` | none | false |
| Agent Workspace Users | `object/agentSkill/system/read` | OrgUnit | true |
| Agent Workspace Users | `object/agentSkill/system/read` | pre-authorised | true |
| Agent Workspace Users | `object/agentSkill/user/create,read,update,delete` | user ownership | false |
| Agent Workspace Users | `object/agentSkill/user/read` | OrgUnit | true |
| Agent Workspace Users | `object/agentSkill/user/read` | pre-authorised | true |
| Agent Workspace Users | `object/agentSkill/install/create,read,update,delete` | user ownership | false |
| Agent Skills Admins | `object/agentSkill/system/create,read,update,delete` | none | false |

The two OrgUnit/pre-authorised read permissions (for each publication type) have **`allowExemption=true`** so setting source record `access-control.constraintExemption=true` permits anyone holding the matching exemption-capable read operation, without satisfying the specific OrgUnit or pre-authorised constraint. A pre-authorised permission without a matching **record permission ID** does not itself grant access to private publications. Owners receive their own user read via ownership permission. A system-skills admin role does not imply `agentWorkspace/access`.

**Important OPA privacy rule:** use typed **skill-specific** read rules, not the generic `verifyRecordPermission` OrgUnit-read fallback for an **absent/empty** orgUnitId. Skill read requires (a) matching owner grant, (b) an actually matching non-empty OrgUnit and user's managed org unit, (c) a matching permission ID included in `access-control.preAuthorisedPermissionIds` and assigned to the user, (d) `constraintExemption == true` plus a permission with `allowExemption == true`, or (e) applicable unconstrained management/admin read. Missing OrgUnit alone is not a grant. System writes are allowed to trusted non-admin users **only** through scope-specific management grants. Admin entrypoint's existing global bypass remains.

In `object/record/allow.rego`, route both published `agent-skill` and `agent-skill-installation` types exclusively to their own `object/agentSkill/{system|user|install}/{operation}` policy, with *no generic record fallback* for either typed state. Derive publication type from actual/proposed aspect, **not** caller path. Protect direct Registry access and linked Storage access, creation and attempted type/aspect removal, current/proposed update and mutation/bulk paths without bundling unrelated Registry policy refactoring into Stage #3854. Agent Services independently performs early typed OPA check before accepting create ZIP body and actual-record checks on reads/mutations. Registry/Storage still authorize under forwarded trusted caller session; keep existing direct generic API integrity limitation documented.

## Sharing: reuse Access Group features, no skill-source copying

Access Group currently auto-creates a **pre-authorised permission + role**, assigns selected users to the role and attaches a group-specific permission ID to a source Registry record's `access-control.preAuthorisedPermissionIds`. Its existing backend is limited to `object/record` operations and dataset attachment APIs. Extend/generalise its resource/operation configuration and linking to **`object/agentSkill/user/read`** (optionally constrained system sharing under suitable publisher permissions) instead of granting broad `object/record/read`. Validate the publication owner's/sharer’s actual authority before writing grant IDs; use existing user-ID input, Access Group UI/management components and API patterns in a simplified Share Skill interface. Recipient user UUID can be obtained from the account page. **Use group-specific permission ID**, not the stock role's global pre-authorised read permission ID, when attaching explicit grants.

Access Group membership is not installation. Recipients with source-read can *discover* shared READY publications, then use owner-constrained `object/agentSkill/install/create` to explicitly install an authorized other-user source. Installation record access must **never** confer original source ZIP access: source Storage object's linked `recordId` is the **published user skill ID**, not the installation ID. Recheck source `object/agentSkill/user/read` before installation, on ZIP download and every Workspace manifest resolution. On sharing revocation, recipients' installations remain uninstallable but the source is no longer downloadable/syncable. A readable but not installed shared skill is **not installed automatically**.

Stage #3861 owns Access Group generalization, sharing grant lifecycle, installation aspect/API/UI, and alias-specific sync. Stage #3854 establishes typed published-resource operations, constraints and stock roles and stage #3855 provides the manifest abstraction for later installations; do not expand the current implementation stage into full #3861 without explicit re-scoping.

## Workspace manifest, best-effort synchronization and UI feedback

Expose **`GET /api/v0/agent/skills/workspace-manifest`**, service method `getWorkspaceSkillManifest`, for Workspace initialization. This is **not** the browseable catalogue of all readable/installable skills. Fetch with the current user's trusted session using **separate paginated, permission-filtered Registry queries**:

1. All **visible READY system** publications: `aspect=agent-skill`, `aspectQuery=agent-skill.type:system` plus typed system read.
2. Current user's **READY user** publications: `aspect=agent-skill`, `aspectQuery=agent-skill.type:user`, `aspectQuery=agent-skill.userId:<currentUserUUID>` plus actual user source read.
3. Current user's **installations**: `aspect=agent-skill-installation`, `aspectQuery=agent-skill-installation.userId:<currentUserUUID>` plus actual install read. Resolve each `sourceSkillId` and independently authorise/read the original READY source/ZIP.

Merge into one *effective* manifest including source ID, effective alias, checksum and/or relevant source metadata for validation; do not create copied ZIPs. Filter `READY` source states, enforce userId-vs-ID invariants, handle source revocation and validate ZIP before extraction. `optionalAspect` is **not** a mandatory OR filter; Registry forbids `orderBy` plus `pageToken`; paginate each query through completion without incorrectly treating distinct sources as one continuation.

**Workspace usability is independent of skill sync.** Provision essential KAS claim/DSH/current-user credential/bootstrap separately, report Workspace READY and expose standard DSH even when *one, many or all* skills cannot be synchronized, including transient Registry/Storage/OPA outages. Skill resolution failures are **best effort**, not a Workspace-start gate. Skip revoked/missing/invalid sources individually and keep other skills; an infrastructure-wide failure must be marked degraded/failed **for skill sync** rather than falsely reporting zero skills as successful. Failed authorization cannot activate a new unverified skill. Expose sanitized status (e.g. `success`, `partial`, `failed`, `notAttempted`), counts and safe per-skill diagnostics via a small **MAGDA Agent Workspace UI** banner/status area (preferred to forking DSH). Direct retry control is **optional** initially; terminate+restart can rerun sync. Preserve normal DSH access irrespective of sync errors. On a later **successful** reconciliation, remove stale revoked/removed synced copies; continuous active-workspace revocation monitoring is not an MVP requirement. Already downloaded copies may remain until reconciliation, an explicit accepted trade-off.

## Delivery and acceptance

- **Design PR #3819:** keep this document linked from `skills.md`, `authentication.md`, `web-ui.md` and design README.
- **#3854 / PR #3850 (Stage 1):** revise schema, deterministic IDs, registered typed resources/permissions/roles, OPA/Registry+Storage delegation, published-skill APIs/tests **first**. Preserve #3853 Storage metadata fixes; no unrelated generic Registry improvements.
- **#3858:** supply `agentWorkspace/access` with stock role integration; access is self-Workspace-only.
- **#3855 (after Stage 1 gate):** implement manifest API/system+own query and nonblocking sync, UI status if feasible in integration with #3857. Extend third installation query in #3861. Keep CLI/sync compatible and do not require a new retry endpoint.
- **#3857:** permission-aware Settings catalogue/navigation reflecting typed URIs and optional Workspace sync error banner.
- **#3861:** Access Group typed sharing, installation CRUD, recipient resolution and Shared Skills UI.

Test normal/other-user/admin/trusted-system-publisher, missing OrgUnit read privacy, exemption and group-specific preauthorization, malicious mismatched ID/userId, direct Registry/Storage bypass, distinct source/installation ownership, create-only installer vs delete, deleted/revoked ZIP (skip), whole API outage (Workspace still READY + UI reports status), pagination and alias collisions. **Do not move to #3855 until revised #3854 changes in #3850 have been reviewed and accepted.**
