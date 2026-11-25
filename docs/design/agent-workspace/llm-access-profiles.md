# LLM access profiles and soft usage limits

- **Status:** proposed MAGDA v8 design for [#3838](https://github.com/magda-io/magda/issues/3838). **Not implemented.** The implementation PoC is tracked in [#3937](https://github.com/magda-io/magda/issues/3937). The screens are in the [Settings UI design](./llm-access-profiles-ui.md).
- **Evidence:** the [LiteLLM/DSH metering PoC #3934](https://github.com/magda-io/magda/issues/3934) ([draft PR #3936](https://github.com/magda-io/magda/pull/3936)) shows that usage can be metered on one tested provider route ([PoC evidence](#poc-evidence-and-limits)). It isn't a production metering implementation.
- **Owner:** MAGDA LLM Services. Neither the Registry nor LiteLLM manages profiles or usage.
- **Related:**
  - [LLM Services architecture](../../docs/architecture/llm-services.md);
  - [constraint semantics](../../docs/architecture/Guide%20to%20Magda%20Internals.md#what-permission-constraints-are-for) and [constraint exemption](../../docs/architecture/Guide%20to%20Magda%20Internals.md#constraint-exemption);
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

What changes compared with today: LLM invocation no longer depends on `agentWorkspace/access`. The Workspace itself still requires that permission. Independent LLM clients need only an invoke grant (**AUTH-4**). Provider Secrets stay private to LiteLLM.

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

  Owner-constrained and combined owner + org unit invoke permissions match nothing: profiles have no owner.

  A decision is only made for **eligible** profiles: enabled, in state `ready`, and covering the requested alias (MODEL-2). Passing it is necessary but not sufficient: the request must also pass the quota check (USE-6).
- **AUTH-5** **Audience meaning of the org unit constraint, for invoke only.** A profile in org unit X is available to every user in X's subtree, i.e. to users whose org unit is X or below X.

  This is the reverse of MAGDA's management scope (`managingOrgUnitIds`). It is deliberate and resource-specific:
  - A user does **not** reach profiles in their descendant org units. Many users sit near the root, and a profile put on a team's unit to limit an expensive model to that team must not open to everyone above it.
  - A profile with no org unit never matches.
  - A user without an org unit can only use grants 1, 3 and 4.
  - A parent-unit user who needs a child unit's profile gets it through a role (AUTH-7).

  The Auth API adds `input.user.orgUnitAncestorIds` to every decision's OPA input: the user's org unit plus all its ancestors, from `NestedSetModelQueryer.getAllParents(orgUnitId, true)`. It is `[]` for a user without an org unit.
- **AUTH-6** **Exemption applies to invoke only** (see [constraint exemption](../../docs/architecture/Guide%20to%20Magda%20Internals.md#constraint-exemption)). A manager marks a profile **Public** (`constraint_exemption=true`). The administrator decides who "the public" is, by deciding which roles hold an invoke permission with `allowExemption=true`. Under AUTH-3, exemption has nothing to relax for management operations.
- **AUTH-7** **Each profile has exactly one managed permission**: pre-authorised `llm/access/invoke` on `llm/access`, with `allowExemption=false`, stored as `use_permission_id`. Managers grant a profile by attaching that permission to **existing roles**. There is no managed role per profile, no direct-user grant and no custom permission.

  To give individual users access, a user administrator adds them to one of those roles in Settings → Users. That needs the usual `authObject/user/update`, which may be org unit scoped.
- **AUTH-8** Attaching and detaching a profile's permission needs only unconstrained `llm/access/update`. LLM Services makes the Auth API change itself (AUTH-12). It can only add or remove that profile's own invoke permission, so a profile manager can't gain any access beyond LLM invoke.

  Two roles can't be chosen:
  - **Anonymous Users:** there is no user ID to meter, and AUTH-4 requires one;
  - **Admin Users:** pointless, administrators already have access.

  Profile managers are **not** given `authObject/role/update` instead. That permission alone lets its holder create any permission inside any role, including their own (`POST /roles/:roleId/permissions`), which makes it effectively administrator.
- **AUTH-9** `llm/usage/read` lets a caller read **other users'** usage (User Usage). In v8 it is allowed only for unconstrained permissions. A caller always reads their own usage without any permission (API-7).
- **AUTH-10** Administrators keep the OPA override. They may invoke any deployment-allowed alias without a profile and without quota checks. Their usage is still recorded (USE-9). Administrators are still bound by the deployment allowlist (MODEL-1).

  The override makes an administrator's invoke decision an unconditional `true`, and so does an unconstrained invoke grant (AUTH-4 (1)), which selects every profile but keeps quotas. LLM Services tells them apart by the Admin Users role in the session user's `whoami` result, as the entrypoint policy does. Moving quotas into the policy, or adding a dedicated bypass operation, was evaluated in #3941 and rejected as more cost than benefit.

### Stock roles and permissions

- **AUTH-11** The Authorization DB migration seeds the following, with fixed UUIDs in the style of `V2_4__agent_workspace_and_skills.sql`:
  - **Unconstrained permissions** for `llm/access/{create,read,update,delete,invoke}` and `llm/usage/read`. They are held by a new, unassigned stock role **"LLM Profile Managers"**, so managers can also view and test every profile, and see usage when tuning limits. The role holds **no** `authObject/*` permissions.
  - **A stock permission "Use LLM profiles":** `llm/access/invoke`, org unit constrained (audience, AUTH-5), `allowExemption=true`. It is added to the existing unassigned **"Agent Workspace Users"** stock role. On its own it grants nothing until a profile exists. With it, setup is one step: create a profile and either mark it Public or give it an org unit.

### Credentials

- **AUTH-12** LLM Services first authorises the caller with the `llm/*` decisions, made with the **caller's** session. It then makes every Auth API change with its own internal session: an internal JWT for `global.defaultAdminUserId`, as other services do. The changes are creating or deleting a profile's permission, attaching or detaching it, and listing candidate roles. Callers never need any `authObject/*` permission.

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
- an owner-constrained invoke permission matching nothing;
- a pre-authorised ID taken from one permission combined with flags from another not matching;
- the org unit cases in AUTH-5;
- a profile with no org unit;
- an anonymous caller;
- constrained management permissions being denied.

## Decision evaluation

- **EVAL-1** For invoke, LLM Services makes **one partial decision** per caller: `llm/access/invoke`, with `input.object.llmAccessProfile` unknown, requested with the caller's session through `AuthDecisionQueryClient`.

  The existing `AuthDecision.toSql({ prefixes: ["input.object.llmAccessProfile"], tableRef: "p" })` translates the residual directly into comparisons on `access_profiles` columns (e.g. `COALESCE("p"."org_unit_id"::TEXT = $1::TEXT, false)`), as the Auth API already does for org units. No SQL view and no custom `AspectQuery` are needed. An unconditional `true` (administrators, unconstrained invoke) or `false` result skips the SQL condition.
- **EVAL-2** The same residual drives:
  - request admission (USE-6);
  - `GET /v1/models` (API-9);
  - the eligible models and remaining quota in My Usage (API-7).
- **EVAL-3** The residual depends only on the caller (roles, permissions, org unit). LLM Services may cache it per user for up to **30 seconds** (`llm-services.decisionCacheSeconds`, default `30`). That TTL is the documented delay before a revoked grant stops working. This is acceptable because the limits control a budget; they aren't billing.

  The session user's `whoami` result (the session check and the Admin Users role, AUTH-10) is cached with the residual, for the same TTL; a TTL of `0` disables the cache.

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
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'ready', 'deleting')),
    org_unit_id UUID,                        -- audience (AUTH-5); NULL = no org unit
    constraint_exemption BOOLEAN NOT NULL DEFAULT FALSE,  -- public profile (AUTH-6)
    use_permission_id UUID UNIQUE,           -- AUTH-7; NULL only while pending
    allowed_daily_tokens BIGINT CHECK (allowed_daily_tokens >= 0),
    allowed_weekly_tokens BIGINT CHECK (allowed_weekly_tokens >= 0),
    allowed_monthly_tokens BIGINT CHECK (allowed_monthly_tokens >= 0),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (state = 'pending' OR use_permission_id IS NOT NULL)
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
- **DATA-4** `revision` provides optimistic concurrency. Updates send it as `If-Match`; a stale value gets `409`. Never hold a SQL lock across an Auth API call.
- **DATA-5** LLM Services never reads or writes Auth DB tables. Auth objects are reached only through the Auth API.
- **DATA-6** No pruning in v8. "Total" usage is the sum of all of a user's rows. The volume is one row per active user, per alias, per local day: about 730k rows a year for 1,000 daily users × 2 aliases. Add pruning, together with a rollup, only if it's ever needed.

## Model coverage

- **MODEL-1** The operator-managed Helm `llm-services.allowedModels` is an outer restriction for everyone, administrators included. Provider routing and credentials stay in Helm and Secrets. There is no model table and no model management UI.
- **MODEL-2** `["*"]` covers every alias that is both deployment-allowed and served by the backend, including aliases added later. It never means arbitrary provider model names. If the backend's model list is unavailable, treat `*` as the explicitly configured allowlist.

  Explicit aliases are validated against the allowlist when written, and checked again on each request. A profile can lose coverage when an operator removes an alias.
- **MODEL-3** Limits apply **separately to each alias**. A `["*"]` profile with a daily limit of 100k allows 100k tokens per user for each alias, not 100k across all of them.

## Profile lifecycle

- **LIFE-1** **Create:**
  1. Insert the profile as `pending`, with a newly generated `use_permission_id`: the ID its permission **will** have.
  2. Create its permission through the Auth API with that ID (AUTHAPI-4; pre-authorised invoke, `allowExemption=false`). Give it a name that includes the profile name and ID, for administrators; the name is never used as proof of ownership.
  3. Set the profile to `ready`.

  Because the ID is recorded before the permission exists, a failure at any step is recovered by ID (LIFE-5), and can't leave an unreferenced permission. A retry that finds the ID already in use (`409`) checks that permission is a profile permission; it never adopts anything else.
- **LIFE-2** **Update:** managers may change every field (AUTH-3) with an `If-Match` revision. Validate any new `org_unit_id` through the Auth API. Changes apply to later requests; streams already in progress settle normally.
- **LIFE-3** **Attach or detach a role** (AUTH-8):
  - Attach with `POST /v0/auth/roles/:roleId/permissions/:permissionId`.
  - Detach with `DELETE /v0/auth/roles/:roleId/permissions/:permissionId?deletePermission=false`. Always pass `false`: the default deletes the permission when it leaves its last role.
  - Both calls are idempotent from the UI's point of view.
- **LIFE-4** **Delete:**
  1. Set `state='deleting'` and `enabled=false`. The profile stops being eligible at once.
  2. Delete the permission together with all its role links, in one Auth API transaction (AUTHAPI-2).
  3. Delete the row.

  Retries are idempotent: marking an already `deleting` profile changes nothing, not even its revision. Roles and users are never deleted. If step 2 fails, the profile stays `deleting`, keeps matching nothing, and reconciliation retries.

  Only a `ready` profile is marked `deleting`. Deleting a `pending` profile answers `409`: its creation is still in progress, and reconcile (LIFE-5) finishes it.
- **LIFE-5** **Reconcile**, at startup, periodically (`llm-services.profiles.reconcileIntervalSeconds`, default 300) and on demand from the profile page (`POST /access-profiles/:id/reconcile`):
  - finish `pending` profiles older than a short grace period: create the recorded permission if it's missing, then set `ready`. A pending row without a recorded permission ID (only an older version could write one) is abandoned;
  - retry `deleting` profiles;
  - re-create a missing permission for a `ready` profile **with the same ID**, so the profile needs no change.

  A permission can go missing because `deleteRole` also deletes permissions that only that role holds. If an administrator deletes the only role holding a profile's permission, the permission disappears. Its holders are gone with that role, so re-creating it loses nothing.

  Never adopt an existing permission by its name or description. A permission found by the recorded ID that isn't a profile permission is logged and left alone. A sweep that fails (e.g. during an Auth API rollout) is retried after 30 seconds.

### Auth API additions

- **AUTHAPI-1** `GET /v0/auth/permissions/:id/roles`: the roles holding a permission (ID, name, description), paginated. It requires unconstrained `authObject/permission/read`.
- **AUTHAPI-2** Delete a permission and all its role links in one transaction, e.g. `DELETE /v0/auth/permissions/:id?removeFromRoles=true`. It requires unconstrained `authObject/permission/delete` and `authObject/role/update`. Today `deletePermission` refuses while any role holds the permission.
- **AUTHAPI-3** `input.user.orgUnitAncestorIds` in the OPA input (AUTH-5).
- **AUTHAPI-4** `POST /v0/auth/permissions` accepts an optional caller-chosen `id` (a UUID). An ID already in use answers `409` and creates nothing. This makes LIFE-1's creation retryable by ID.

## Public API

All paths are relative to `/api/v0/llm`. They are proposed. Every response is user-specific and sends `Cache-Control: private, no-store`, including proxied model responses: the backend's `Cache-Control` is never forwarded.

| | HTTP | Authorization | Result |
| --- | --- | --- | --- |
| API-1 | `GET /access-profiles`, `GET /access-profiles/:id` | `llm/access/read` | List (paginated, searchable) or read profiles |
| API-2 | `POST /access-profiles`; `PUT`/`DELETE /access-profiles/:id` | `llm/access/create` / `update` / `delete` | LIFE-1, LIFE-2 (`If-Match`; reads send the revision as `ETag`), LIFE-4 |
| API-3 | `GET /access-profiles/:id/roles` | `llm/access/read` | Roles holding the profile's permission (AUTHAPI-1) |
| API-4 | `GET /access-profiles/:id/role-candidates?q=` | `llm/access/update` | Role picker: ID, name and description only; excludes Anonymous Users, Admin Users and roles already attached |
| API-5 | `PUT`/`DELETE /access-profiles/:id/roles/:roleId` | `llm/access/update` | Attach or detach (LIFE-3) |
| API-6 | `GET /available-models` | `llm/access/read` | Deployment-allowed, served aliases, for the profile form |
| API-6a | `POST /access-profiles/:id/reconcile` | `llm/access/update` | Reconcile one profile on demand (LIFE-5) |
| API-7 | `GET /usage/me`, `GET /usage/me/daily` | Any authenticated user; always the session's own user ID | Totals, eligible aliases with remaining quota (USE-8), daily history |
| API-8 | `GET /usage/users`, `GET /usage/users/:userId`, `GET /usage/users/:userId/daily` | `llm/usage/read` | Other users' totals, remaining quota and history |
| API-9 | `GET /v1/models` | Invoke (EVAL-2) | Aliases covered by at least one eligible profile the caller can invoke; administrators see every allowed alias |
| API-10 | `POST /v1/chat/completions`, `POST /v1/responses` | Invoke + quota (USE-6) | Forward to LiteLLM and meter (METER-*) |

- **API-11** Errors are safe and don't leak identities or Secrets:
  - `401` unauthenticated;
  - `403` the alias isn't allowed, or no eligible profile covers it (error code `llm_no_eligible_profile`);
  - `404` for a missing profile or role;
  - `409` stale revision (error code `llm_profile_stale_revision`, with the current revision), or a profile still being created or deleted;
  - `422` validation (error code `llm_profile_invalid`), including attaching Anonymous Users or Admin Users;
  - `428` an update without `If-Match`;
  - `429` with error code `llm_quota_exceeded` when every eligible profile's limit is used up. It also sends `x-should-retry: false`, because OpenAI SDKs otherwise retry a `429` automatically;
  - `503` when the Auth API is unavailable, or a required ledger read is unavailable or gated (USE-10, error code `llm_usage_unavailable`).
- **API-12** User Usage finds users by ID. Search by name or email, and display names on result rows, use the **caller's** session against the Auth API users endpoints. A caller without user read rights sees IDs only.

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

  Show **Unlimited**, **Exhausted** and **No eligible model profile** distinctly. Remaining quota indicates when admission will stop; it doesn't promise a number of tokens.
- **USE-9** Administrator requests skip quotas (AUTH-10) but are recorded.
- **USE-10** If the ledger can't be read before admission, fail requests bounded by a limit with `503`, rather than letting unchecked spending through. Administrators and profiles without limits follow their normal path.

  If a settlement write fails after the response headers have been sent:
  - log a critical accounting error, with no prompts or content;
  - stop admitting bounded requests until a ledger health check passes (a write probe that is always rolled back). Profiles without limits and administrators keep their normal path;
  - don't retry the write: a write whose commit acknowledgement was lost would count the request twice. A repeated settlement of the same request ID is dropped.

  Never report an uncommitted count as recorded.

## Metering

These rules follow from PoC #3936. They apply to every request that reaches LiteLLM.

- **METER-1** Count **one final usage snapshot per forwarded request**: Chat `usage.prompt_tokens` + `usage.completion_tokens`, or Responses `usage.input_tokens` + `usage.output_tokens` (in streams, the terminal `response.usage`).
  - If `total_tokens` is present, check it equals input + output.
  - Accept final usage from `response.completed` or `response.incomplete`, and from `response.failed` only when it carries a valid snapshot.
  - Count `[DONE]` after a Responses terminal event as a marker, not as another request.
  - A Chat `finish_reason` on its own isn't a terminal.
  - Never sum duplicate, conflicting or provisional usage events.
  - Usage that is missing, invalid or oversize is **unknown**, never zero.
- **METER-2** Request handling differs by endpoint:

  | API / mode | Format on the tested route | Handling |
  | --- | --- | --- |
  | Chat, non-streaming | `usage.prompt_tokens`, `completion_tokens`, `total_tokens` | Validate, debit once |
  | Chat, streaming | Final usage chunk, then `[DONE]` | In LiteLLM 1.81.12, an omitted or `true` `stream_options.include_usage` produced usage; `false` suppressed it. Make sure usage is requested for quota-bounded calls, with provider compatibility tests. Never treat `false` as a free call. If usage can't be requested safely, debit an estimate |
  | Responses, non-streaming | `usage.input_tokens`, `output_tokens`, `total_tokens` | Validate, debit once |
  | Responses, streaming | Terminal `response.completed` / `response.incomplete` with nested `response.usage`, then `[DONE]` | **Never add Chat `stream_options`**: the tested route returned `400`. Accept usage on `response.incomplete` |
- **METER-3** The streaming observer is bounded and metadata-only:
  - it preserves bytes, chunk order, headers, backpressure and cancellation;
  - it handles any fragmentation, UTF-8 and CRLF boundaries;
  - it never buffers whole streams, rebuilds output, or logs prompts, responses or tool arguments;
  - the tested limits are a 64 KiB SSE event buffer and a 1 MiB non-streaming JSON cap. Production limits are explicit configuration, and dropped, oversize or unknown events are counted.

  The observer sits inside the proxy path; the PoC's loopback tap isn't a production design.

  Metering must never stop a valid response being forwarded. Invalid observer limits stop the service at startup. An observer that fails at run time is dropped, the response is still forwarded, and the request is estimated (METER-4).
- **METER-3a** A LiteLLM response cut off mid-way ends the client's response as a **failed connection**, never with a normal end that would make it look complete. This is the Gateway's rule since #3930. Once headers are sent, an upstream error destroys the client response; before then, the client gets `502`.
- **METER-4** **Estimate** when there is no valid final usage and the upstream may have processed the request (cancellation, timeout, malformed or oversize events, interruption). METER-7 lists exactly which outcomes are estimated:

  `estimated_tokens = ceil(request body bytes / bytesPerToken) + outputAllowance`

  It increments `estimated_tokens` and `estimated_requests`, never the measured columns. Defaults: `llm-services.usage.estimate.bytesPerToken: 4`, `llm-services.usage.estimate.outputTokens: 4096`, with optional per-alias overrides. These are initial values to tune with evidence. The estimate is never based only on visible output text, which misses reasoning, cached input and background generation.
- **METER-5** Settle once per request (USE-7). Track `terminalSeen` separately from `usageFinal`: a terminal event with invalid usage isn't final metering. Repeated events, close/error callbacks and `[DONE]` must not cause a second upsert. A crash before settlement is an accepted limitation of a soft quota.
- **METER-6** Meter **every** model request made for the user, independently against its own alias: tool-call requests and continuations, and auxiliary or background requests such as DSH titles. A background request cancelled at shutdown follows METER-4.
- **METER-7** **Charging outcomes.** Only a model response can be charged:

  | Outcome | Charge |
  | --- | --- |
  | Refused before forwarding (authorisation, quota, validation) | Nothing |
  | Never reached LiteLLM (connection refused, DNS failure) | Nothing |
  | Any non-2xx answer from LiteLLM or the provider (4xx or 5xx) | Nothing: there is no model response |
  | 2xx with valid final usage | Measured (METER-1) |
  | 2xx without valid final usage: a terminal event without usage, no terminal, malformed or oversize usage, or an unreadable content type | Estimated (METER-4) |
  | 2xx cut short: the client disconnects, or the upstream connection fails or times out mid-response | Measured if final usage already arrived, otherwise estimated |
  | Sent upstream, then the connection fails or times out before any response | Estimated: the model may still have processed it |

  The PoC saw a real completed Responses stream from the pinned LiteLLM whose terminal event carried no usage. The estimate fallback is needed in practice, not only in theory.

## Deployment

- **DEP-1** Add an `llm-services-db` chart and a `magda-migrator-llm-services-db` image (using `magda-db-migrator`, like session-db and tenant-db). They create the `llm` database on combined-db, or on a configured external instance, with their own password Secret and login. No new Postgres server, no Redis, no LiteLLM database.
- **DEP-2** The Auth objects (AUTH-1, AUTH-11) are seeded by a new `magda-migrator-authorization-db` migration, because they live in the Auth DB.
- **DEP-3** New `llm-services` chart values:
  - `usage.timeZone` (`Australia/Sydney`);
  - `usage.estimate.*` (METER-4);
  - `decisionCacheSeconds` (`30`);
  - `profiles.reconcileIntervalSeconds` (`300`; LIFE-5);
  - `global.defaultAdminUserId`, for the internal session (AUTH-12);
  - an optional `noAccessHelp` text or link, shown by the Workspace when a user has no eligible model (UI);
- **DEP-4** MAGDA v8 is unreleased, so there is no released-user migration. Release notes must say that LLM access is no longer implied by `agentWorkspace/access`. A Workspace user needs the "Agent Workspace Users" stock role (which now includes "Use LLM profiles", AUTH-11) **and** a Public or audience profile, or another invoke grant.

## Acceptance tests

- **TEST-1** Policy: every case listed under the [policy sketch](#policy-sketch).
- **TEST-2** Partial evaluation: residuals for each grant type translate into SQL. The SQL selects exactly the profiles a full decision would allow, for the same fixtures. The admin and no-grant results short-circuit.
- **TEST-3** Lifecycle:
  - create provisions exactly one correctly flagged permission;
  - interrupted create and delete recover through reconcile;
  - delete removes the permission from every role and never deletes a role or user;
  - a deleted holder role leads to re-creation;
  - detaching the last role keeps the permission;
  - a stale revision gets `409`.
- **TEST-4** Role grants:
  - attach and detach need only `llm/access/update`;
  - a caller with constrained `llm/access/update` is denied;
  - Anonymous Users and Admin Users are rejected;
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
  - ledger outage `503`;
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

The [live findings](https://github.com/magda-io/magda/blob/poc/3934-litellm-usage-observer/magda-llm-services/poc/live-findings.md) of [draft PR #3936](https://github.com/magda-io/magda/pull/3936) (20 November 2026) report:

- **Setup:** bundled `ghcr.io/berriai/litellm:main-v1.81.12-stable` (installed LiteLLM 1.81.12; image ID `sha256:bbe33922e37bb76a065f85b847cb34744e98b408df66c6c4b4425e48b9e8c573`), one real OpenAI route (`openai/gpt-6.1-sol` behind `magda-agent-default`) and installed DSH 0.2.1-alpha.1, in isolated minikube headless sessions behind the existing facade. Streamed Responses requests and real bash tool-call continuations succeeded through a read-only tap. This was not browser UI testing.
- **A measured continuation:** input 4,312 + output 18 = 4,330, including 4,223 cached input (part of input) and 11 reasoning tokens (part of output).
- **Auxiliary requests:** a concurrent title request ended `response.incomplete` with valid usage. Five wire requests were seen, but only four finished reporting before shutdown, so in-flight auxiliary requests aren't always meterable.
- **Chat with tools:** the tested model rejected tool-bearing Chat Completions requests whatever the usage settings, and installed DSH sends tools even for ordinary tasks. Responses is the verified DSH route for this provider.
- **Tests:** 50 passing automated tests (fragmented SSE, byte preservation, backpressure, cancellation), with synthetic offline fixtures kept separate from the live results.
- **Not verified:** Anthropic, Bedrock, Azure, other OpenAI-compatible backends, browser sessions, all failure races, and provider billing accuracy. LiteLLM 1.81.12 showed no `always_include_stream_usage` option; don't rely on one.

This supports MAGDA-owned, approximate token accounting on the current pinned LiteLLM, without an upgrade. It doesn't validate other providers.
