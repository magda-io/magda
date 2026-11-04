# Agent Skills authorization and sharing

**Status:** Implemented on `next` by [MVP #3850](https://github.com/magda-io/magda/pull/3850), [Registry hardening #3870](https://github.com/magda-io/magda/pull/3870)/[#3880](https://github.com/magda-io/magda/pull/3880), and [sharing #3864](https://github.com/magda-io/magda/pull/3864). This is the maintained reference for typed authorization boundaries, not a user-facing permissions tutorial.

## Four distinct authorities

1. **Published skill**: an immutable-identity Registry record with `agent-skill` and `access-control`, plus a validated ZIP linked via Storage API `magda-record-id`.
2. **Source-read permission**: typed `object/agentSkill/system/read` or `object/agentSkill/user/read`, derived from the actual publication record and grants; source-specific Access Groups may grant read.
3. **Recipient installation**: a recipient-owned `agent-skill-installation` Registry record, pointing to the original source and an optional alias, with its own typed `object/agentSkill/install/*` checks. Installation does not copy the source ZIP or grant source read.
4. **Dataset/model resources**: independently authorised MAGDA datasets and distributions; a readable/installed skill never transfers the publisher's data permissions.

Workspace lifecycle uses the separate self-only `agentWorkspace/access` operation. Possessing a Skill grant does not grant Workspace access, and vice versa.

## Enforcement by layer

| Layer | Responsibility | Authority |
| --- | --- | --- |
| Agent Services | Validate names, deterministic identities, type, owner, tenant/source linkage, archive format/checksum and lifecycle; check *one requested typed operation* on the real caller | Real caller for policy decisions; short-lived internal administrator session only for validated writes |
| OPA / Authorization API | Decide typed publication `{system,user}/{create,read,update,delete}` and installation `install/{create,read,delete}`; use translatable record-read filters | Caller for decisions; no name/identity validation in policy |
| Registry | Store source and installation records; evaluate current and proposed mutation states in transaction | Caller for reads; Agent Services internal identity for lifecycle writes |
| Storage API | Store source-owned validated ZIP in reserved prefixes, linked to the exact publication | Source-record read policy or trusted unconstrained Storage grant; protected writes only |
| Workspace manifest / `mgd` | Independently resolve desired system, own-user and **explicitly installed** shared skills | Current authenticated user, including source-read re-check |

Normal user publication create requires `userId = ownerId = actor` and the appropriate typed permission. System publications require their distinct typed grant. Names and immutable IDs are checked in Agent Services, **not** by inspecting user-supplied path components in OPA. Do not allow user-to-system type changes or silently rewrite a source publication into an installation.

A generic `object/record` read of a typed skill/installation is dispatched to typed reads. **Constrained** generic record or Storage grants cannot bypass the typed boundary. Administrators and deliberately granted **unconstrained** generic record/Storage permissions are a *trusted exception*, able to manipulate underlying objects but not automatically use Agent Services typed application endpoints. Do not describe this as protection against trusted administrators.

## Sharing and installation lifecycle

- The source publisher with typed update authority may attach a source-scoped Access Group granting only the corresponding publication **read** operation. The group is bound to one publication incarnation; it does not grant installation, source write, group-control or dataset privileges.
- The recipient must independently hold `install/create`, have readable access to the source, and **explicitly install** it. Merely seeing it in **Shared Skills / All available** does not add it to the manifest.
- Installations are owner/recipient-scoped; their names/aliases are unique within the recipient's projection. Alias rename is uninstall + reinstall, not `install/update`.
- Each manifest resolution rechecks source state and typed source-read under the recipient session. Revocation/deletion may leave recipient installation metadata visible for safe uninstall, while the source becomes unavailable for new sync.
- Clean synchronized copies are removed at a subsequent successful reconciliation. Offline or edited copies are not promised to vanish instantly.
- Recipient fork is an **explicit user-owned publication** using the recipient's typed create and installation delete authority. It never mutates the source ZIP, publisher ownership or grants; cross-record steps are recoverable rather than one atomic Registry transaction.

The source-scoped Access Group updates currently rely on process-local locking for the supported single Agent Manager replica. Expanding the Manager horizontally requires a distributed/transactional compare-and-swap strategy.

## Integrity, transactions and failure paths

The complete source archive must match its stored digest and approved record identity before download or harness extraction. Supported mutation routes check current and proposed authorization in the Registry transaction; bulk operations are batched and all-or-nothing (#3870), single-record updates lock and check the as-written state (#3880), and #3878 limits bulk size. These checks do not transform OPA into a general domain-schema validator.

The installation/source read checks fail closed; Registry/OPA/Storage outages must not produce a false authoritative empty manifest. The Workspace itself can be READY when optional skill sync is degraded. Do not download a stale cached ZIP in place of an unavailable current publication.

## Verification and references

Use [Agent Skills architecture](./agent-skills.md) for API, record shape and CLI behaviour; [sync](./agent-skills-sync.md) for local projections and conflicts; [Workspace security](./agent-workspace-security.md) for delegated credentials. The [sharing E2E case](../e2e-test-cases/agent-skills-sharing.md) exercises positive/negative access without borrowing the source owner's identity.

For why the split was chosen, see [ADR 0005](../adrs/0005-agent-skills-service-owned-authorization.md) and [ADR 0007](../adrs/0007-agent-skill-sharing-and-recipient-installations.md).