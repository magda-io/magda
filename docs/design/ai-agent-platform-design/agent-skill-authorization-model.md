# Agent Skill authorization model

**Status: Revised 2026-10-25** (#3869/#3870, installation integration in draft #3864). This document supersedes the parts of [skills-authorization-and-workspace-manifest.md](./skills-authorization-and-workspace-manifest.md) that describe OPA validating a publication's identity, typed write delegation at the generic `object/record` level, and the accepted "direct generic Registry mutation may bypass service-owned invariants" limitation. The rest of that document (typed resources, roles, read constraints, sharing, Workspace manifest and sync) is unchanged.

## Why it changed

The original Stage #3854 policy validated a publication's **deterministic identity** inside OPA (`validPublicationIdentity`):

- `regex.match` on the user UUID and the skill name;
- `count(name) <= 46`;
- `not startswith(name, "system-")`;
- `record.id == sprintf(...)` and `archiveKey == sprintf(...)`.

These rules were reached by every typed write decision, including the generic `object/record/update|delete` decisions that Registry makes **by partial evaluation** with an unknown record:

- bulk record updates;
- deleting a record (or one of its aspects) that doesn't exist;
- `trimBySourceTag`.

OPA keeps built-in calls on unknown values in the residual rules, and the residual can't be translated into SQL. The decision then failed with a 500 for every non-admin user holding Agent Skill permissions (#3869). The parser's error is a deliberate safeguard, so the fix is to change the policies, not to silence the parser.

Those checks are **data validation**, not authorisation. Agent Services already performs them, before every write and for every record it returns. They only seemed necessary in OPA because ordinary users could also write Agent Skill records **directly** through the generic Registry API. There, the identity rules did two pieces of real authorisation work:

1. **Namespace ownership on create:** a user could only create `agent-skill-<own id>-*`.
2. **Immutable identity on update:** record IDs never change and were tied to `userId`, `name` and `archiveKey`, so none of those could change either.

The revised model removes the direct path instead, so neither job is needed in OPA.

## Principles

1. **OPA only authorises.** Agent Skill rules use only literal comparisons and existence checks on record fields. Every partial decision can be translated (e.g. into Registry SQL filters). Data validation (identity, naming rules, archive linkage) lives in Agent Services, plus the `agent-skill` aspect JSON schema for formats.
2. **Agent Services is the only non-admin writer of Agent Skill records and archives.** For each create/update/delete, it authorises the **real caller** with the one typed operation (`object/agentSkill/<system|user>/<create|update|delete>`, a full evaluation of the actual or proposed record). Only then does it write the Registry record and the archive, with its internal session.
3. **Unconstrained generic grants are trusted.** An `object/record/<operation>` permission with no ownership, OrgUnit or pre-authorised constraint applies to **every** record, including Agent Skill records, for reads too. No built-in role has one, so it can only exist because an admin granted it on purpose. Such users operate on Agent Skill records **as generic records**. Agent Services' typed endpoints still require typed permissions.
4. **Constrained generic grants never reach typed publications or installations.** Records carrying `agent-skill` or `agent-skill-installation` never fall back to constrained generic `object/record` grants. Draft #3864 adds typed installation read dispatch but keeps generic writes reserved for admins and unconstrained grants.

## Rules by layer

### Typed rules: `object/agentSkill/*` (`object/agentSkill/allow.rego`)

Only ever fully evaluated: Agent Services calls them with the concrete record and `unknowns: []`. They're also reached for reads through the generic dispatch below.

- **Type** comes from the record (`agent-skill.type` plus presence/absence of `userId`), never from the caller's URL.
- **Read:** owner, actually matching non-empty OrgUnit, exact group-specific pre-authorised permission ID, exemption, or unconstrained typed read. Unchanged.
- **Create a user skill:** owner-constrained typed create, self-targeted only (`userId == ownerId == caller`), with `createdBy`/`updatedBy == caller`.
- **Update/delete a user skill:** owner-constrained typed update/delete on the caller's own publication.
- **System skills, and broad user update/delete:** unconstrained typed grants (e.g. **Agent Skills Admins**). Create still requires matching attribution.
- **No identity validation.** A record whose ID doesn't match its type, user and name is not rejected by OPA. Agent Services rejects it.

### Typed installation rules: `object/agentSkill/install/*` (`object/agentSkillInstallation/allow.rego`)

Draft #3864 applies the same division of responsibilities to recipient installations. Agent Services validates the deterministic installation ID/name, recipient, owner, source ID, alias, tenant and mutually exclusive publication/installation aspects; these are not re-implemented as identity-validation rules in OPA.

- A recipient's typed owner-constrained `install/create`, `install/read` and `install/delete` checks require the installation's `userId` and `access-control.ownerId` to match the caller. Owner-constrained `install/update` is not granted: rename requires uninstall then install. Deliberate unconstrained typed grants remain independently grantable.
- **Create/delete:** Agent Services authorises the *real caller* against the proposed/current complete installation record, then creates/deletes it using the internal administrator session. This also applies when converting an installation to the recipient's own publication (fork): check both typed operations first; an interrupted cross-record operation is recoverable, not atomically transactional.
- **Read:** Registry reads use the real caller's session. `object/record/read` on installation records delegates to `object/agentSkill/install/read`, allowing translatable partial-evaluation filtering. Agent Services separately checks typed read on each returned record, so merely holding a generic record grant does not make an installation visible through the skills application.
- **Source access:** Owning an installation does not grant access to the original published skill. Install, download, status and manifest resolution independently read and authorise the source as the real caller; revocation makes the source unavailable without preventing authorised uninstallation.
- The policy performs **authorization**, not cross-aspect or deterministic-identity validation. Agent Services rejects malformed records (including a record carrying both `agent-skill` and `agent-skill-installation`). Generic writes by ordinary typed-grant users are denied, while administrators and consciously trusted unconstrained generic grant holders retain their underlying storage privileges.

### Generic record rules: `object/record/*` (`object/record/allow.rego`)

| Record | Read | Create / update / delete |
| --- | --- | --- |
| Concrete `agent-skill` record | typed read rules (by actual `type`), **or** an unconstrained generic read grant | admins and unconstrained generic grants only |
| Concrete `agent-skill-installation` record | typed installation read rules, **or** an unconstrained generic read grant | admins and unconstrained generic grants only |
| Any other record | existing rules (generic, dataset, distribution, organisation) | existing rules |

Admins are covered by the entrypoint's global override, which happens before any of the above.

### Storage: `storage/object/*` (`storage/object/allow.rego`)

Always fully evaluated (the Storage API sends the concrete object and record).

- **Reads under the reserved prefixes** (`agent-services/skills/system-skills/`, `agent-services/skills/user-skills/`) never fall back to constrained (owner, OrgUnit, or legacy missing/empty-OrgUnit) Storage grants. Unconstrained Storage grants (deliberate, trusted) still apply. Otherwise, a non-admin read requires:
  - an existing object;
  - linked to an Agent Skill record (`recordId`), with an exact archive key match;
  - permission to read that record through the generic record rules above (typed read, or an unconstrained generic read).

  The identity check is removed. Agent Services validates the publication, and the downloaded ZIP's checksum, before exposing an archive.
- **Writes (upload/delete) under the reserved prefixes** are limited to Agent Services (as an admin), admins and unconstrained grants, the same as Agent Skill records:
  - Constrained (owner or OrgUnit) Storage permissions don't apply there. Unconstrained Storage permissions (trusted grants) apply to reads and writes, like unconstrained generic record grants.
  - An object there can only be linked to the Agent Skill record whose archive key it is. Otherwise a user could create an object at a reserved key by linking it to any record they can update (e.g. their own dataset).
  - A linked upload or delete requires the linked record's `object/record/create|update|delete` permission. For an Agent Skill record, only admins and unconstrained generic grants have it; typed Agent Skill grants alone don't. A trusted existence flag keeps create from replacing an existing archive, and only delete can remove one.

  So users can't replace their own archive (e.g. with an invalid skill package, then share it) except through Agent Services, which validates it. Archive integrity doesn't depend on every client re-checking it (although Agent Services and `mgd`/Workspace sync do check the checksum against the record).
- **Why Storage's object owner is the internal administrator:** Storage API automatically records the **authenticated caller's user ID** as `magda-owner-id` when creating an object. Agent Services performs validated archive writes under its short-lived internal administrator session, so Storage correctly and automatically records that internal principal as the object owner. This is intentional and does **not** transfer Agent Skill ownership away from the real publisher: `access-control.ownerId`, `createdBy` and `updatedBy` preserve the relevant real-user identities.
- **Why we do not add an owner-override upload parameter:** Letting an uploader nominate someone else's `magda-owner-id` would introduce an authorization question into the generic Storage API: who may assign ownership to another user, and under what permissions? Such an override could affect owner-constrained Storage access on unrelated objects. The Agent Skill model does not need it. Supported **write** authority is determined by domain-specific typed Agent Skill operations checked on the real caller by Agent Services, with service-owned writes; direct writes in the reserved namespace remain restricted to admins and deliberately trusted unconstrained grants. **Read** authority is determined by the trusted `magda-record-id` link and the publication's record-read permissions (except deliberately trusted unconstrained Storage grants), not by `magda-owner-id`. The link requires the exact archive key, and Agent Services checks ZIP checksum and identity before returning content. Recipient installations have **no independent ZIP/Storage object**; their source access is re-authorised against the original publication. Consequently, accepting the internal principal as Storage owner preserves Storage API's existing security semantics and avoids a new, unnecessary owner-spoofing surface.

## Sessions used by Agent Services

| Call | Session |
| --- | --- |
| Typed authorisation of the caller (OPA), including installation create/read/delete | caller |
| Registry reads for publication **and installation** list/read/manifest | caller |
| Privileged lookups (existing record or archive state before a write) | internal |
| Registry publication **and installation** create / update / delete | **internal** (after authorising the caller) |
| Storage archive **upload / replacement / delete** | **internal** (after authorising the caller) |
| Storage archive download | caller |

The internal session is a short-lived JWT for MAGDA's `DEFAULT_ADMIN_USER_ID`. It's confined to validated Agent Skill client calls and never returned, logged, stored or forwarded. `createdBy`, `updatedBy` and `access-control.ownerId` always record the real user. Registry events for skill writes, and archives' Storage owner, record the internal principal; Agent Services' audit log records the real caller.

## Use cases

**Who:**

- **Admin:** global administrator.
- **Unconstrained:** holds an unconstrained generic `object/record/<op>` grant.
- **Typed:** holds typed Agent Skill grants, e.g. the **Agent Workspace Users** (own user skills) or **Agent Skills Admins** (system skills) roles.
- **Others:** e.g. Data Stewards, or constrained generic grants.

| Use case | Admin | Unconstrained | Typed | Others |
| --- | --- | --- | --- | --- |
| Create/update/delete skills via Agent Services (`/v0/agent/skills`, `mgd`, UI) | ✓ | only with typed grants | ✓ (as granted) | ✗ |
| Read/list/download skills via Agent Services; Workspace manifest/sync | ✓ | only with typed grants | ✓ (typed read rules) | ✗ |
| Write Agent Skill records via the generic Registry API | ✓ | ✓ | **✗** (use Agent Services) | ✗ |
| Read Agent Skill records via the generic Registry API | ✓ | ✓ | ✓ (typed read rules) | ✗ |
| Bulk record updates that include skill records (#3870) | ✓ | ✓ | ✗ | ✗ |
| Bulk record updates of normal records (datasets etc.) | ✓ | ✓ | n/a | per existing rules, before and after the change |
| `trimBySourceTag` | ✓ | ✓ (unconstrained delete) | 403 | 403 |
| Delete a record, or one of its aspects, that doesn't exist | 200 | 200 (unconstrained delete / update) | 403 | 403 |
| Upload/delete a skill archive via Storage API | ✓ | ✓ (unconstrained generic record or Storage grants) | ✗ (use Agent Services) | ✗ |
| Read installations through Registry | ✓ | ✓ | ✓ (typed installation read) | ✗ |
| Write installation records through Registry | ✓ | ✓ | ✗ (use Agent Services) | ✗ |
| Install/uninstall through Agent Services | ✓ | only with typed grants | ✓ (typed install create/delete) | ✗ |

**Generic grants give access to skill records, not to the skills application.** Unconstrained-grant holders see and work with skill *records* through Registry and Storage, per their generic permissions. Agent Services, the skills application, requires the typed permission for every operation: create, update and delete, single reads and downloads, and the typed read on every listed record and every Workspace manifest source. A generic grant alone shows no skills there. "Unconstrained" users can still use Agent Services with typed grants, as anyone can.

## What this guarantees

- **No untranslatable residual rules.** A partial-evaluation audit (OPA 0.37.2, bundled policies) covered every partially evaluated operation: `object/record/*`, dataset and distribution reads, aspect/event/webhook operations. It used a user holding owner-, OrgUnit-, pre-authorised- and exemption-constrained permissions on every resource, including Agent Skill, and found **no built-in function calls in any residual**. For unconstrained-grant holders, `object/record/*` decisions are **unconditional true**. The only remaining built-in on object data is the reserved-prefix `startswith` in the Storage policy, which is always fully evaluated and is real authorisation. An integration test checks this in CI (#3879, for #3875).
- **Unconditional checks behave correctly.** `trimBySourceTag` and deleting a record (or its aspect) that doesn't exist work for admins and unconstrained-grant holders, and return 403 (never 500) to everyone else. Users without permission still can't tell whether a record exists. Since #3850, the Agent Skill guard had made unconstrained `object/record/delete` conditional, so in practice only admins could trim; that's fixed.
- **Service-owned invariants can't be bypassed by ordinary users.** Only Agent Services (plus trusted admins and unconstrained-grant holders) can write Agent Skill records. Its invariants therefore hold for every supported path:
  - immutable type, intended user, ID/name, creator, archive key and owner;
  - deterministic per-user IDs;
  - the naming rules.

  This replaces the Stage #3854 "accepted MVP integrity limitation".
- **Bulk updates authorise every record** before and after the change, with full evaluations, and are all-or-nothing (#3870).
- **Single-record updates** (record and aspect `PUT` / `PATCH` / `DELETE`) authorise the record's current state and its proposed state as written, within the mutation transaction, with the record locked; any denial rolls back (#3880).

## Trade-offs and follow-ups

- **Trusted writers can skip validation.** Admins and unconstrained-grant holders can write malformed skill records and archives. Agent Services re-validates identity before showing or syncing a skill, so the damage is limited to that one skill.
- **Registry event attribution** for skill writes, and archives' Storage owner, is the internal principal (see Sessions).
- Related follow-ups (all resolved; #3862 is closed):
  - #3872: single-record Registry writes authorised inside the mutation transaction, done in #3880;
  - #3873: `originalRecord` cross-version policies, closed as not needed for now. Policies can't compare the current and proposed state, so cross-version invariants stay with the owning service (e.g. Agent Services for skill identity);
  - #3874: a bulk request size limit (`bulkMutationMaxRecords`), done in #3878;
  - #3875: the CI check above, done in #3879.

## Sharing and installation lifecycle (draft #3864)

One source-scoped Access Group grants only the appropriate typed publication-read operation (`object/agentSkill/user/read` or `object/agentSkill/system/read`). Agent Services checks the real caller's typed source update permission, verifies group binding to that publication incarnation, and performs validated Access Group management with the internal session. Attaching its permission ID to the source publication also uses the internal Registry session after typed authorization. Installations reference the original publication; no ZIP is copied, and unsharing does not delete the recipient's installation record. The resolved source is separately authorised as the real caller for reads/downloads and manifests.

## Tests (#3870)

- **OPA:** 122 policy tests. The Agent Skill tests follow the use-case table:
  - typed grants can't write through `object/record/*`;
  - unconstrained generic grants apply to user and system skills for all operations;
  - constrained generic grants can't reach skill records;
  - identity isn't validated by the policy;
  - typed and unconstrained archive uploads.
- **Agent Services:** every Registry publication/installation create/put/delete and skill archive write uses the internal session, and every typed authorisation check uses the caller's session. Installation list/get/manifest use caller-scoped Registry reads and additional typed read decisions (draft #3864).
- **Integration (real OPA + authorization API + registry):**
  - the #3869 case (Data Stewards + Agent Workspace Users bulk-publishing their own dataset and distribution);
  - a typed-only user can't create a skill record through the Registry (403);
  - users with Agent Skill grants get 403, not 500, for the unconditional operations;
  - an unconstrained-grant holder can create and read another user's skill record, delete a missing record, and trim by source.

  All of the new ones fail with the previous policies.
