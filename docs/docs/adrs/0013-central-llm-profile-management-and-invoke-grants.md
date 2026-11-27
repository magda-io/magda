# ADR 0013: Central LLM profile management with audience and role-based invoke grants

- **Status:** Accepted; implemented in the #3937 PoC on the v8 development line, not a production-qualification statement.
- **Related:** [#3838](https://github.com/magda-io/magda/issues/3838), [#3937](https://github.com/magda-io/magda/issues/3937), [#3950](https://github.com/magda-io/magda/issues/3950); requirements AUTH-3/5/6/7/8.
- **Amends:** the LLM invocation paragraph and future-profile consequence of [ADR 0004](./0004-delegated-workspace-credentials-and-llm-isolation.md). Workspace identity delegation and private provider-credential isolation are unchanged.

## Context

LLM model access is a central spending decision, not ownership of catalogue content. Reusing owner/org-unit-scoped management would let delegated editors widen model access and limits. Conversely, a central manager must be able to distribute narrowly bounded invoke rights without gaining general role administration.

MAGDA's usual org-unit constraint describes management scope (a manager reaches objects below them). Applying that direction to an audience profile on Finance would expose it to users above Finance while failing to include Finance's descendants—the reverse of the intended team budget.

## Decision

1. **Central management (AUTH-3).** Profile create/read/update/delete accepts only unconstrained permissions and the administrator override. Profiles have no owner; Public and org-unit fields affect invoke, never management. Every permitted manager may manage every profile.
2. **Audience direction for invoke (AUTH-5).** A profile's org unit must be the caller's own unit or an ancestor. Thus a profile on X is available to users in X's subtree who have the org-unit invoke grant, not to users above X or in sibling units. No org unit means no audience match. This is deliberately resource-specific, not a change to global management semantics.
3. **Public is an exemption match (AUTH-6).** `constraint_exemption=true` matches an invoke permission with `allowExemption=true`. The administrator controls which roles hold such a grant. Public is neither anonymous access nor a default grant to every signed-in account.
4. **One managed permission per profile (AUTH-7).** LLM Services creates exactly one pre-authorised `llm/access/invoke` permission, with `allowExemption=false`, and stores its UUID as `use_permission_id`. Managers attach/detach only that permission to existing roles after an unconstrained profile-update decision. Users join those roles through normal user administration; there is no managed role per profile, custom permission editor or direct-user grant.
5. **Broad signed-in audience is explicit (AUTH-8).** Authenticated Users is intentionally a valid target: attaching it means everyone signed in can invoke this profile, within its limits. Anonymous Users and Admin Users are excluded. The stock migration does not attach a profile to Authenticated Users. Profile managers receive no general `authObject/role/update` authority.

Invocation is separate from `agentWorkspace/access`. The unassigned Agent Workspace Users stock role gains an audience/exemption-capable invoke permission; the user still needs a covering profile. Unconstrained invoke selects all enabled covering profiles but retains quotas. Administrators bypass profiles and quotas, not the deployment allowlist, and remain metered.

## Consequences

- Budget managers are trusted central editors. They can deliberately broaden a profile to all signed-in users without acquiring unrelated role privileges.
- Audience hierarchy is easy to reason about but differs from ordinary MAGDA management scope; documentation and policy tests must preserve that distinction.
- Public and role grants are alternative paths; removing one may leave another effective grant. Neither the role grid nor the Public switch is a list of all effective users.
- Managed permission identity is by UUID and verified shape, never name. Removing a role may delete a permission held only there; the next profile-role attachment recreates it with the same ID. There is no background reconciler.
- SQL/profile and Auth API changes are not one distributed transaction. Compensation and row locking reduce lifecycle races but do not guarantee that an error means nothing changed.
- Access is still subject to enabled state, model coverage, deployment allowlist and soft quota admission. A role attachment is not an unlimited provider credential.

## Alternatives considered

- **Owner/org-unit-scoped profile editors:** rejected because they delegate changes to a central budget.
- **Management-direction or bidirectional org-unit invoke:** rejected because parent-unit users would gain child-team budgets.
- **Three managed Use/View/Edit roles per profile or direct-user assignment:** rejected as unnecessary role lifecycle and duplicate user-membership administration.
- **Grant managers general role-update permission:** rejected because it can create unrelated privileged permissions inside roles.
- **Make Public or Authenticated Users automatic:** rejected; broad access must be an explicit, reviewable choice.

## Implementation references

See the [current architecture](../architecture/llm-services.md), [LLM policy](../../../magda-opa/policies/llm/access/allow.rego), [profile lifecycle](../../../magda-llm-services/src/profiles/ProfileService.ts) and [Authorization DB migration](../../../magda-migrator-authorization-db/sql/V2_6__llm_access_profiles.sql). Qualification results must be recorded separately; this ADR does not assert that acceptance tests were run.
