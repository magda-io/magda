# ADR 0012: Typed access group authorisation, with group records written only by the access group API

- **Status:** Accepted, implemented on `next` for MAGDA v8
- **Date:** 2026-11-09
- **Related:** [#3910](https://github.com/magda-io/magda/issues/3910), [#3914](https://github.com/magda-io/magda/issues/3914), [#3269](https://github.com/magda-io/magda/issues/3269) (the original access group design), [#3402](https://github.com/magda-io/magda/issues/3402), [ADR 0005](./0005-agent-skills-service-owned-authorization.md)

## Context

Access groups (#3269) grant their members access to a set of records. Each group is a Registry record whose
`access-group-details` aspect names the group's member role and the permission its datasets are granted. The
authorization API assigns that role when a member is added, so the group record's details drive role
assignment.

#3269 authorised groups with generic `object/record/*` permissions on the group record. In practice no built-in
role holds any, so only administrators could manage a group, even one they owned (#3910). Generic record
permissions also apply to direct Registry writes, which bypass the access group API's validation. Members could
read their group record, and the member list only needed that read, so any member could list every member and
their contact details (#3914).

## Decision

1. **Typed operations.** Access groups are authorised with `object/accessGroup/create`, `read`, `update` and
   `delete`, each honouring the usual ownership, org unit and pre-authorised constraints (create: ownership and
   org unit). `update` covers renaming, members, the member list and datasets; adding a dataset also needs
   `object/record/update` on the dataset.
2. **Group records follow the Registry feature model** ([Building Features on Registry Records](../architecture/Guide%20to%20Magda%20Internals.md#building-features-on-registry-records)).
   Registry reads of a record with `access-group-details` use the typed read rule. Writes of such records,
   checked on their current and proposed state, are limited to administrators and unconstrained grants,
   whatever the record's other aspects. The access group API authorises callers with the typed operations and
   writes the records with its internal session.
3. **Members** get a pre-authorised `object/accessGroup/read` on their group only. The member list needs
   `update`.
4. **A stock role**, "Access Group Managers" (unassigned), holds owner-constrained `object/accessGroup/*`, so a
   non-administrator can be allowed to create groups and manage the ones they own.
5. "Add a member" checks that the group's role holds the group's permission before assigning it.

## Consequences

- A non-administrator can manage their own groups without any generic record permission.
- **Breaking change for v8:** generic `object/record/*` grants on group records no longer authorise reading or
  managing a group. Grant the typed operations instead. A migration converts existing groups' member roles.
- Members can no longer list a group's members.
- Agent Skill share groups are managed only by Agent Services and unconstrained grants.
- The pattern matches Agent Skills (ADR 0005), so both features are explained the same way.

## Alternatives considered

- **Typed checks over generic record grants.** The API would check typed operations, but satisfy them with
  `object/record/*` grants on the group record, keeping #3269's model and existing grants. Rejected: one grant
  would count on one path and not another, and a stock manager role would still need owner-scoped generic record
  permissions over all the user's records.
- **A stock role with owner-constrained `object/record/*`.** Rejected: generic record permissions also authorise
  direct Registry writes of group records.
- **A creator pre-authorised permission (#3269).** Never implemented; ownership covers the creator case and
  follows a change of owner.
