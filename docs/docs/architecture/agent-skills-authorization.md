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

## Sharing and installed shared skills (#3861)

Sharing permits access; installing is a separate, explicit act. A published
user skill stays private to its owner until shared. A recipient who can read
it sees it under **Shared Skills / All available** and in
`mgd agent-skill list --shared`, but nothing is synchronized until they
install it. The publisher's record and ZIP stay authoritative and are never
copied, transferred or modified by sharing, installing, uninstalling or
forking.

### Records and typed authorization

| Record                 | Aspects                                                                                           | ID and ownership                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Published user skill   | `agent-skill` (`type=user`, `userId`), `access-control`                                           | `agent-skill-<publisher>-<name>`, one ZIP                                  |
| Recipient installation | `agent-skill-installation {userId, sourceSkillId, alias?, createdAt}`, `access-control {ownerId}` | `agent-skill-<recipient>-<effective name>`, owned by the recipient, no ZIP |

The effective name is the alias, or the source name (an alias equal to the
source name is not stored). Installations share the recipient's namespace with
their own publications, so Registry's atomic create rejects any collision; the
API answers `409 AGENT_SKILL_NAME_CONFLICT` with `details.conflict`
(`publication` or `installation`) and a free `suggestedAlias`. Names follow
the publication rules (46 characters, no `system-` prefix, no runtime-bundled
names). Identity, recipient, source and alias are immutable: there is no
update API, OPA never grants an owner `install/update`, and renaming means
uninstall then install.

Installations follow the same model as publications (see [Building Features on Registry Records](<./Guide to Magda Internals.md#building-features-on-registry-records>)).
Agent Services authorizes the real caller with the typed
`object/agentSkill/install/{create,delete}` decision on the complete record,
then writes the installation with its internal session. Reads are made as the
real caller: `object/record/read` of a record carrying
`agent-skill-installation` dispatches to the typed
`object/agentSkill/install/read`, so Registry filters installations with
partial evaluation, and Agent Services also checks the typed read on every
record it returns, so generic record permissions alone never show
installations there. The typed rules only authorize, with literal
comparisons: the caller must be both the installation's `userId` and its
`access-control.ownerId` (owners can read and delete their own records,
including malformed ones). Agent Services validates the deterministic identity
(record ID, names, alias, an other-user source, and never both a publication
and an installation) before every write and for every record it returns. Generic writes on installation records are limited
to admins and unconstrained `object/record` grants, so a direct Registry
client can neither create an installation nor gain source access through
one. Constrained generic grants never apply to installation records.

### Source-scoped sharing grants

Sharing reuses Access Groups. Each publication incarnation gets at most one
system-managed group whose `resourceUri` is `object/agentSkill/user` (or
`system`), whose single operation is the matching `read`, and which has no
owner, OrgUnit or control permissions. Its group-specific pre-authorised
permission ID is attached to that publication's
`access-control.preAuthorisedPermissionIds`, and recipients are members of its
role. The existing typed pre-authorised rule then grants exactly that source
read: never `object/record/read`, never another skill, and never an
installation. The stock "Read Pre-authorised … Agent Skills" permissions are
role-wide and grant nothing on their own.

| Endpoint (`/api/v0/agent/skills/...`)           | Purpose                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `GET :type/:id/access`                          | Public skill, OrgUnit (system only) and recipient count             |
| `PUT :type/:id/access`                          | System only: `{public?, orgUnitId? \| null}`                        |
| `GET :type/:id/access/users`                    | Recipients (`offset`, `limit`, `keyword`): only ID and display name |
| `PUT` / `DELETE :type/:id/access/users/:userId` | Add (idempotent) / remove one recipient by MAGDA user ID            |

Every request first authorizes the real caller for the typed `update` of the
actual source (`404` otherwise, so recipients cannot manage grants). Agent
Services then uses its internal session against the Access Group API and,
after re-authorizing the caller's typed `update` inside the record lock, for
writing the source record (generic writes on Agent Skill records are limited to
Agent Services, admins and unconstrained grants). The group is bound by an opaque keyword derived from the
record ID and its immutable `createdAt`; a skill deleted and published again
never inherits earlier recipients, and deleting a publication removes its
group. Before any change the binding is verified (keyword, resource, single
read operation, attached to this source and to no other publication). The
permission is attached before members are added, so an interrupted first share
leaves an empty, unattached group that the next attempt reuses. Revocation
removes only membership. Recipient lists are bounded to 500 per skill: adding a
new recipient to a skill that already has 500 returns `409 AGENT_SKILL_SHARE_LIMIT_REACHED` (re-adding an existing recipient stays
idempotent), so no authorized recipient is ever missing from the listing.

Sharing, installation and fork changes are serialized by the same
process-local per-record lock as publication changes. This relies on the single
Agent Manager replica (the chart refuses `manager.replicas` other than 1).
With several replicas, two concurrent first shares of one publication could
each create a share group, recipient additions could exceed the 500 bound, and
concurrent access edits could overwrite each other's `access-control` change.
Horizontal scaling must first move these mutations to a distributed lock or
Registry conditional writes, together with the publication compare-and-swap
above.

System skills keep **Public skill** (`constraintExemption`, default on) and
one validated OrgUnit, plus the same selected-users group. Paths are additive:
toggling Public never discards the OrgUnit or recipients, and the proposed
audience is itself authorized as a typed update. User skills cannot be made
public or OrgUnit-scoped in this version.

### Installation API

| Endpoint (`/api/v0/agent/skills/installations...`) | Purpose                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /`                                            | The caller's installations (keyset pages) with source status     |
| `POST /` `{sourceSkillId, alias?}`                 | Install (`201`; an identical repeat returns `200`)               |
| `GET /:id`, `DELETE /:id`                          | Status; uninstall (only the caller's own record)                 |
| `POST /:id/publish` (ZIP)                          | Fork an installed copy into the caller's own publication (below) |

The recipient is always the authenticated caller; any other body field is
rejected. Install reads the source with the caller's session, requires it to
be a READY user skill of another user in this tenant, re-checks its typed
read (`404 AGENT_SKILL_SOURCE_NOT_FOUND` for missing and unreadable alike,
`409 AGENT_SKILL_SOURCE_PENDING` while it is being replaced) and requires the
caller's own `install/create`. Status reports a source as `available` (with
metadata), `pending` or `unavailable`; publisher details are returned only
while the caller can read the source. A revoked, deleted or invalid source
leaves the installation listed and uninstallable.

### Manifests, revocation and outages

Both manifests stay `version: 1`. The installation source pages through the
caller's installation records independently, reads each source as the real
caller, and returns an item with `sourceKind: "installation"`,
`selectionId` = the installation ID, `source` = the original publication
(including its checksum) and `installation {id, userId, sourceSkillId, alias?}`. Clients built before #3861 reject such items and so fail closed,
without local changes, only for users who installed shared skills.

| Situation                                                                                     | Manifest                     | Sync                                                                                                      |
| --------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source readable and READY                                                                     | item                         | install / update                                                                                          |
| Source deleted, `DELETING`, unreadable (revoked), malformed, not another user's, other tenant | `unavailableInstallations[]` | **authoritative**: clean copies removed; partial with `INSTALLATION_SOURCE_UNAVAILABLE` until uninstalled |
| Source `PENDING` (publisher replacing it)                                                     | warning `SOURCE_PENDING`     | abort before any change, even with `--force`                                                              |
| Malformed own installation record                                                             | warning `INVALID_RECORD`     | abort; uninstall it                                                                                       |
| Registry, OPA or installation-list failure                                                    | request fails                | abort before any change, even with `--force`                                                              |
| Required ZIP download or checksum/validation failure                                          | —                            | abort before any change, even with `--force`                                                              |

A definitive unavailability is therefore not a generic warning: it lets a
successful sync remove clean managed copies while edited copies remain
conflicts until `--force`. Revoked and deleted sources are deliberately not
distinguished.

### Projection into harnesses and Workspaces

The same scan engine projects installations into local harness roots and the
Workspace DSH root as independent real copies. The root marker records the
recipient's verified `sourceKey`, the original publication (`kind: "installation"`), `installationRecordId`, `alias`, the publisher's archive
checksum and the installed tree digest; never credentials. With an alias, only
the frontmatter `name:` line of the local `SKILL.md` is rewritten after the
publisher's exact ZIP was verified, the result is re-validated, and the
baseline digest is that of the renamed tree. The verified cache keeps the
publisher's exact bytes, keyed per installation in the snapshot. Missing copies
are reinstalled, exact markerless copies adopted, clean copies updated or
removed, and edited copies conflict exactly as for own publications. Installing,
uninstalling, sharing or revoking never synchronizes anything by itself: a
Workspace reconciles at its next Manager sync (new Workspace, recovery or the
confirmed Retry / Re-check), and a computer at its next `mgd agent-skill sync`.

**Accepted limitation:** revocation stops future authorized access and
download. Copies already on a computer, including locally edited or manually
copied files, cannot be erased remotely at that moment; managed clean copies
are removed by the next successful authoritative sync, and edited copies only
with `--force`. This is not instant remote code revocation.

### Forking an installed shared copy

Plain `mgd agent-skill publish <installed-shared-copy>` refuses
(`SHARED_INSTALLATION_FORK_REQUIRED`) and explains that `--force` publishes the
copy as the recipient's **own** user skill named like the installation, in
place of the installation; the original publisher's skill never changes.
`publish --force` is that explicit consent. `mgd` authenticates the recipient
account recorded in the marker (never another active profile), refuses a
renamed copy, and calls `POST /installations/:id/publish`. Agent Services
validates the ZIP, checks the caller's `user/create` for the proposed
publication and `install/delete` for the installation before changing
anything, removes the installation (with its internal session), and creates the publication
under the same in-process record lock. Registry has no multi-record
transaction: if creation fails after the installation was removed, the API
returns `AGENT_SKILL_FORK_INCOMPLETE` (retryable), `mgd` keeps the edited files
and marker unchanged, and rerunning the command completes an ordinary own
create of the same deterministic ID. On success `mgd` caches the exact accepted
ZIP, replaces only the installation's snapshot entry, and rebinds only the
originating copy's marker; other harness copies update at their next sync. In
a Workspace the `magda_agent_skill_publish` tool requires
`forkSharedInstallation: true` and asks one dedicated question.
