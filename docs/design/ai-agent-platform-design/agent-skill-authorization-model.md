# Agent Skill authorization model

**Status: Revised 2026-10-23** (#3869, implemented in #3870). This document supersedes the parts of [skills-authorization-and-workspace-manifest.md](./skills-authorization-and-workspace-manifest.md) that describe OPA validating a publication's identity, typed write delegation at the generic `object/record` level, and the accepted "direct generic Registry mutation may bypass service-owned invariants" limitation. The rest of that document (typed resources, roles, read constraints, sharing, Workspace manifest and sync) is unchanged.

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
2. **Agent Services is the only non-admin writer of Agent Skill records.** For each create/update/delete, it authorises the **real caller** with the one typed operation (`object/agentSkill/<system|user>/<create|update|delete>`, a full evaluation of the actual or proposed record). Only then does it write the Registry record, with its internal session.
3. **Unconstrained generic grants are trusted.** An `object/record/<operation>` permission with no ownership, OrgUnit or pre-authorised constraint applies to **every** record, including Agent Skill records, for reads too. No built-in role has one, so it can only exist because an admin granted it on purpose. Such users operate on Agent Skill records **as generic records**. Agent Services' typed endpoints still require typed permissions.
4. **Constrained generic grants never reach typed publications.** A concrete `agent-skill` record never falls back to constrained generic `object/record` grants. Agent Skill installations stay reserved (fail closed) until #3861.

## Rules by layer

### Typed rules: `object/agentSkill/*` (`object/agentSkill/allow.rego`)

Only ever fully evaluated: Agent Services calls them with the concrete record and `unknowns: []`. They're also reached for reads through the generic dispatch below.

- **Type** comes from the record (`agent-skill.type` plus presence/absence of `userId`), never from the caller's URL.
- **Read:** owner, actually matching non-empty OrgUnit, exact group-specific pre-authorised permission ID, exemption, or unconstrained typed read. Unchanged.
- **Create a user skill:** owner-constrained typed create, self-targeted only (`userId == ownerId == caller`), with `createdBy`/`updatedBy == caller`.
- **Update/delete a user skill:** owner-constrained typed update/delete on the caller's own publication.
- **System skills, and broad user update/delete:** unconstrained typed grants (e.g. **Agent Skills Admins**). Create still requires matching attribution.
- **No identity validation.** A record whose ID doesn't match its type, user and name is not rejected by OPA. Agent Services rejects it.

### Generic record rules: `object/record/*` (`object/record/allow.rego`)

| Record | Read | Create / update / delete |
| --- | --- | --- |
| Concrete `agent-skill` record | typed read rules (by actual `type`), **or** an unconstrained generic read grant | admins and unconstrained generic grants only |
| `agent-skill-installation` record | unconstrained generic grants only (fail closed until #3861) | unconstrained generic grants only |
| Any other record | existing rules (generic, dataset, distribution, organisation) | existing rules |

Admins are covered by the entrypoint's global override, which happens before any of the above.

### Storage: `storage/object/*` (`storage/object/allow.rego`)

Always fully evaluated (the Storage API sends the concrete object and record).

- **Reads under the reserved prefixes** (`agent-services/skills/system-skills/`, `agent-services/skills/user-skills/`) never fall back to generic Storage grants. A non-admin read requires:
  - an existing object;
  - linked to an Agent Skill record (`recordId`), with an exact archive key and owner match;
  - permission to read that record through the generic record rules above (typed read, or an unconstrained generic read).

  The identity check is removed. Agent Services validates the publication, and the downloaded ZIP's checksum, before exposing an archive.
- **Linked uploads and deletes** require the linked record's `object/record/create|update|delete` permission. For an Agent Skill record, the caller's **typed** `object/agentSkill/<type>/create|update|delete` permission also applies.

  This is needed because Agent Services uploads a **new** archive with the caller's session. Storage API makes the uploader the owner of a new object, and the archive owner must match the record owner. A trusted existence flag keeps create from replacing an existing archive, and only delete can remove one.

## Sessions used by Agent Services

| Call | Session |
| --- | --- |
| Typed authorisation of the caller (OPA) | caller |
| Registry reads for list/read/download | caller |
| Privileged lookups (existing record or archive state before a write) | internal |
| Registry record **create / update / delete** (PENDING, READY, DELETING, delete) | **internal** (after authorising the caller) |
| Storage upload of a **new** archive; archive delete | caller (typed create/delete authority) |
| Storage upload replacing the archive when republishing (owner kept) | caller (typed update authority) |
| Storage upload completing an interrupted create, when the archive already exists (owner kept) | internal |

The internal session is a short-lived JWT for MAGDA's `DEFAULT_ADMIN_USER_ID`. It's confined to validated Agent Skill client calls and never returned, logged, stored or forwarded. `createdBy`, `updatedBy` and `access-control.ownerId` always record the real user. Registry events for skill writes record the internal principal; Agent Services' audit log records the real caller.

## Use cases

**Who:**

- **Admin:** global administrator.
- **Unconstrained:** holds an unconstrained generic `object/record/<op>` grant.
- **Typed:** holds typed Agent Skill grants, e.g. the **Agent Workspace Users** (own user skills) or **Agent Skills Admins** (system skills) roles.
- **Others:** e.g. Data Stewards, or constrained generic grants.

| Use case | Admin | Unconstrained | Typed | Others |
| --- | --- | --- | --- | --- |
| Create/update/delete skills via Agent Services (`/v0/agent/skills`, `mgd`, UI) | ✓ | only with typed grants | ✓ (as granted) | ✗ |
| Read/list/download skills via Agent Services | ✓ | listed (the catalogue uses Registry read filtering); single reads/downloads need typed read | ✓ (typed read rules) | ✗ |
| Write Agent Skill records via the generic Registry API | ✓ | ✓ | **✗** (use Agent Services) | ✗ |
| Read Agent Skill records via the generic Registry API | ✓ | ✓ | ✓ (typed read rules) | ✗ |
| Bulk record updates that include skill records (#3870) | ✓ | ✓ | ✗ | ✗ |
| Bulk record updates of normal records (datasets etc.) | ✓ | ✓ | n/a | per existing rules, before and after the change |
| `trimBySourceTag` | ✓ | ✓ (unconstrained delete) | 403 | 403 |
| Delete a record, or one of its aspects, that doesn't exist | 200 | 200 (unconstrained delete / update) | 403 | 403 |
| Upload/delete a linked skill archive via Storage API | ✓ | ✓ | ✓ (typed create/update/delete) | ✗ |
| `agent-skill-installation` records (until #3861) | ✓ | ✓ | ✗ | ✗ |

"Unconstrained" users can still use Agent Services with typed grants, as anyone can. A generic grant alone only lets them work with skill records as generic records.

## What this guarantees

- **No untranslatable residual rules.** A partial-evaluation audit (OPA 0.37.2, bundled policies) covered every partially evaluated operation: `object/record/*`, dataset and distribution reads, aspect/event/webhook operations. It used a user holding owner-, OrgUnit-, pre-authorised- and exemption-constrained permissions on every resource, including Agent Skill, and found **no built-in function calls in any residual**. For unconstrained-grant holders, `object/record/*` decisions are **unconditional true**. The only remaining built-in on object data is the reserved-prefix `startswith` in the Storage policy, which is always fully evaluated and is real authorisation. #3875 tracks a CI check for this.
- **Unconditional checks behave correctly.** `trimBySourceTag` and deleting a record (or its aspect) that doesn't exist work for admins and unconstrained-grant holders, and return 403 (never 500) to everyone else. Users without permission still can't tell whether a record exists. Since #3850, the Agent Skill guard had made unconstrained `object/record/delete` conditional, so in practice only admins could trim; that's fixed.
- **Service-owned invariants can't be bypassed by ordinary users.** Only Agent Services (plus trusted admins and unconstrained-grant holders) can write Agent Skill records. Its invariants therefore hold for every supported path:
  - immutable type, intended user, ID/name, creator, archive key and owner;
  - deterministic per-user IDs;
  - the naming rules.

  This replaces the Stage #3854 "accepted MVP integrity limitation".
- **Bulk updates authorise every record** before and after the change, with full evaluations, and are all-or-nothing (#3870).

## Trade-offs and follow-ups

- **Trusted writers can skip validation.** Admins and unconstrained-grant holders can write malformed skill records. Agent Services re-validates identity before showing or syncing a skill, so the damage is limited to that one skill.
- **Registry event attribution** for skill writes is the internal principal (see Sessions).
- **Agent Services listing vs single reads:** unconstrained-grant holders see skills in Agent Services listings (Registry-filtered), but single reads and downloads there need typed read. Unify if it matters.
- Related follow-ups:
  - #3872: single-record Registry writes authorised inside the mutation transaction;
  - #3873: `originalRecord` cross-version policies;
  - #3874: a bulk request size limit;
  - #3875: the CI check above.

## Tests (#3870)

- **OPA:** 122 policy tests. The Agent Skill tests follow the use-case table:
  - typed grants can't write through `object/record/*`;
  - unconstrained generic grants apply to user and system skills for all operations;
  - constrained generic grants can't reach skill records;
  - identity isn't validated by the policy;
  - typed and unconstrained archive uploads.
- **Agent Services:** every Registry create/put/delete uses the internal session, and every authorisation check uses the caller's session.
- **Integration (real OPA + authorization API + registry):**
  - the #3869 case (Data Stewards + Agent Workspace Users bulk-publishing their own dataset and distribution);
  - a typed-only user can't create a skill record through the Registry (403);
  - users with Agent Skill grants get 403, not 500, for the unconditional operations;
  - an unconstrained-grant holder can create and read another user's skill record, delete a missing record, and trim by source.

  All of the new ones fail with the previous policies.
