# LLM access profiles and soft usage limits

- **Status:** implemented PoC for [#3838](https://github.com/magda-io/magda/issues/3838) on the **unreleased v8 development line**, tracked in [#3937](https://github.com/magda-io/magda/issues/3937). This living design includes the reconciliation changes under review in [PR #3973](https://github.com/magda-io/magda/pull/3973); it is **not a production-readiness or completed-qualification claim**. [#3950](https://github.com/magda-io/magda/issues/3950) tracks qualification separately. The screens are in the [Settings UI design](./llm-access-profiles-ui.md). Keep design PR #3932 open during review.
- **Evidence:** the [LiteLLM/DSH metering PoC #3934](https://github.com/magda-io/magda/issues/3934) ([draft PR #3936](https://github.com/magda-io/magda/pull/3936)) provides **dated** evidence for one provider route ([PoC evidence](#poc-evidence-and-limits)). Its old LiteLLM version and test counts are not current full-feature qualification.
- **Owner:** MAGDA LLM Services. Neither the Registry nor LiteLLM manages profiles or usage.
- **Related:**
  - [LLM Services architecture](../../docs/architecture/llm-services.md);
  - [constraint semantics](https://github.com/magda-io/magda/blob/next/docs/docs/architecture/Guide%20to%20Magda%20Internals.md#what-permission-constraints-are-for) and [constraint exemption](https://github.com/magda-io/magda/blob/next/docs/docs/architecture/Guide%20to%20Magda%20Internals.md#constraint-exemption);
  - [ADR 0012](../../docs/adrs/0012-typed-access-group-authorisation.md).

Requirements are numbered (e.g. **AUTH-3**) so tickets, PRs and tests can cite them. Everything else is explanation.

## Overview

An **access profile** says which public model aliases may be used, by whom, and with which per-user token limits. Profiles are a central resource. A few trusted **LLM profile managers** create them and decide which roles get them. User administrators decide who is in those roles.

```text
Authenticated MAGDA client (browser, API key, Workspace/DSH)
 -> MAGDA Gateway (/api/v0/llm -> llm-services /v0)
 -> MAGDA LLM Services
      - authorises profile management and model invocation through the Auth API decision endpoint
      - stores profiles and the daily usage ledger in its own database
      - applies the deployment model allowlist and per-user, per-model soft limits
      - forwards OpenAI-compatible requests to private LiteLLM and meters usage without changing the stream
 -> private LiteLLM -> configured model provider

Authorization API: llm/access and llm/usage resources and operations, stock roles and permissions,
    each profile's one invoke permission, roles and user-role assignments
LLM Services database: profiles, and one usage row per (user, public model alias, local day)
```

Compared with the earlier Workspace-only access gate, LLM invocation no longer depends on `agentWorkspace/access`. The Workspace itself still requires that permission. Independent LLM clients need only an invoke grant (**AUTH-4**). Provider Secrets stay private to LiteLLM.

### Non-goals

- billing-grade accounting, reservations or a guaranteed hard cut-off;
- dollar amounts;
- a LiteLLM database, Redis, virtual keys or LiteLLM budgets;
- a model or provider catalogue, or credential management in the UI;
- direct user grants on a profile;
- delegated (owner or org unit scoped) profile management.

## Authorization

### Resources and operations

- **AUTH-1** Seed two resources and their operations in the Authorization DB:

  | Resource | Operations |
  | --- | --- |
  | `llm/access` | `llm/access/create`, `llm/access/read`, `llm/access/update`, `llm/access/delete`, `llm/access/invoke` |
  | `llm/usage` | `llm/usage/read` |

  There are no per-profile resources or operations. A decision about a profile uses the shared operation, plus the profile's attributes as OPA input.
- **AUTH-2** The entrypoint policy delegates `llm/access/` to `data.llm.access.allow` and `llm/usage/` to `data.llm.usage.allow`. The MAGDA administrator override applies as usual.

### Profile management is central

- **AUTH-3** `llm/access/create`, `read`, `update` and `delete` are allowed only for **unconstrained** permissions (and administrators). Owner, org unit, pre-authorised and exemption permissions never grant them.

  Constrained permissions exist to delegate management: owners manage their own resources, and an org unit manages its own. LLM access is a central budget, managed by central, trusted users. So there are no scoped editors, no before/after update decisions and no "widening change" rules. Every manager may change every field.

### Invocation grants

- **AUTH-4** `llm/access/invoke` on a profile is allowed when `input.user.id` is a non-empty string and the caller holds one of:

  | # | Grant | Matches profiles where |
  | --- | --- | --- |
  | 1 | Unconstrained invoke | any profile |
  | 2 | Org unit constrained invoke (**audience**, AUTH-5) | `org_unit_id` is the caller's org unit or one of its ancestors |
  | 3 | Pre-authorised invoke | `use_permission_id` equals the ID of that same permission |
  | 4 | Any invoke permission with `allowExemption=true` | `constraint_exemption` is true (a **public** profile, AUTH-6) |

  Owner-constrained and combined owner + org unit constraints provide no ownership-based match: profiles have no owner. Such an invoke permission can still match a Public profile through grant 4 if it independently has `allowExemption=true`.

  A decision is only made for **eligible** profiles: enabled, and covering the requested alias (MODEL-2). Passing it is necessary but not sufficient: the request must also pass the quota check (USE-6).
- **AUTH-5** **Audience meaning of the org unit constraint, for invoke only.** A profile in org unit X is available to every user in X's subtree, i.e. to users whose org unit is X or below X.

  This is the reverse of MAGDA's management scope (`managingOrgUnitIds`). It is deliberate and resource-specific:
  - A user does **not** reach profiles in their descendant org units. Many users sit near the root, and a profile put on a team's unit to limit an expensive model to that team must not open to everyone above it.
  - A profile with no org unit never matches.
  - A user without an org unit can only use grants 1, 3 and 4.
  - A parent-unit user who needs a child unit's profile gets it through a role (AUTH-7).

  The Auth API adds `input.user.orgUnitAncestorIds` to every decision's OPA input: the user's org unit plus all its ancestors, from `NestedSetModelQueryer.getAllParents(orgUnitId, true)`. It is `[]` for a user without an org unit.
- **AUTH-6** **Exemption applies to invoke only** (see [constraint exemption](https://github.com/magda-io/magda/blob/next/docs/docs/architecture/Guide%20to%20Magda%20Internals.md#constraint-exemption)). A manager marks a profile **Public** (`constraint_exemption=true`). The administrator decides who "the public" is, by deciding which roles hold an invoke permission with `allowExemption=true`. Under AUTH-3, exemption has nothing to relax for management operations.
- **AUTH-7** **Each profile has exactly one managed permission**: pre-authorised `llm/access/invoke` on `llm/access`, with `allowExemption=false`, stored as `use_permission_id`. Managers grant a profile by attaching that permission to **existing roles**. There is no managed role per profile, no direct-user grant and no custom permission.

  To give individual users access, a user administrator adds them to one of those roles in Settings → Users. That needs the usual `authObject/user/update`, which may be org unit scoped.
- **AUTH-8** Attaching and detaching a profile's permission needs only unconstrained `llm/access/update`. LLM Services makes the Auth API change itself (AUTH-12). It can only add or remove that profile's own invoke permission, so a profile manager can't gain any access beyond LLM invoke.

  Two roles can't be chosen:
  - **Anonymous Users:** there is no individual authenticated identity to meter, and AUTH-4 requires a non-empty user ID;
  - **Admin Users:** attaching is pointless: administrators already have access to every deployment-allowed model without a profile (AUTH-10).

  **Authenticated Users is allowed.** Attaching a profile to this role deliberately grants it to **everyone who can sign in**, including users created later, subject to that profile's enabled state, model coverage and soft limits. It does not grant anonymous access and does not require the Public setting. This is a broad role grant, distinct from Public plus an exemption-capable permission (AUTH-6).

  Profile managers are **not** given `authObject/role/update` instead. That permission alone lets its holder create any permission inside any role, including their own (`POST /roles/:roleId/permissions`), which makes it effectively administrator.
- **AUTH-9** `llm/usage/read` lets a caller read **other users'** usage (User Usage). In v8 it is allowed only for unconstrained permissions. A caller always reads their own usage without any permission (API-7).
- **AUTH-10** Administrators keep the OPA override. They may invoke any deployment-allowed alias without a profile and without quota checks. Their usage is still recorded (USE-9). Administrators are still bound by the deployment allowlist (MODEL-1).

  The override makes an administrator's invoke decision an unconditional `true`, and so does an unconstrained invoke grant (AUTH-4 (1)), which selects every profile but keeps quotas. LLM Services tells them apart by the Admin Users role in the session user's `whoami` result, as the entrypoint policy does. Moving quotas into the policy, or adding a dedicated bypass operation, was evaluated in #3941 and rejected as more cost than benefit.

### Stock roles and permissions

- **AUTH-11** The Authorization DB migration seeds the following, with fixed UUIDs in the style of `V2_4__agent_workspace_and_skills.sql`:
  - **Unconstrained permissions** for `llm/access/{create,read,update,delete,invoke}` and `llm/usage/read`. They are held by a new, unassigned stock role **"LLM Profile Managers"**, so managers can also view and test every profile, and see usage when tuning limits. The role's only `authObject/*` permission is an unconstrained, read-only `authObject/orgUnit/read`, so managers can choose a profile's org unit and see the names of the units profiles use. Without it, a manager who isn't an administrator sees no org units at all.
  - **A stock permission "Use LLM profiles":** `llm/access/invoke`, org unit constrained (audience, AUTH-5), `allowExemption=true`. It is added to the existing unassigned **"Agent Workspace Users"** stock role. On its own it grants nothing until a profile exists. With it, setup is one step: create a profile and either mark it Public or give it an org unit.

  The migration does not assign users, create a default profile or attach a profile to Authenticated Users. If Agent Workspace Users was deleted, the migration does not recreate it; the stock invoke permission is still seeded without that role link.

### Credentials

- **AUTH-12** LLM Services first authorises the caller with the `llm/*` decisions, made with the **caller's** session. It then makes every Auth API change with its own internal session: an internal JWT for `global.defaultAdminUserId`, as other services do. The changes are creating or deleting a profile's permission, attaching or detaching it, and listing candidate roles. Callers need no `authObject/*` permission for them; reading org units for the profile form is the only one managers use (AUTH-11).

  The Auth API's `authObject/role/*` and `authObject/permission/*` policies only accept unconstrained grants anyway.

### Policy sketch

The OPA object is `input.object.llmAccessProfile`. It has a **flat shape whose field names are the SQL column names** (EVAL-1). The rules use only literal comparisons and existence checks, so a partial decision can be translated into SQL.

```rego
package llm.access

import data.common.hasNoConstraintPermission
import data.common.hasOrgUnitConstraintPermission
import data.common.hasPermissionAllowExemption

default allow = false

managementOperation("llm/access/create")
managementOperation("llm/access/read")
managementOperation("llm/access/update")
managementOperation("llm/access/delete")

# AUTH-3: management is central
allow {
    managementOperation(input.operationUri)
    hasNoConstraintPermission(input.operationUri)
}

invoke {
    input.operationUri == "llm/access/invoke"
    is_string(input.user.id)
    input.user.id != ""
}

# AUTH-4 (1): unconstrained
allow {
    invoke
    hasNoConstraintPermission("llm/access/invoke")
}

# AUTH-4 (2) / AUTH-5: audience org unit
allow {
    invoke
    hasOrgUnitConstraintPermission("llm/access/invoke")
    input.object.llmAccessProfile.org_unit_id == input.user.orgUnitAncestorIds[_]
}

# AUTH-4 (3): the profile's own pre-authorised permission, matched on one permission object
allow {
    invoke
    permission := input.user.permissions[_]
    permission.resourceUri == "llm/access"
    permission.userOwnershipConstraint == false
    permission.orgUnitOwnershipConstraint == false
    permission.preAuthorisedConstraint == true
    permission.operations[_].uri == "llm/access/invoke"
    input.object.llmAccessProfile.use_permission_id == permission.id
}

# AUTH-4 (4) / AUTH-6: public profile
allow {
    invoke
    hasPermissionAllowExemption("llm/access/invoke")
    input.object.llmAccessProfile.constraint_exemption == true
}
```

`llm.usage` allows `llm/usage/read` with `hasNoConstraintPermission` only. Policy tests must cover:
- each grant type, including wrong resource, wrong operation and wrong flags;
- an owner-constrained invoke permission denying an ordinary profile, while Public still matches when that invoke permission independently allows exemption;
- a pre-authorised ID taken from one permission combined with flags from another not matching;
- the org unit cases in AUTH-5;
- a profile with no org unit;
- an anonymous caller;
- constrained management permissions being denied.

## Decision evaluation

- **EVAL-1** For invoke, LLM Services makes **one partial decision** per caller: `llm/access/invoke`, with `input.object.llmAccessProfile` unknown, requested with the caller's session through `AuthDecisionQueryClient`.

  The existing `AuthDecision.toSql({ prefixes: ["input.object.llmAccessProfile"], tableRef: "p" })` translates the residual directly into comparisons on `access_profiles` columns (e.g. `COALESCE("p"."org_unit_id"::TEXT = $1::TEXT, false)`), as the Auth API already does for org units. No SQL view and no custom `AspectQuery` are needed. An unconditional `false` grants no profile access. An unconditional `true` for a non-administrator removes only the authorization filter: enabled state, model coverage and quota checks still apply. Administrators are distinguished through AUTH-10 before the ordinary profile path.
- **EVAL-2** The same residual drives:
  - request admission (USE-6);
  - `GET /v1/models` (API-9);
  - the eligible models and remaining quota in My Usage (API-7).
- **EVAL-3** The residual depends only on the caller (roles, permissions, org unit). LLM Services may cache it per user for up to **30 seconds** (`llm-services.decisionCacheSeconds`, default `30`). That TTL is the documented delay before a revoked grant stops working. This is acceptable because the limits control a budget; they aren't billing.

  The session user's `whoami` result (the session check and the Admin Users role, AUTH-10) is cached with the residual, for the same TTL. Configuration accepts only **0–30 seconds**; `0` disables the cache. Revocation and org-unit or administrator-role changes may take that TTL to apply; an already running stream is not revoked.

  Profile changes take effect immediately, because the profile attributes are read from SQL on every request.
- **EVAL-4** Management operations (AUTH-3) need no profile attributes. They are a plain decision on the operation. List and read responses need no per-row filtering: a caller who may read one profile may read all of them.

## Data model

LLM Services owns its own database, `llm`, on the existing combined-db instance (DEP-1). This is a reference shape, not a migration:

```sql
CREATE TABLE access_profiles (
    id UUID PRIMARY KEY,                     -- generated by LLM Services, never reused
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    description TEXT,
    allowed_models TEXT[] NOT NULL CHECK (cardinality(allowed_models) > 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    org_unit_id UUID,                        -- audience (AUTH-5); NULL = no org unit
    constraint_exemption BOOLEAN NOT NULL DEFAULT FALSE,  -- public profile (AUTH-6)
    use_permission_id UUID NOT NULL UNIQUE,  -- AUTH-7; chosen by LLM Services (LIFE-1)
    allowed_daily_tokens BIGINT CHECK (allowed_daily_tokens >= 0),
    allowed_weekly_tokens BIGINT CHECK (allowed_weekly_tokens >= 0),
    allowed_monthly_tokens BIGINT CHECK (allowed_monthly_tokens >= 0),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE daily_model_usage (
    user_id UUID NOT NULL,
    model_alias TEXT NOT NULL,
    local_date DATE NOT NULL,
    measured_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (measured_input_tokens >= 0),
    measured_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (measured_output_tokens >= 0),
    estimated_tokens BIGINT NOT NULL DEFAULT 0 CHECK (estimated_tokens >= 0),
    estimated_requests BIGINT NOT NULL DEFAULT 0 CHECK (estimated_requests >= 0),
    PRIMARY KEY (user_id, model_alias, local_date)
);
```

- **DATA-1** The OPA object field names (`org_unit_id`, `use_permission_id`, `constraint_exemption`) are the column names, so that the translation in EVAL-1 works. Renaming one requires changing the policy too.
- **DATA-2** `allowed_models` is either a list of distinct, trimmed, non-empty exact aliases, or exactly `["*"]` (MODEL-2).
- **DATA-3** For each limit, NULL means unlimited for that period and `0` admits no new non-administrator request.
- **DATA-4** `revision` provides optimistic concurrency. Updates send it as `If-Match`; a stale value gets `409`. A transaction may be held across Auth API calls only for create, delete and attach (LIFE-1, LIFE-3, LIFE-4), each bounded by the call timeouts. These are rare administrator actions.
- **DATA-5** LLM Services never reads or writes Auth DB tables. Auth objects are reached only through the Auth API.
- **DATA-6** No pruning in v8. "Total" usage is the sum of all of a user's rows. The volume is one row per active user, per alias, per local day: about 730k rows a year for 1,000 daily users × 2 aliases. Add pruning, together with a rollup, only if it's ever needed.

## Model coverage

- **MODEL-1** The operator-managed aliases in Helm **`global.llmServices.defaultModel` and `global.llmServices.additionalModels`** form the deployment allowlist, an outer restriction for everyone, administrators included. The shared model-entry schema drives LLM Services, bundled LiteLLM and the Workspace; it replaces the earlier `llm-services.allowedModels` setting. Clients use exact public aliases, not provider model IDs. Provider routing and credentials stay in Helm and Secrets. There is no model table and no model management UI.
- **MODEL-2** `["*"]` covers every alias that is both deployment-allowed and served by the backend, including aliases added later. It never means arbitrary provider model names. If the backend's model list is unavailable, treat `*` as the explicitly configured allowlist.

  Explicit aliases are validated against deployment-allowed, backend-served aliases when written, with the same allowlist fallback when the backend list is unavailable, and checked against the allowlist again on each request. A profile can lose coverage when an operator removes an alias. Successful backend lists are cached for 60 seconds and failures for 15 seconds; discovery is not a provider-health guarantee. An external backend must route every configured public alias.
- **MODEL-3** Limits apply **separately to each alias**. A `["*"]` profile with a daily limit of 100k allows 100k tokens per user for each alias, not 100k across all of them.

## Profile lifecycle

- **LIFE-1** **Create**, in one database transaction:
  1. Insert the profile, with a newly generated `use_permission_id`: the ID its permission will have.
  2. Create its permission through the Auth API with that ID (AUTHAPI-4; pre-authorised invoke, `allowExemption=false`). Give it a name that includes the profile name and ID, for administrators; the name is never used as proof of ownership.
  3. Commit.

  If the work fails before commit, attempt to roll back the local transaction. Once step 2 was attempted, an Auth API error, unknown outcome such as a timeout, or failed commit acknowledgement also triggers **one** compensating delete of the permission by its ID. If that delete fails too, log it and return the original error, without retrying. An ID that turns out to be in use (`409`) is never ours, and is never deleted.

  This is not a distributed transaction. A crash, failed compensation or Auth request completing after a timeout can leave an unreferenced permission; that permission alone grants no profile access. A lost database commit acknowledgement can instead leave a saved profile whose permission was removed by compensation. Report the error, log the relevant IDs and reload/inspect state before retrying; a missing permission is recovered on the next role attachment (LIFE-5). Never promise that a failed request changed nothing.
- **LIFE-2** **Update:** managers may change every field (AUTH-3) with an `If-Match` revision. Validate any new `org_unit_id` through the Auth API. Changes apply to later requests; streams already in progress settle normally.
- **LIFE-3** **Attach or detach a role** (AUTH-8):
  - Attach with `POST /v0/auth/roles/:roleId/permissions/:permissionId`.
  - Detach with `DELETE /v0/auth/roles/:roleId/permissions/:permissionId?deletePermission=false`. Always pass `false`: the default deletes the permission when it leaves its last role.
  - Both calls are idempotent from the UI's point of view.
  - Attach locks the profile row (`SELECT … FOR UPDATE`) in a transaction while it re-creates a missing permission (LIFE-5) and attaches it. A concurrent delete then waits for it, or it waits for the delete and answers `404`, so an attach can never leave a permission on a role after its profile was deleted.
- **LIFE-4** **Delete**, in one database transaction:
  1. Delete the row.
  2. Delete the permission together with all its role links, in one Auth API call (AUTHAPI-2). A permission that is already gone counts as deleted.
  3. Commit.

  If step 2 fails, attempt to roll back the local row deletion. A definite Auth API refusal before mutation leaves the permission unchanged; a lost response or timeout may mean its deletion already committed. A failed database commit acknowledgement is also an uncertain outcome: the profile may remain without its permission, or its deletion may already have committed. Reload to distinguish a remaining profile from `404`; retrying a remaining profile can finish because an already-missing permission counts as deleted. Roles and users are never deleted. An error does not guarantee that the profile and permission are both unchanged.
- **LIFE-5** **A missing permission** is re-created, with the **same** ID, when a role is next attached to the profile. There is no background reconcile.

  A permission can go missing because `deleteRole` also deletes permissions that only that role holds. If an administrator deletes the only role holding a profile's permission (the Auth API first requires removing the role from all its users), the permission disappears. Its holders are gone with that role, so re-creating it loses nothing. Until then, the profile simply has no roles: audience, Public and unconstrained access don't use the permission.

  Never adopt an existing permission by its name or description. A permission found by the recorded ID that isn't a profile permission is logged and left alone.

### Auth API additions

- **AUTHAPI-1** `GET /v0/auth/permissions/:id/roles`: the roles holding a permission (ID, name, description), paginated. It requires unconstrained `authObject/permission/read`.
- **AUTHAPI-2** Delete a permission and all its role links in one transaction, e.g. `DELETE /v0/auth/permissions/:id?removeFromRoles=true`. It requires unconstrained `authObject/permission/delete` and `authObject/role/update`. Today `deletePermission` refuses while any role holds the permission.
- **AUTHAPI-3** `input.user.orgUnitAncestorIds` in the OPA input (AUTH-5).
- **AUTHAPI-4** `POST /v0/auth/permissions` accepts an optional caller-chosen `id` (a UUID). An ID already in use answers `409` and creates nothing. LIFE-1 uses it so a permission whose creation outcome was lost can be deleted by ID.

## Public API

All paths are relative to `/api/v0/llm`. These are the PoC API contracts. Every response is user-specific and sends `Cache-Control: private, no-store`, including proxied model responses: the backend's `Cache-Control` is never forwarded. API history date filters (`from` / `to`) are inclusive local dates; internal period sums use half-open date ranges (USE-4).

| | HTTP | Authorization | Result |
| --- | --- | --- | --- |
| API-1 | `GET /access-profiles`, `GET /access-profiles/:id` | `llm/access/read` | List (paginated, searchable) or read profiles |
| API-2 | `POST /access-profiles`; `PUT`/`DELETE /access-profiles/:id` | `llm/access/create` / `update` / `delete` | LIFE-1, LIFE-2 (`If-Match`; reads send the revision as `ETag`), LIFE-4 |
| API-3 | `GET /access-profiles/:id/roles` | `llm/access/read` | Roles holding the profile's permission (AUTHAPI-1) |
| API-4 | `GET /access-profiles/:id/role-candidates?q=` | `llm/access/update` | Role picker: ID, name and description only; excludes Anonymous Users, Admin Users and roles already attached |
| API-5 | `PUT`/`DELETE /access-profiles/:id/roles/:roleId` | `llm/access/update` | Attach or detach (LIFE-3) |
| API-6 | `GET /available-models` | `llm/access/read` | Deployment-allowed, served aliases, for the profile form |
| API-7 | `GET /usage/me`, `GET /usage/me/daily` | Any authenticated user; always the session's own user ID | Totals, eligible aliases with remaining quota (USE-8), previously used aliases with no current access, daily history |
| API-8 | `GET /usage/users`, `GET /usage/users/:userId`, `GET /usage/users/:userId/daily` | `llm/usage/read` | Other users' totals, remaining quota and history |
| API-9 | `GET /v1/models` | Invoke (EVAL-2) | Aliases covered by at least one eligible profile the caller can invoke; administrators see every allowed alias |
| API-10 | `POST /v1/chat/completions`, `POST /v1/responses` | Invoke + quota (USE-6) | Forward to LiteLLM and meter (METER-*) |
| API-13 | `GET /access-help` | Any authenticated user | The operator's `noAccessHelp` (DEP-3), for the Workspace's no-access message |

- **API-11** Errors are safe and don't leak identities or Secrets:
  - `401` unauthenticated, invalid session or a session naming a deleted user;
  - `403` the alias isn't allowed, or no eligible profile covers it (error code `llm_no_eligible_profile`);
  - `404` for a missing profile or role;
  - `409` stale revision (error code `llm_profile_stale_revision`, with the current revision);
  - `422` validation (error code `llm_profile_invalid`), including attaching Anonymous Users or Admin Users;
  - `428` an update without `If-Match`;
  - `429` with error code `llm_quota_exceeded` when every eligible profile's limit is used up. It also sends `x-should-retry: false`, because OpenAI SDKs otherwise retry a `429` automatically;
  - `503` when the Auth API is unavailable, or a required ledger read is unavailable or gated (USE-10, error code `llm_usage_unavailable`).

  Lifecycle errors do not promise that nothing changed: an Auth API refusal may surface as `502`, while a timeout or lost response can leave an uncertain outcome across the two services (LIFE-1, LIFE-3, LIFE-4). Show a safe, actionable error without exposing the upstream body or credentials.
- **API-12** User Usage finds users by ID. `GET /usage/users` lists users with usage, most tokens first, filtered by model and date range. A user ID always returns that user, including a deleted one with usage. Search by name or email, and display names on result rows, use the **caller's** session against the Auth API users endpoints. A caller without user read rights sees IDs only.

  A name or email search reads every match the caller may read, up to 2,000, and only then keeps those with usage, so a user isn't missed because of where their name sorts. When more match, the response says so and the page asks for a narrower search.
- **API-14** Another user's eligible aliases and remaining quota (API-8) come from **their** grants. After the caller's `llm/usage/read` decision, LLM Services makes that user's partial `llm/access/invoke` decision with an internal session for them, and only reads with it.

  A user who no longer exists (`whoami` answers `404`) has no eligible profile; their usage history is kept, and the report marks them as deleted. Their own leftover session gets `401`, not `503`.

## Soft usage ledger and quota

- **USE-1** The budget metric is **input + output tokens**. Reasoning tokens count as output and cached input as input; never count them twice. It's a volume measure, not a cost.
- **USE-2** The counter key is the authenticated MAGDA user UUID plus the requested public alias. Never the client-supplied `user` field, a profile, a session, an API key or a provider model ID.
- **USE-3** Periods use an operator-configured IANA timezone, `llm-services.usage.timeZone`, default `Australia/Sydney`. A request is attributed to the local date it **started**, even if its stream finishes the next day or month. Log in UTC. Handle DST without fixed offsets. Changing the timezone of a live deployment needs an explicit plan; existing dates are not reinterpreted.
- **USE-4** Daily, ISO-week (Monday start) and calendar-month usage are all summed from the daily table, with half-open date ranges. For example, for a request started on 21 November 2026 in Sydney:
  - day: `2026-11-21`;
  - week: `2026-11-16 <= local_date < 2026-11-23`;
  - month: `2026-11-01 <= local_date < 2026-12-01`.

  A request started at 23:59 on 30 November counts for 30 November.
- **USE-5** A profile admits a request when the user's usage of that alias is **below every configured limit of that same profile**. Profiles combine as OR. Limits never stack, and one profile's daily limit is never combined with another's monthly limit.
- **USE-6** **Admission**, in one SQL query: the eligible profiles that cover the alias (EVAL-1, MODEL-2), joined with the user's day, week and month sums for that alias. Admit if any profile passes USE-5. Otherwise return `429`, or `403` when no profile is eligible. There is no reservation: concurrent requests may overshoot. That's accepted for a soft limit.
- **USE-7** **Settlement:** after each forwarded request, one atomic `INSERT … ON CONFLICT … DO UPDATE` increment, either with measured usage or, when no valid final usage exists, with an estimate (METER-4). A request refused before it is forwarded costs nothing.
- **USE-8** **Remaining quota** for an alias:
  - for each eligible profile, the minimum over its configured periods of `max(0, limit - used)`, where NULL means unlimited;
  - then the maximum of that across eligible profiles.

  Per period, the usage pages show the remaining of the profile that gives the overall value. When every profile is used up, they show the profile that admits again first, by its reset dates: the latest end among its used-up periods, where a `0` limit never admits again. A period that profile doesn't limit is Unlimited. A per-period maximum across profiles isn't shown: it describes no limit that admission applies.

  Show **Unlimited**, **Exhausted** and **No eligible model profile** distinctly. Remaining quota indicates when admission will stop; it doesn't promise a number of tokens.
- **USE-9** Administrator requests skip quotas (AUTH-10) but are recorded.
- **USE-10** Profiles and usage share the **same `llm` database**. Non-administrator eligibility reads join the profile and period usage, so a failed required read returns **`503` even when a profile has no limits**. This fail-closed rule preserves profile authority; an unlimited limit is not permission to bypass a failed database read. Administrators retain their existing allowlist-bound bypass path (AUTH-10), and their forwarded usage is still settled on a best-effort basis.

  If a settlement write fails after the response headers have been sent:
  - log a critical accounting error, with no prompts or content;
  - stop admitting bounded requests **in that service process** until a ledger health check passes (a write probe that is always rolled back). Profiles without limits can continue only after a successful eligibility read; administrators retain their existing path;
  - don't retry the write: a write whose commit acknowledgement was lost could count the request twice. Repeated settlement of the same request ID is suppressed **in process**, not by a durable request journal.

  The failed-write gate and settlement duplicate suppression are process-local. Another replica does not inherit the gate; a process crash before settlement can lose usage. These are accepted limitations of the soft-budget PoC, separate from intentional concurrent overshoot (USE-6). There is no durable exactly-once, shared multi-replica gate or replay guarantee. Never report an uncommitted count as recorded. Readiness checks database connectivity, not accounting completeness or the failed-write gate.

## Metering

These rules follow from PoC #3936. They apply to every request that reaches LiteLLM.

- **METER-1** Count **one final usage snapshot per forwarded request**: Chat `usage.prompt_tokens` + `usage.completion_tokens`, or Responses `usage.input_tokens` + `usage.output_tokens` (in streams, the terminal `response.usage`).
  - If `total_tokens` is present, check it equals input + output.
  - Accept final usage from `response.completed` or `response.incomplete`, and from `response.failed` only when it carries a valid snapshot.
  - Count `[DONE]` after a Responses terminal event as a marker, not as another request. **`[DONE]` alone is not a Responses terminal:** a stream ending without `response.completed`, `response.failed` or `response.incomplete` is an incomplete attempt.
  - A Chat `finish_reason` on its own isn't a terminal. Invalid, malformed or oversize later Chat usage must not let `[DONE]` promote an earlier provisional zero or stale snapshot as final usage.
  - Never sum duplicate, conflicting or provisional usage events. Before a terminal, a later valid snapshot may replace an interim one. The first terminal freezes final accounting; later conflicting frames cannot overwrite it.
  - Final usage that is missing, invalid or oversize is **unknown**, never zero.
- **METER-2** Request handling differs by endpoint:

  | API / mode | Expected usage format | Handling |
  | --- | --- | --- |
  | Chat, non-streaming | `usage.prompt_tokens`, `completion_tokens`, `total_tokens` | Validate, debit once |
  | Chat, streaming | Final usage chunk, then `[DONE]` | Request usage with `stream_options.include_usage=true`; a caller's `false` must not make the call free. The historical 1.81.12 experiment observed that `false` suppressed usage. Provider compatibility still needs route-specific tests; when valid final usage cannot be read, debit an estimate |
  | Responses, non-streaming | `usage.input_tokens`, `output_tokens`, `total_tokens` | Validate, debit once |
  | Responses, streaming | Terminal `response.completed` / `response.incomplete` with nested `response.usage`, then `[DONE]` | **Never add Chat `stream_options`**: the tested route returned `400`. Accept usage on `response.incomplete` |
- **METER-3** The streaming observer is bounded and metadata-only:
  - it preserves bytes, chunk order, headers, backpressure and cancellation;
  - it handles any fragmentation, UTF-8 and CRLF boundaries;
  - it never buffers whole streams, rebuilds output, or logs prompts, responses or tool arguments;
  - the default limits are a 64 KiB SSE event buffer and a 1 MiB non-streaming JSON cap; they are explicit configuration, and dropped, oversize or unknown events are counted;
  - quality metadata may record request-body bytes, observed nonempty text/tool-argument delta bytes, terminal type and allowlisted status, `[DONE]` marker count and normal-completion state. Count bytes without retaining or logging content; do not count repeated `*.done` or terminal output snapshots again.

  The observer sits inside the proxy path; the PoC's loopback tap isn't a production design.

  Metering must never stop a valid response being forwarded. Invalid observer limits stop the service at startup. An observer that fails at run time is dropped, the response is still forwarded, and the request is estimated (METER-4).
- **METER-3a** A LiteLLM response cut off mid-way ends the client's response as a **failed connection**, never with a normal end that would make it look complete. This is the Gateway's rule since #3930. Once headers are sent, an upstream error destroys the client response; before then, the client gets `502`.
- **METER-4** **Estimate** when there is no valid final usage and the upstream may have processed the request (cancellation, timeout, malformed or oversize events, interruption). METER-7 lists exactly which outcomes are estimated. Use the simplified soft-budget heuristic:

  ```text
  input = ceil(forwarded request body bytes / bytesPerToken)
  if nonempty visible text/tool output was observed:
      visible = ceil(observed output bytes / bytesPerToken)
      fallback = 0
  else:
      visible = 0
      fallback = outputTokensByModel[alias] if configured, otherwise outputTokens
  factor = 1 for normal completion, otherwise incompleteFactor
  estimated_tokens = visible + ceil((input + fallback) * factor)
  ```

  Defaults under `llm-services.usage.estimate`: **`bytesPerToken: 5`**, **`outputTokens: 4096`**, **`outputTokensByModel: {}`**, **`incompleteFactor: 0.25`**. Thus input and visible output both use bytes divided by 5 by default. There is **no extra output or hidden-reasoning allowance** when visible output was observed; the 4,096-token fallback (or per-alias override) applies only when visible output could not be observed. An explicit per-alias fallback of `0` is preserved, not replaced with the default.

  A failed/incomplete terminal, absent terminal (including Responses `[DONE]` alone), interruption, unobservable format or observer failure is not normal completion. The factor discounts only estimated input and the no-visible-output fallback; visible output is never discounted. **Valid final usage is always measured unchanged**, including usage on failed/incomplete terminals; it never takes this estimate or its discount.

  Increment `estimated_tokens` and `estimated_requests`, never the measured columns. These defaults are **provisional soft-budget policy assumptions, not empirical calibration, a tokenizer, hidden-token measurement or a provider-billing fraction**. Request JSON and output text need not have the same token/byte ratio, and visible output misses hidden reasoning. Keep the heuristic explicit and simple rather than inventing a hidden-output allowance. The configured ratio and incomplete factor can be tuned, but none is an accuracy or upper-bound guarantee.
- **METER-5** Settle once per request within the process (USE-7). Track `terminalSeen` separately from `usageFinal`: a terminal event with invalid usage isn't final metering. Track Responses terminal types separately from `[DONE]`. Repeated events, close/error callbacks and `[DONE]` must not cause a second upsert. Duplicate suppression is process-local, not durable exactly-once accounting (USE-10); a crash before settlement is an accepted limitation of a soft quota.
- **METER-6** Meter **every** model request made for the user, independently against its own alias: tool-call requests and continuations, and auxiliary or background requests such as DSH titles. Each retry is another forwarded attempt and is metered independently; do not collapse a session or visible turn into one request. DSH retry/title policy belongs to the client, not a facade metering exemption. A background request cancelled at shutdown follows METER-4.
- **METER-7** **Charging outcomes.** Only a model response can be charged:

  | Outcome | Charge |
  | --- | --- |
  | Refused before forwarding (authorisation, quota, validation) | Nothing |
  | Never reached LiteLLM (connection refused, DNS failure) | Nothing |
  | Any non-2xx answer from LiteLLM or the provider (4xx or 5xx) | Nothing: there is no model response |
  | 2xx with valid final usage, including failed/incomplete terminal usage | Measured unchanged (METER-1), no incomplete discount |
  | 2xx normally completed without valid final usage | Estimated with factor `1` (METER-4) |
  | 2xx without a normal terminal, including Responses `[DONE]` alone, failed/incomplete terminal without valid usage, or an unreadable content type | Estimated with `incompleteFactor` on input/fallback only (METER-4) |
  | 2xx cut short: the client disconnects, or the upstream connection fails or times out mid-response | Measured if final usage already arrived, otherwise estimated with the incomplete factor |
  | Sent upstream, then the connection fails or times out before any response | Estimated with the incomplete factor: the model may still have processed it |

  Malformed or oversize usage is unknown, not zero; use the normal/incomplete rule for the observed completion state. The historical 1.81.12 PoC saw a completed Responses stream without terminal usage, so estimate fallback is needed in practice, not only in theory. That observation does not establish the current pin's missing-usage frequency or the accuracy of an estimate.

## Deployment

- **DEP-1** The `llm-services-db` chart and `magda-migrator-llm-services-db` image (using `magda-db-migrator`, like session-db and tenant-db) create the component-owned `llm` database and grant its service access through the standard PostgreSQL `client` role and Secret helpers. In combined-db mode the role/password are shared with the combined instance (`combined-db-password`); this is a separate logical database, not a dedicated login or PostgreSQL server. Dedicated/external PostgreSQL uses the configured database topology and credential Secrets. No Redis or LiteLLM database is required. Operators must include this database and the applicable credentials in the normal backup/restore plan; restored usage and profile state remain authoritative.
- **DEP-2** The Auth objects (AUTH-1, AUTH-11) are seeded by `magda-migrator-authorization-db` migration `V2_6__llm_access_profiles.sql`, because they live in the Auth DB. Deployment needs both service migrators, not only the LLM tables. They run as post-install/post-upgrade hook Jobs: let the hooks finish before checking application readiness. Helm `--wait` can prevent a fresh install from reaching the hooks when readiness depends on the missing schema/client login.
- **DEP-3** `llm-services` chart values:
  - `usage.timeZone` (`Australia/Sydney`);
  - `usage.estimate.*` (METER-4);
  - `decisionCacheSeconds` (`30`, accepted range `0–30`, EVAL-3);
  - `global.defaultAdminUserId`, for the internal session (AUTH-12);
  - `noAccessHelp.text` (plain text, at most 1,000 characters) and `noAccessHelp.url` (an absolute `http` or `https` link), both optional, shown to a user with no eligible model (UI). LLM Services checks them at startup and serves them through API-13 and in a no-access My Usage report. They are `llm-services` values: the web server chart never reads them. Without text, the pages say "Please contact system admin for access."; without a link, they show none;
- **DEP-4** MAGDA v8 is unreleased, so there is no released-user migration. Release notes must say that LLM access is no longer implied by `agentWorkspace/access`. A Workspace user needs the "Agent Workspace Users" stock role (which now includes "Use LLM profiles", AUTH-11) **and** a Public or audience profile, or another invoke grant.

## Acceptance tests

These are acceptance cases, **not a claim that every case has passed**. Record the exact revision, component/provider versions, real versus fixture services and PASS / FAIL / SKIPPED outcomes in qualification evidence. Historical observer counts are not current full-feature results; synthetic provider fixtures do not qualify other provider routes.

- **TEST-1** Policy: every case listed under the [policy sketch](#policy-sketch).
- **TEST-2** Partial evaluation: residuals for each grant type translate into SQL. The SQL selects exactly the profiles a full decision would allow, for the same fixtures. No-grant/unconditional false denies access; unconditional non-administrator true still checks profiles and quotas. Only the administrator path bypasses those checks.
- **TEST-3** Lifecycle:
  - create provisions exactly one correctly flagged permission;
  - definite pre-commit failures roll back local state; failed creates attempt exactly one permission cleanup by ID, never deleting an ID collision;
  - lost Auth responses, failed compensation and unknown database commit outcomes preserve the LIFE-1/LIFE-4 caveats: verify actual state instead of assuming rollback or guaranteed cleanup;
  - delete removes the permission from every role and never deletes a role or user;
  - after the only holder role is deleted, attaching a role re-creates the permission with the same ID;
  - detaching the last role keeps the permission;
  - a stale revision gets `409`.
- **TEST-4** Role grants:
  - attach and detach need only `llm/access/update`;
  - a caller with constrained `llm/access/update` is denied;
  - Anonymous Users and Admin Users are rejected for the reasons in AUTH-8;
  - Authenticated Users is allowed: attaching grants this profile to existing and future signed-in users, never anonymous users; detaching removes only that grant and retains the permission;
  - attaching grants the role's users invoke on that profile only.
- **TEST-5** Audience (AUTH-5):
  - own unit, ancestor unit, descendant unit (no access), sibling (no access);
  - a profile with no org unit;
  - a user with no org unit;
  - a Public profile with an exemption-capable grant, and without one.
- **TEST-6** Quota:
  - OR without stacking across profiles;
  - separate counters per alias and per user;
  - `0`, NULL and exhausted limits;
  - Sydney day, ISO week and month boundaries including DST;
  - a stream that crosses midnight;
  - concurrent upserts;
  - `429` versus `403`;
  - required profile/ledger read outage `503` for non-administrators, including unlimited profiles; process-local failed-write gate and recovery, with unlimited access still requiring a successful eligibility read (USE-10);
  - administrator requests recorded but not limited.
- **TEST-7** Metering: everything in METER-1 to METER-7, against pinned LiteLLM and real DSH Responses streaming. Other providers need their own compatibility tests before their metering is claimed.
- **TEST-8** API: personal endpoints ignore any supplied user ID; User Usage requires `llm/usage/read`; `Cache-Control: private, no-store` is sent; nothing leaks in errors.
- **TEST-9** UI: the [UI acceptance cases](./llm-access-profiles-ui.md#acceptance-cases).

## Alternatives considered

- **Registry records with an `access-control` aspect.** Rejected: a profile is a small central policy, not discoverable or federated content.
- **Three managed Use/View/Edit roles per profile, and direct user grants with user search.** Rejected: under AUTH-3 the View and Edit levels have no purpose, and user membership is already managed by the Users and Roles UI, including org unit scoped user administration.
- **A custom pre-authorised permission tab** (any subset of read/update/delete/invoke, assignable to roles). Rejected: under AUTH-3 only invoke needs flexible distribution, and attaching one managed permission to roles covers that without a permission lifecycle, reverse cleanup across roles or race handling.
- **Owner or org unit scoped profile management.** Rejected for v8: LLM access is a central budget (AUTH-3).
- **MAGDA's management meaning of the org unit constraint for invoke** (profile in the caller's unit or below). Rejected: "give department X access" would need one profile per child unit (AUTH-5).
- **Audience in both directions** (ancestors and descendants). Rejected: users near the root would see every profile (AUTH-5).
- **Giving profile managers `authObject/role/update`.** Rejected: that is effectively administrator (AUTH-8).
- **A schema inside the Auth DB.** Rejected in favour of the per-component database pattern (DEP-1).
- **A SQL view exposing a Registry-shaped `access-control` column, or a custom `AspectQuery`.** Not needed, because of the flat OPA object shape (EVAL-1).
- **Full decisions per profile.** Rejected in favour of one partial decision per caller (EVAL-1).

## PoC evidence and limits

The **current bundled pin** is `ghcr.io/magda-io/litellm:v1.83.14-stable.patch.3` (LiteLLM 1.83.14). The provider-qualified route is the tested **OpenAI Responses streaming** route through that backend. Provider compatibility is endpoint/model-specific, not implied by LiteLLM's routing catalogue. Chat and other providers/backends need their own compatibility evidence before support is claimed.

The [historical live findings](https://github.com/magda-io/magda/blob/poc/3934-litellm-usage-observer/magda-llm-services/poc/live-findings.md) of [draft PR #3936](https://github.com/magda-io/magda/pull/3936) describe the initial observer experiment on an older LiteLLM version. Keep its run-specific environment, counts and outcomes there, not as current qualification results in this design. Current qualification is tracked separately in #3950 / PR #3973.

Compatibility checks must distinguish fixture coverage from real-provider evidence, cover terminal usage and cancellation behavior, and meter tool continuations and auxiliary requests as separate forwarded attempts. Neither a successful route nor historical metering observations establish the accuracy of the provisional METER-4 policy defaults or provider billing. Record run-specific results with the PR or release evidence, not in this living contract.
