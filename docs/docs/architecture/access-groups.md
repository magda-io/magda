# Access groups

**Applies to:** `next`, for MAGDA v8 ([#3910](https://github.com/magda-io/magda/issues/3910),
[#3914](https://github.com/magda-io/magda/issues/3914)). The decision and its alternatives are in
[ADR 0012](../adrs/0012-typed-access-group-authorisation.md). How to use access groups:
[the access groups guide](../access-groups.md).

An access group grants its members access to a set of Registry records, typically datasets and their
distributions, across org units. It's managed through the authorization API's
`/v0/auth/accessGroups` endpoints and the Settings → Access Groups UI.

## Parts of a group

| Part                     | What it is                                                                                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Group record             | A Registry record with an `access-group-details` aspect (name, description, keywords, `resourceUri`, `operationUris`, `permissionId`, `roleId`, `extraControlPermissionIds`, audit fields) and an `access-control` aspect (`ownerId`, `orgUnitId`, `preAuthorisedPermissionIds`). |
| Group permission         | A pre-authorised permission on `resourceUri` with the group's `operationUris`. Its ID is added to the `access-control.preAuthorisedPermissionIds` of every record in the group.                                                                                                   |
| Member role              | An auto-created role holding the group permission and, for record groups, the members' read permission. Adding a member assigns this role.                                                                                                                                        |
| Members' read permission | A pre-authorised `object/accessGroup/read`, listed in the group record's `preAuthorisedPermissionIds` and `extraControlPermissionIds`, so members can read their own group record. Holding it also shows the access group UI.                                                     |

## Authorisation

| Action                                        | API                                                                  | Operation needed                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create a group                                | `POST /v0/auth/accessGroups`                                         | `object/accessGroup/create`, decided on the validated group (input `object.accessGroup`, with `ownerId` defaulted to the caller). With an ownership constraint its `ownerId` must be the user; with an org unit constraint its `orgUnitId` must be one the user manages. Constrained grants create only `object/record` groups without Agent Skill share keywords. |
| Read a group                                  | Registry `GET /v0/registry/records/:groupId`                         | `object/accessGroup/read` on the group record                                                                                                                                                                                                                                                                                                                      |
| Rename it, change its description or keywords | `PUT /v0/auth/accessGroups/:groupId`                                 | `object/accessGroup/update`. Adding operations to `operationUris` (widening what the group grants) or setting an Agent Skill share keyword (`agent-skill-share-…`) needs an unconstrained `object/accessGroup/update`.                                                                                                                                             |
| Change its owner or org unit                  | `PUT /v0/auth/accessGroups/:groupId`                                 | `object/accessGroup/update` on the group both as it is and as it would be afterwards, so an owner-scoped grant can't give a group away and an org unit grant can only move it between units the caller manages. The group permission's owner follows the group's.                                                                                                  |
| Add or remove a member                        | `POST` / `DELETE /v0/auth/accessGroups/:groupId/users/:userId`       | `object/accessGroup/update`                                                                                                                                                                                                                                                                                                                                        |
| List members, count members                   | `GET /v0/auth/accessGroups/:groupId/users[/count]`                   | `object/accessGroup/update`                                                                                                                                                                                                                                                                                                                                        |
| Add or remove a dataset                       | `POST` / `DELETE /v0/auth/accessGroups/:groupId/datasets/:datasetId` | `object/accessGroup/update`, and `object/record/update` on the dataset **and on each distribution it lists**                                                                                                                                                                                                                                                       |
| Delete a group                                | `DELETE /v0/auth/accessGroups/:groupId`                              | `object/accessGroup/delete`                                                                                                                                                                                                                                                                                                                                        |

Read, update and delete honour the usual constraints, decided against the group record (OPA input
`object.accessGroup`):

- **ownership:** the group's `ownerId` is the user;
- **org unit:** the group's `orgUnitId` is one the user manages. A group without an org unit isn't covered by an
  org unit grant;
- **pre-authorised:** the group record lists the permission's ID;
- **unconstrained:** any group.

Administrators have every operation. Generic `object/record/*` permissions don't authorise anything on group
records except as unconstrained grants.

The rules are in `magda-opa/policies/object/accessGroup/allow.rego`.

## Group records are written only by the access group API

The group record's details drive role assignment: they name the role that adding a member assigns, and the
permission its datasets are granted. So group records follow the
[Registry feature model](./Guide%20to%20Magda%20Internals.md#building-features-on-registry-records):

- `object/record/allow.rego` routes Registry reads of any record with `access-group-details` to the typed read
  rule, which uses only translatable comparisons, so Registry and search can filter with partial evaluation.
- Writes of such records are limited to administrators and unconstrained generic grants, whatever the record's
  other aspects, checked on its current and proposed state.
- The access group API authorises callers with the typed operations and writes the records with its internal
  session.
- Before adding or removing a member, or deleting the group, it checks the group's role and permissions are its own: the role was created for the group and holds its pre-authorised group permission, and (on delete) its control permissions were created for the group.
- Before writing the group's permission to the records a dataset lists as its distributions, it checks the caller can update each of them.
- A record with an `access-group-details` aspect is read through the typed group rules only, whatever other aspects it has.

## Agent Skill share groups

Agent Services creates a share group (`resourceUri` `object/agentSkill/user` or `object/agentSkill/system`) for
each shared skill and manages its members with its internal session. Share groups have no owner and no members'
read permission. Constrained grants never update or delete them, so only Agent Services and unconstrained grants
manage them. See [Agent Skills authorization and sharing](./agent-skills-authorization.md).

## The stock role

**Access Group Managers** (`00000000-3854-4200-8000-000000000003`, unassigned) holds one owner-constrained
permission with `object/accessGroup/create`, `read`, `update` and `delete`. Its holders can create groups and
manage the groups they own. To add their own datasets to a group they also need `object/record/update` on those
datasets, which data stewards have for the datasets they own.

## Upgrading from v7

The authorization database migration `V2_5`:

- converts each existing record group's member role (its pre-authorised `object/record/read` on the group
  record becomes a pre-authorised `object/accessGroup/read`, keeping its ID);
- removes the member role's unconstrained `object/accessGroup/read`;
- registers `object/accessGroup/update` and `delete`;
- adds the stock role.

Any custom grant of `object/record/*` meant to let someone manage a group must be replaced by the typed
operations.
