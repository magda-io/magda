# PostgreSQL-backed LLM Access Profiles and soft usage limits

**Status:** Proposed MAGDA v8 design for [#3838](https://github.com/magda-io/magda/issues/3838), **not implemented**. The [LiteLLM/DSH metering PoC #3934](https://github.com/magda-io/magda/issues/3934), documented in [draft PR #3936](https://github.com/magda-io/magda/pull/3936), provides **positive, provider-specific feasibility evidence** for this approach (see below), not a production metering implementation. No v8 release or production deployment exists, so no released-user migration is required.
**Existing implementation:** [LLM Services](../../docs/architecture/llm-services.md), [Workspace security](../../docs/architecture/agent-workspace-security.md) and [deployment](../../docs/agent-workspace-deployment.md).
**Owner:** MAGDA LLM Services; neither Registry nor LiteLLM manages these profiles.


## Decision and rationale: SQL, not Registry records

Store **both access profiles and usage aggregates** in an LLM Services-owned `llm_services` PostgreSQL schema on the **existing Authorization PostgreSQL instance**. Use a dedicated least-privilege login/Secret. The Authorization API, not this schema, owns resources, operations, roles, permissions and user-role assignments; LLM Services calls its **public/trusted service APIs**, never its SQL tables. No new PostgreSQL server, Redis or LiteLLM virtual-key/spend DB is required.

A profile is a small administrative access policy, not a discoverable/federated Registry record. No `llm-access-profile-details` Registry aspect, Registry record or generic `object/record/*` grant is introduced. LLM Services is the only supported profile CRUD/validation surface. We lose Registry event sourcing/partial-evaluation filtering; LLM Services must provide authorization, operational logs and SQL migration/backup ownership. SQL updates and remote Authorization API calls are **not an atomic transaction**.

### Simplification compared with the earlier proposal

- **One shared authorization resource** `llm/access`, with seeded operations `create`, `read`, `update`, `delete` and `invoke`. Do **not** create `llm/access/<profile-id>` resources or per-profile operation URIs.
- **Three automatically managed role/permission pairs per profile** (invoke, read, update), stored in one `profile_managed_roles` mapping table. All three permissions have `preAuthorisedConstraint=true` on resource `llm/access`; only the exact matching permission ID/operation applies to a given profile.
- LLM Services constructs a Registry-style **`access-control` object in trusted OPA decision input**, despite storing owner/orgUnit/exemption as ordinary SQL columns. The three managed permission IDs become its `preAuthorisedPermissionIds` array; no second mapping table is needed.
- **No special non-admin wildcard invocation operation** (`llm/access/*/access`). A normal profile with `allowed_models=['*']` and nullable/unlimited ceilings allows administrators to grant unrestricted *profile* use to selected users, always subject to the deployment allowlist. MAGDA's existing global OPA administrator override remains.
- **Model routing stays operator-owned via Helm/Secrets**, not in a new database-backed model catalogue. The existing bundled LiteLLM chart currently configures one alias; multi-model Helm support can be a separate deployment improvement. Neither a SQL model list nor the profile `'*'` wildcard provisions credentials, endpoints or LiteLLM routes.
- Retain the lightweight `revision` optimistic-concurrency column, `pending/ready/deleting` recovery state and **one daily usage aggregate table**. No request log, reservations, weekly/monthly tables or billing accounting is required.

MAGDA's [Access Group architecture](../../docs/architecture/access-groups.md), [user guide](../../docs/access-groups.md) and [ADR 0012](../../docs/adrs/0012-typed-access-group-authorisation.md) establish the auto-managed role and typed ownership/pre-authorised pattern. The [Registry feature guide](../../docs/architecture/Guide%20to%20Magda%20Internals.md#building-features-on-registry-records) supports the feature-service ownership principle, not a requirement that these SQL-only profiles have Registry aspects.

### Boundaries

```text
Authenticated MAGDA API client or Workspace/DSH
 -> MAGDA Gateway (verified Magda session)
 -> MAGDA LLM Services
      - validates profile management and per-request model entitlement using Auth API/OPA
      - reads LLM-owned profile SQL, managed-role IDs and daily usage counters
      - applies deployment model allowlist and model-specific soft quotas
      - forwards OpenAI-compatible requests through private LiteLLM
      - observes response usage without changing stream bytes
 -> private LiteLLM -> configured model provider

Existing Authorization API: shared llm/access resource and operations,
    profile-owned role/permission records, all user-role assignments
SQL llm_services schema: profile data, three role/permission ID pairs,
    one row per (user, public model alias, local accounting date)
```

Workspace lifecycle/runtime still requires self-only `agentWorkspace/access`; independent LLM clients need a model entitlement, **not** Workspace access. Provider Secrets stay private to LiteLLM. The operator-controlled Helm `llm-services.allowedModels` is an outer safety/availability restriction, including for administrators; model profile membership is an additional permission check for non-admins.

### Profile model wildcard and deployment catalogue

Accept either a list of distinct, nonblank exact public aliases such as `["model-a", "model-b"]` **or exactly** `["*"]`. Disallow mixing `"*"` with any other value, duplicates, unknown aliases (except `"*"`), empty strings or ambiguous whitespace. The model alias `"*"` in a profile is a **whole-element sentinel**, not prefix matching or an SQL wildcard. Literal model IDs must still be validated against configured deployment-allowed aliases at profile write time and checked again on invocation; profiles may become unavailable when operators remove an alias.

`["*"]` means **all aliases currently both configured/served by the backend and allowed by the deployment**; it dynamically covers newly deployed aliases without expanding the SQL array. If a backend's `/models` list is unavailable or untrusted, fail closed to known explicitly configured/validated aliases. The wildcard does **not** mean arbitrary LiteLLM/provider-supported model names, and cannot bypass the deployment-wide allowlist.

Every daily/weekly/monthly ceiling applies **separately to each requested public model alias**, including aliases matched through `"*"`; limits do not create a shared pool across models. Updating an explicit model list to `["*"]`, adding aliases, raising/removing limits, enabling an unavailable profile or altering exemption/ACL grants are widening changes: require administrator or a deliberately **unconstrained** `llm/access/update` grant, not only an owner-scoped or per-profile editor permission.

The Settings UI may display **read-only available system models** derived from the operator-managed configuration (and a verified backend list); model provider credentials and routing are not editable from the profile UI. An eventual system-model CRUD UI would require a separate dynamic provider configuration/Secrets/lifecycle design. Do not introduce a `system_models` SQL table in #3838.


## PostgreSQL schema (logical model)

The following is a **reference SQL shape**, not a shipped migration. Actual names, migrations, indexes, roles and Secrets must follow MAGDA deployment conventions.

```sql
CREATE SCHEMA llm_services;

CREATE TABLE llm_services.access_profiles (
    id UUID PRIMARY KEY,             -- generated once by LLM Services, never reused
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    allowed_models TEXT[] NOT NULL CHECK (cardinality(allowed_models) > 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'ready', 'deleting')),
    allowed_daily_tokens BIGINT CHECK (allowed_daily_tokens >= 0),
    allowed_weekly_tokens BIGINT CHECK (allowed_weekly_tokens >= 0),
    allowed_monthly_tokens BIGINT CHECK (allowed_monthly_tokens >= 0),
    owner_id UUID,
    org_unit_id UUID,
    constraint_exemption BOOLEAN NOT NULL DEFAULT FALSE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE llm_services.profile_managed_roles (
    profile_id UUID NOT NULL
        REFERENCES llm_services.access_profiles(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL CHECK (access_level IN ('use', 'read', 'edit')),
    role_id UUID NOT NULL UNIQUE,
    permission_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (profile_id, access_level)
);

CREATE TABLE llm_services.daily_model_usage (
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

- The LLM-owned `allowed_models TEXT[]` is small, validated and replaced as a unit. `["*"]` is its only wildcard form; enforce exact aliases/uniqueness in the service. There is no model catalogue table in this proposal. An optional array index can be added if actual query volume justifies it.
- `owner_id`, `org_unit_id` and `constraint_exemption` are SQL fields, **not a JSONB Registry `access-control` aspect**; LLM Services maps them to that familiar shape **only in trusted OPA input**.
- The `profile_managed_roles` table replaces `profile_pre_authorised_permissions`. Exactly **three rows for each ready profile** store authoritative **UUID references**, one per access level, to the specific roles/permissions managed by LLM Services in the Authorization API. `role_id` and `permission_id` are not foreign keys to Auth API tables, even when the instance is shared. Actual role memberships, grants and permission constraints live **only in Authorization API**.
- For each profile, create three permissions on **shared `llm/access`** with exact operation URIs: `use -> llm/access/invoke`, `read -> llm/access/read`, `edit -> llm/access/update`. Each has `preAuthorisedConstraint=true`, `userOwnershipConstraint=false`, `orgUnitOwnershipConstraint=false`. Create three managed roles; the **edit role** contains both the profile's `edit` and `read` permission IDs so editors can open the profile UI. The `use` role only invokes, and the `read` role only views. A user can hold more than one role. LLM Services checks exact role/permission ownership before any assignment or cleanup; names/descriptions are informational, not proof of ownership.
- A `profile_managed_roles` row alone never grants access. The caller must be assigned its matching role (or another role explicitly carrying that **same** permission) by the Authorization API. No arbitrary client-supplied permission IDs or role IDs are accepted in profile CRUD. Requiring the **same permission** to appear in both OPA caller permissions and the trusted profile `preAuthorisedPermissionIds` prevents unrelated grants from being accepted.
- `state` is service-owned: `enabled=true AND state='ready'` is necessary for invocation. `revision` is a cheap optimistic concurrency token; a stale `If-Match`/expected version gets `409`. Never hold a SQL lock across a slow external OPA/Auth API call; re-check the version and permission-sensitive before/after state at commit. There is **no** broad SQL transaction spanning the Authorization API.
- Null token ceilings mean unlimited for that period **inside an otherwise entitled profile**; zero means no new bounded non-admin request is admitted for that period. `measured_input_tokens + measured_output_tokens + estimated_tokens` is the usage figure checked against each configured ceiling. Guard integer overflow and double settlement.
- Ownership/exemption metadata controls **management**, never implicitly grants **model invocation**. The model-use grant always requires the matching `invoke` permission, except the existing global administrator override.

### Mapping to the former Registry-shaped contract

| Former field/concept | SQL storage and decision representation |
| --- | --- |
| Profile ID, name, models, enabled, daily/weekly/monthly caps | Columns in `access_profiles` |
| `access-control.ownerId` | `access_profiles.owner_id`, projected to OPA `access-control.ownerId` |
| `access-control.orgUnitId` | `access_profiles.org_unit_id`, projected to OPA `access-control.orgUnitId` |
| `access-control.constraintExemption` | `access_profiles.constraint_exemption`, projected to OPA `access-control.constraintExemption` |
| `access-control.preAuthorisedPermissionIds` | Exactly the three `permission_id` UUIDs from `profile_managed_roles`, projected into OPA `access-control.preAuthorisedPermissionIds` |
| Per-profile user grants | Three managed roles and their Authorization API `user_roles` assignments; **no duplicate user membership table** |
| Model availability/routing | Existing Helm/private LiteLLM configuration, **not** the profile table |

### Deployment and migration ownership

Co-locate the `llm_services` schema on the existing Authorization PostgreSQL instance with a separate least-privilege login and Secret. Prefer MAGDA's existing Authorization DB migrator mechanism with an **explicitly labelled LLM-owned migration** rather than new PostgreSQL infrastructure. Coordinate schema creation, backup/restore, upgrade safety and Secret wiring. Auth API application SQL credentials must not become the LLM SQL credentials and vice versa. Use Auth API service endpoints for its own objects, never cross-schema SQL writes.

For read/list requests LLM Services selects SQL candidate rows and performs **full typed OPA decisions with each trusted profile object**; do not assume users with invoke grants may enumerate profiles or all user memberships. The Admin UI should paginate access-list/member results and fetch personal details via authorized, trusted Auth API endpoints rather than a direct SQL join into the Authorization tables.


## Authorization contract and constraint equivalence

### One typed resource and trusted OPA context

Seed **one** Authorization API resource `llm/access` with operations `llm/access/create`, `llm/access/read`, `llm/access/update`, `llm/access/delete` and `llm/access/invoke`. Add a matching custom OPA delegate for `startswith(input.operationUri, "llm/access/")` in the entrypoint. Do **not** register one resource/operation per profile: the **trusted profile context plus exact pre-authorised permission UUID** scopes the shared operation to one profile.

LLM Services obtains the authenticated caller's session and loads the profile from SQL. It constructs and POSTs the following **trusted decision context** through the Authorization API, which adds the real caller identity/roles/permissions. Clients must **never** supply/override the profile or `access-control` object, permission IDs or the caller user ID:

```json
{
  "object": {
    "llmAccessProfile": {
      "id": "<profile UUID from SQL>",
      "allowedModels": ["*"],
      "enabled": true,
      "access-control": {
        "ownerId": "<owner UUID or null>",
        "orgUnitId": "<orgUnit UUID or null>",
        "preAuthorisedPermissionIds": [
          "<use permission_id from profile_managed_roles>",
          "<read permission_id from profile_managed_roles>",
          "<edit permission_id from profile_managed_roles>"
        ],
        "constraintExemption": false
      }
    }
  }
}
```

`access-control` here is a **projected shape in OPA input**, **not** a Registry aspect or a fourth database table. Its pre-authorised list contains exactly the three profile-managed `permission_id` values (never role IDs or user IDs). Exclude absent/missing IDs rather than synthesizing them; incomplete provisioning must leave the profile non-ready. Treat the `state`, model aliases and requested operation as additional trusted inputs when necessary. The actual policy uses the **same permission object** for all checks below.

For **non-admin** callers:

| Operation | Authorization rule |
| --- | --- |
| `llm/access/create` | The matching unconstrained/owner/orgUnit-constrained global create grant, evaluated on the validated proposed profile (owner defaults to the caller). No pre-authorised create |
| `llm/access/read` | Global unconstrained, owner-scoped, managed-orgUnit-scoped or combined owner+orgUnit grant **OR** a matching pre-authorised profile `read` permission ID |
| `llm/access/update` | Same global constraint alternatives **OR** a matching pre-authorised profile `edit` permission ID; only for permitted types of changes |
| `llm/access/delete` | Global unconstrained, owner-scoped, managed-orgUnit-scoped or combined owner+orgUnit grant; **no auto-managed delete role** |
| `llm/access/invoke` | **Only** an exact matching profile-managed `use` permission: shared `llm/access` resource, `preAuthorisedConstraint=true`, exact `invoke` operation URI and its own ID in the three-ID list. **No** generic owner/orgUnit/unconstrained non-admin fallback for model use |

All OPA checks use the existing global **administrator role override** before typed rules. Administrators can invoke deployment-allowed aliases without a profile or quota and manage everything. Internal service accounts already using administrator authority keep that behaviour.

Permission matching for profile-specific `invoke/read/update` requires **one caller permission** satisfying every applicable predicate: `resourceUri == "llm/access"`, `operations[_].uri == input.operationUri`, `preAuthorisedConstraint == true`, `userOwnershipConstraint == false`, `orgUnitOwnershipConstraint == false` and `id in input.object.llmAccessProfile["access-control"].preAuthorisedPermissionIds`. Merely holding an arbitrary pre-authorised permission for `llm/access` is not sufficient; in particular, a role's `use` permission must not authorize `read/update`, and a role's `read` permission must not invoke.

Global management grants preserve:
- **Owner:** `ownerId == input.user.id`.
- **OrgUnit:** the profile has a real non-null `orgUnitId` equal to one of `input.user.managingOrgUnitIds` (do not inherit generic Registry's null-orgUnit read fallback).
- **Owner + orgUnit:** both predicates must match the **same caller permission**, not be combined from separate grants.
- **Pre-authorised:** exact ID/operation match as above, not a user/role ID match.
- **Exemption:** `constraintExemption=true` plus an `allowExemption=true` grant for the **matching management operation**. A profile's flag alone never authorizes anyone. An exemption does not grant model invocation or change a user's configured model quota.
- **Unconstrained:** no ownership, orgUnit or pre-authorised constraint on a matching global *management* permission.
- **Create:** evaluate the validated proposed owner/orgUnit; do not treat a profile's future pre-authorised mapping as permission to create it.

The behavior follows [typed Access Group policies](../../docs/architecture/access-groups.md), including [ADR 0012](../../docs/adrs/0012-typed-access-group-authorisation.md), and MAGDA's existing OPA permission object schema. Unlike Registry access-group reads, this feature requires **full** OPA evaluations with server-provided data, not Registry partial-evaluation SQL rewriting.

### Prevent privilege escalation through profile edits

- Check `llm/access/update` on **both the current and proposed profile** for a metadata update, including owner/orgUnit and exemptions; prevent a scoped editor from giving their scope away. Re-read the current `revision` before committing, and return `409` if concurrently modified.
- An admin or matching **unconstrained global** `llm/access/update` permission is needed for **widening model aliases** (including enabling `["*"]`), increasing/removing token ceilings, enabling or re-enabling a profile, changing `constraintExemption`, assigning/removing `edit` roles, or changing the SQL-managed role/permission mapping. A profile-scoped editor/owner can safely rename, narrow aliases/reduce caps and assign/revoke **use/read** roles within their own profile. Disabling a profile is a reduction in access.
- The profile's `ownerId` can be changed by an admin or a manager whose **before and after** constrained OPA checks both allow it. This means a user with only an owner-scoped grant cannot hand ownership to another user, while a manager scoped to two orgUnits may move a profile within their managed scope. Validate the target user/orgUnit via trusted Auth API queries.
- Client-submitted `permission_id`, `role_id`, `state` or other internal authority metadata are forbidden. LLM Services performs managed-role assignments only after authorization; no profile editor gets generic `authObject/role/update` or `authObject/user/update` from this feature.

### Managed-role ownership and user grants

Following Access Group design, profile creation automatically creates three role/permission pairs in the Authorization API:
- `use` role holds the profile's pre-authorised `llm/access/invoke` permission.
- `read` role holds the profile's pre-authorised `llm/access/read` permission.
- `edit` role holds the profile's pre-authorised **`llm/access/update` AND `llm/access/read` permissions** (the same read-permission UUID used by the read role). Editors can open the profile UI. The profile still has **exactly three distinct managed permission UUIDs**; the edit role references two of them.

Each role belongs logically to one profile, and its UUID is stored under its `access_level` in `profile_managed_roles`. The SQL mapping lists which role and permission LLM Services **owns**; it does **not** duplicate user-role membership. Query and mutate actual memberships through the Authorization API (e.g. `/v0/auth/users/:userId/roles` and `/v0/auth/roles/:roleId/users`) using an internal trusted session, after checking the caller's typed rights.

Before granting/removing a role or deleting a profile, verify the role and each permission match the stored UUIDs, shared resource URI, operation URI(s), pre-authorised flag and expected role-permission assignments, and aren't unexpectedly shared with unrelated profiles. Do not rely solely on role/permission names or free-text descriptions, which the existing Access Group system partly uses as ownership heuristics. Mismatches fail closed for reconciliation. A future *generic* Authorization API managed-object metadata feature could add nullable `managed_by` + `managed_resource_id` with API-enforced immutability; **do not** introduce redundant `is_system_managed` or broaden #3838's Auth schema just to add these fields.

### Settings → LLM Services → Access Profiles

Introduce a MAGDA Settings section that follows the existing **Settings → Access Groups** UI pattern. It should have a list/create view and per-profile **General**, **Access** and **Usage** tabs. Show only profiles the caller is permitted to read; a use-only grantee may invoke an alias without seeing all profile administration/members.

- **General:** name, enabled, model alias selectors or `All currently available models (*)`, per-model daily/weekly/monthly token limits; owner entered/validated by **user ID**; orgUnit selected from an **authorized orgUnit dropdown** backed by the existing Auth API. Only show editable fields if corresponding typed operations allow them. The UI must clearly warn that wildcard coverage grows automatically with the deployment's available aliases. A read-only system model list is fine; **no provider/model CRUD** in this feature.
- **Access:** list **direct managed-role grants** by user ID, display name where the caller is allowed to view it, and effective `Use`, `View` and `Edit` columns. Support assigning/revoking those access levels to a validated user ID through LLM Services. **Edit implies View** because the managed edit role holds both permissions. A member may have separate Use and Edit roles. List effective access resulting from these **managed roles**; do **not** claim it enumerates all users who can manage through admin/owner/orgUnit/custom global permissions. Separate those categories visually if displayed.
- **Usage:** display authorized aggregate measured + estimated token totals by user, selected model, day/week/month, and profile's limits; explain **usage is keyed by user and public model alias**, so usage is shared among all profiles granting that model, not attributable to a unique profile.
- **Access management authorization:** manage users only when a caller has the effective `llm/access/update` on this profile. Scoped editors may assign/remove `use` and `read` roles. Assigning/removing the powerful `edit` role requires admin or **unconstrained global update** rights. The UI must not permit an editor to elevate their own grants by altering permission metadata or model quotas.

Offer these **LLM Services-only** user-management endpoints (paths relative to `/api/v0/llm`), with server-side typed checks, paginated member results and no direct browser access to the Auth API's powerful role-mutation endpoints:

```text
GET    /access-profiles/:id/users
POST   /access-profiles/:id/users/:userId    body: {"accessLevels":["use","read"]}
PUT    /access-profiles/:id/users/:userId     body: {"accessLevels":["use","edit"]}
DELETE /access-profiles/:id/users/:userId
```

POST adds specified managed grants idempotently, PUT replaces the user's **managed** grants for this profile (with authorization for both removals and additions), and DELETE removes only this profile's managed grants. GET includes the direct managed grants and pagination; it requires profile `update` rather than just `read` because member listing reveals other users. If a user has separately assigned unrelated roles or global permissions, these endpoints do not touch or enumerate those. A service-admin identity can perform the internal Auth API assignment, but never bypasses the **external caller's** profile-level and elevation checks. Use a targeted Auth API member-list capability or strictly bounded trusted lookup; do not give normal profile managers system-wide `authObject/user/read` permission merely to use this UI.

## Public LLM Services endpoints

OPA operation URIs are **typed authorization identifiers**, distinct from HTTP paths.

| HTTP under `/api/v0/llm` | Required permission | Behaviour |
| --- | --- | --- |
| `POST /access-profiles` | `llm/access/create` on proposed SQL row | Validate and create pending profile with three managed roles and permissions |
| `GET /access-profiles` | `llm/access/read` on each current row | Filter visible profile metadata |
| `GET /access-profiles/:id` | `llm/access/read` on actual row | Read a permitted profile; no member list leakage |
| `PUT /access-profiles/:id` | `llm/access/update` on old+new row | Edit metadata; wider grants/aliases/quotas restricted |
| `DELETE /access-profiles/:id` | `llm/access/delete` on current row | Disable first, then remove only owned managed roles/permissions |
| `GET /access-profiles/:id/users` | `llm/access/update` on row | List direct managed role assignments only |
| `POST/PUT/DELETE /access-profiles/:id/users/:userId` | `llm/access/update` + elevation checks | Grant, replace or revoke **only** this profile's three managed roles |
| `GET /v1/models` | Effective per-alias invoke access | Return only deployment-allowed, currently served aliases available through caller's enabled ready profiles |
| `POST /v1/chat/completions` and `POST /v1/responses` | Effective `llm/access/invoke` on an eligible profile | Provider proxy with per-user/model soft accounting |

For a normal caller invocation requires: (1) requested public alias is deployment-allowed and backend-served; (2) at least one **enabled, ready** profile includes that alias explicitly or via `["*"]`; (3) caller has the **exact profile-managed invoke permission** confirmed by OPA with trusted context; (4) the user's **same-model** daily/weekly/monthly usage is below all configured ceilings of **at least one whole profile**. Do not allow the caller to select a more permissive profile by supplying an ID. Same-model profiles are **OR/non-stacking**: never aggregate allowances or combine separate profiles' best individual ceilings. Distinct model aliases have distinct counters. Admins bypass profiles/quotas but still obey deployment model allowlist.

Caller-specific list/discovery/profile responses require `Cache-Control: private, no-store` to defeat public GET caching. Never expose model credentials, SQL Secrets, managed role IDs, internal exceptions, provider error bodies or unauthorized member identities to unprivileged clients. The user-management UI may show its own managed role IDs to authorized administrators for diagnostics, but never permit clients to mutate IDs directly.

## Profile lifecycle: SQL transactions + cross-API recovery

SQL transactions cannot atomically modify Authorization API roles/permissions/assignments, even when sharing a physical PostgreSQL instance. Keep operations idempotent, scoped and fail-closed:

1. **Seed globally:** provision the shared `llm/access` resource, five stable operation URIs and custom OPA delegate/policy. No per-profile Authorization API resource/operation registration is needed.
2. **Create profile:** server generates a UUID, validates proposed owner/orgUnit/model rules, checks `create` and inserts `state='pending'`. Create **three** pre-authorised permissions and three managed roles through trusted Auth API calls; link each role to the correct permission(s), and persist the three pairs in `profile_managed_roles` (safe staged commits are permitted). Mark `ready` only when all expected pairings exist and are verified. A failure leaves it pending/non-invokable for repair; no automatic grants to the creator except any global ownership-based management rights.
3. **Assign/manage users:** authorize the caller's `update` and per-access-level elevation rules. Check exact profile-owned role/permission UUIDs and assignments first, then use trusted Auth API role-assignment endpoints. Only managed-role membership changes; no direct generic Auth role editor or blanket user privileges are exposed. Revoke before claiming success; if a remote call partially fails, return a truthful error and reconcile only this profile's managed grants.
4. **Update profile:** check old and proposed OPA context, check `revision` via optimistic compare-and-swap and transactionally change metadata. A restrictive change (disable/narrow quotas/models) takes effect for subsequent admission; already running streams may finish. Do not hold a long SQL transaction across Auth API/OPA requests.
5. **Delete profile:** check typed delete, first set `state='deleting', enabled=false` in SQL. Remove only verified owned user-role assignments, roles and permissions using Auth API, then delete SQL rows. Do not delete someone else's shared role/permission. An orphaned Auth permission alone cannot pass the OPA pre-authorised **ID-in-profile** check without a live ready profile; retain pending/deleting on failure.
6. **Repair:** verify all three owned role/permission pairs, mapping IDs, allowed operations and membership links; resume pending/deleting operations idempotently, without adopting foreign objects or reusing deleted profile UUIDs. A missing pair or incorrect pre-authorised flag means the profile must not be `ready`. Provide operator diagnostics without exposing Secrets.
7. **No ID reuse:** only LLM Services allocates profile UUIDs; reject collisions and malformed IDs. The profile ID and managed-role/permission identity may not be edited by clients.

Use role/permission descriptions as useful labels only, **never the sole ownership proof**; compare persisted UUIDs and Auth API resource/operation/role membership invariants. Do not introduce `is_system_managed` or `managed_by` migration in this LLM-only feature; a future cross-platform Auth API managed-resource design could incorporate protected metadata for multiple services.

## Soft usage ledger and model-based quota evaluation

Use **total input + output tokens** for the operational budget guardrail. Treat provider reasoning tokens as part of output and cache-read input tokens as part of input; **never double count**. This is an approximate volume metric, not a currency bill (different models/input/output/cache have different pricing).

The quota key is **authenticated MAGDA user UUID plus requested public model alias**. Same-model profiles look at the same ledger; different model aliases have independent ledgers even when routed to the same underlying provider. Never use the client-supplied `user` field, profile ID, DSH session, API key or provider ID as the counter identity.

- Extract Chat Completions `usage.prompt_tokens` and `usage.completion_tokens`, or Responses `usage.input_tokens` and `usage.output_tokens` (normally nested under the terminal `response.usage` for streamed Responses). Count **one validated final snapshot per forwarded facade request**, not one debit per usage event, completion marker, conversation or tool invocation. Check `total_tokens = input + output` when present; reasoning/cached token details are subsets and must never be added again. Streaming SSE observation must preserve raw bytes, chunk order, headers and backpressure; never reconstruct provider output, buffer whole streams or log prompts/responses.
- Accept **valid final usage from `response.completed` or `response.incomplete`**, and from `response.failed` only when a valid usage snapshot is actually supplied. Chat streaming usage normally arrives in a final usage-bearing chunk before `[DONE]`. Treat provider `[DONE]` after a Responses terminal as **another marker, not another billable request**. Before terminal, later validated snapshots can supersede earlier provisional ones; freeze on the first authoritative terminal. A Chat `finish_reason` alone is **not** a streaming terminal. Never sum duplicate, conflicting or provisional usage events. Invalid, absent or oversize terminal metadata is **unknown**, not an exact zero.
- On missing authoritative final usage (cancellation, incomplete background request, provider error, timeout, malformed/oversize event or process interruption), apply one documented **approximate fallback** when upstream processing may have occurred. Record it as `estimated_tokens`/`estimated_requests`, never also as measured input/output. A request refused before forwarding to LiteLLM costs no tokens in our ledger. Avoid a fallback based solely on visible output characters: hidden reasoning, cached/repeated input and background generation are not reflected in visible text. A conservative estimate may use coarse request-input size plus a configured model output allowance; it is not a tokenizer or billing guarantee. No reservation/atomic pre-debit is required in v8: modest concurrent and termination-related under-accounting is an accepted *soft* limit.
- Perform one atomic daily `INSERT ... ON CONFLICT ... DO UPDATE` increment after a request is settled. Use the **operator-configurable IANA timezone `Australia/Sydney` by default**, e.g. Helm `global.llmServices.usage.timeZone: Australia/Sydney` (confirm the actual chart value path when wiring the deployment). Compute `local_date` from the **request's admission/start timestamp** in that timezone, rather than the finish timestamp: the same user/model quota period governs both admission and settlement even when a long stream crosses midnight/month end. This is a practical, documented soft-limit convention. Log operational timestamps in UTC; handle Sydney DST transitions without fixed UTC offsets. Changing a live deployment's timezone requires an explicit rebucket/reset plan, not silently reinterpreting existing dates.
- **Daily, weekly and monthly all come from the single daily table.** For the authenticated `user_id` and requested `model_alias`, sum `measured_input_tokens + measured_output_tokens + estimated_tokens` for (a) today's local date, (b) dates from local **ISO Monday** through the next Monday, and (c) dates from the local **first of calendar month** through the next month's first day. Use half-open `local_date >= period_start AND local_date < period_end`; no weekly/monthly rollup tables or background job. One model has distinct counters for each user, and the same-model usage row is shared across all profiles that allow the model.
- **Soft cutoff:** check persisted counters **before** each forwarded model request, allow eligible profiles when usage is *below every configured limit*, and deny when exhausted. No mandatory reservations or midstream cutoff. Concurrent admitted requests may overshoot; this is accepted and not billing-grade. A single DSH turn may involve several model requests: count initial generation, tool-call request, post-tool continuation and auxiliary/background (e.g. title) requests **independently**, all against the authenticated MAGDA user and each request's alias. A background request cancelled during shutdown must follow the same missing-terminal estimate policy; do not count only the visible final response.
- If a **required** ledger read/write facility is unavailable, fail **bounded non-admin** requests with a safe `503` rather than silently allow unchecked spending; admins and explicitly unbounded access still follow their normal policy. An incomplete provider usage value is different: use the documented estimate. Monitor DB write failures so they don't become invisible loss of quota protection.
- Expose aggregate totals/estimation counts to authorized operators, with a retention/cleanup policy. Do not store raw prompt text, output content or LiteLLM master/provider secrets. Consider provider-side budget alerts independently for financial safety.

**Helm and accounting window example (proposed config):**

```yaml
global:
  llmServices:
    usage:
      timeZone: Australia/Sydney
```

For 21 November 2026 in Sydney, the daily period is `2026-11-21`, the ISO weekly period is `2026-11-16 <= local_date < 2026-11-23`, and the calendar monthly period is `2026-11-01 <= local_date < 2026-12-01`. A request started at 23:59 on 30 November is attributed to **30 November**, even if the response completes in December. Timezone changes or delayed settlements across windows are accepted limitations of a soft quota, not separate billing accounting.

**PoC conclusion:** [#3934](https://github.com/magda-io/magda/issues/3934) / [draft PR #3936](https://github.com/magda-io/magda/pull/3936) establish that the currently pinned LiteLLM version exposes usable usage metadata and allows byte-preserving observation for the **tested OpenAI Responses + installed DSH route**. No LiteLLM version upgrade is justified solely by this PoC. These findings do not validate other providers, model-specific provider accounting, production timeout races, browser UI rendering or billing accuracy. LiteLLM remains network-private and stateless, without its own database, Redis, virtual-key management or budget enforcement subsystem.

### Endpoint-specific usage observation, based on PoC #3936

Implement the **same high-level accounting contract** for both supported proxy endpoints but **do not use the same request options or event envelope**:

| API / request mode | Proven format on tested route | Required handling |
| --- | --- | --- |
| Chat Completions, non-streaming | `usage.prompt_tokens`, `completion_tokens`, `total_tokens` | Validate the JSON usage snapshot and debit once |
| Chat Completions, streaming | Final usage-bearing `chat.completion.chunk`, followed by `[DONE]` | In pinned LiteLLM 1.81.12, omitted/`true` `stream_options.include_usage` produced usage but explicit `false` suppressed it. For supported Chat backends, LLM Services should **ensure usage is requested** for quota-controlled calls, with endpoint/provider compatibility tests; never accept `false` as an implicit free call. If metadata cannot be requested safely, debit a marked estimate |
| Responses, non-streaming | `usage.input_tokens`, `output_tokens`, `total_tokens` | Validate the JSON response |
| Responses, streaming | Terminal `response.completed` or `response.incomplete` contains nested `response.usage`; tested streams also end with `[DONE]` | **Never inject Chat-specific `stream_options`**; this route returned HTTP 400 for both `include_usage:true` and `false`. Accept terminal usage even when the response is incomplete; avoid duplicate debit for `[DONE]` |

The pinned LiteLLM installation did **not** expose evidence of an `always_include_stream_usage` configuration option; do not rely on it. The actual tested model rejected **tool-bearing Chat Completions requests**, regardless of usage settings; installed DSH advertises tools even for ordinary tasks. **Responses is the verified DSH route for that provider**, not proof that a Chat-based DSH tool loop works for other models.

Use a **bounded, metadata-only observer** for `text/event-stream` that handles arbitrarily fragmented chunks, UTF-8 and CRLF boundaries and event types without changing the forwarded bytes. The PoC uses a **64 KiB SSE-event buffer** and **1 MiB non-streaming JSON cap** as *tested defaults*, not universal provider guarantees. Set explicit production bounds, count dropped/oversized/malformed or unknown-format events, and use the estimated-usage path if the final usage cannot be read. Observing a complete upstream stream does not prove the downstream client received every byte; protect normal proxy cancellation/backpressure behaviour. A standalone loopback tap was used only to prove feasibility, not prescribed as a new production network hop. Keep the observer inside the eventual proxy path and ensure accounting failures don't corrupt model output.

For any request that reaches LiteLLM, use a single **settlement** outcome: (a) validated final usage, or (b) estimated usage when no validated final usage is available and upstream processing may have occurred. Preserve the distinction between `terminalSeen` and `usageFinal`: a terminal with invalid/missing usage is **not** final metering. Implement idempotent settlement within the request lifecycle to avoid duplicate database upserts from repeated events, close/error callbacks or `[DONE]`; process crashes before settlement remain an explicit soft-quota limitation. Retain only safe aggregate counters and metric-quality flags, not raw response frames or tool arguments.

### PoC evidence and limits (20 November 2026)

The [live findings](https://github.com/magda-io/magda/blob/poc/3934-litellm-usage-observer/magda-llm-services/poc/live-findings.md) in [draft PR #3936](https://github.com/magda-io/magda/pull/3936) report:

- Bundled `ghcr.io/berriai/litellm:main-v1.81.12-stable`, installed LiteLLM **1.81.12**, running architecture-specific imageID digest `sha256:bbe33922e37bb76a065f85b847cb34744e98b408df66c6c4b4425e48b9e8c573` (not necessarily a multi-architecture manifest digest).
- **One real configured OpenAI route** (`openai/gpt-6.1-sol` behind `magda-agent-default`) and actual installed DSH **0.2.1-alpha.1**, tested in isolated minikube headless sessions using the existing MAGDA facade. Responses ordinary streamed requests and real bash tool-call/continuation requests succeeded with an observational tap. Reported observer data matched the tested input/output totals without mutating source buffers. This is **not browser UI testing**.
- A real DSH tool continuation returned input **4,312** + output **18** = total **4,330**, including cached-input **4,223** (within input) and reasoning **11** (within output). A real concurrent title request ended `response.incomplete` with valid usage. **Five wire requests** were seen during the observed DSH run, but only **four** completed the observer's final reporting before shutdown — in-flight auxiliary traffic is not always final-meterable.
- The PoC PR reports **50 passing automated tests**, including fragmented SSE parsing, byte preservation, backpressure and cancellation. Offline fixtures are synthetic, while the live-provider/DSH results are separately identified. The observer was exercised on the unchanged production facade via a temporary loopback hop; the PoC **does not implement** a production metering interceptor, authenticated-user quota DB, reservation/deduplication or budget cutoff.
- **Not verified:** Anthropic, Bedrock, Azure, alternative OpenAI-compatible backends, browser sessions, all failure races, provider billability/cost or accuracy of inferred provider usage. Require new provider-specific compatibility tests as those backends are supported; don't mark their metering as proven by the OpenAI observations.

This evidence supports proceeding with **MAGDA-owned, approximate token-volume accounting** and keeping the current pinned LiteLLM version for the tested Responses route. It does **not** change SQL ownership/profile schema, typed OPA permissions, or administrator behaviour.


## Verification and delivery

- [ ] Clean v8 deployment (no released-user migration); Workspace access and independent LLM invocation rights separated; unchanged global admin override and deployment model allowlist.
- [ ] SQL schema migrations/bootstrap/least-privilege LLM connection co-located with existing Auth PostgreSQL deployment; backup and failure handling; no new Postgres server or Redis.
- [ ] A **shared `llm/access` resource** and typed OPA policy evaluate server-fetched SQL profile data with an `access-control` shape containing **exactly three managed permission UUIDs**. Test use/read/edit isolation, `preAuthorisedConstraint=true`, wrong IDs/resource URI/operations, owner, managed orgUnit, combined same-permission constraints, `allowExemption`, null orgUnit, forged caller context and broadening privilege checks.
- [ ] Profile creation provisions three pre-authorised permissions and three managed roles via Auth API. Verify edit-role includes read permission, scoped use/read/edit memberships, list/add/revoke/update user grants through LLM Services, ownership checks independent of mutable descriptions, pending/deleting recovery and no stale-role or permission-ID resurrection. Old/new profile OPA decisions and `revision` CAS prevent stale updates; no cross-service DB writes.
- [ ] `allowed_models=["*"]` expands only to currently available, deployment-allowed aliases; reject mixed/unknown aliases and ensure adding aliases, wildcard or higher quotas requires unconstrained update/admin. Same-model OR without stacking/independent-limit mixing, separate A/B counters, per-user quotas and unchanged global administrator override. No special non-admin wildcard authorization operation or SQL model catalogue.
- [ ] Helm-configured `Australia/Sydney` default and explicit UTC override, DST boundaries, ISO Monday/weekly and calendar-month daily-row summations, period transition while a stream is running and concurrent SQL upserts; count measured or estimated usage **once per upstream request** including tool continuations/background title requests and never separately add reasoning/cached subsets.
- [ ] Integrate with pinned LiteLLM and actual DSH Responses streaming, preserving bytes/tool-call argument chunks; test final `response.completed`, `response.incomplete` with usage, `[DONE]` duplicate markers, Chat usage toggles, cancelled/missing-terminal/oversized events, timeouts, and exact no-charge cases before upstream dispatch.
- [ ] For Chat streaming `include_usage:false`, ensure bounded ordinary callers cannot suppress metering to evade quota (controlled endpoint-specific request normalization when compatible, otherwise estimated debit). Confirm the Responses path **never** gets Chat-specific `stream_options`. Provider compatibility tests are needed for other model routes before claiming broad support.
- [ ] Settings → LLM Services list/General/Access/Usage tabs: owner user ID, authorized orgUnit dropdown, model wildcard warning, paginated direct user grants with use/view/edit, edit implies view, only managed roles mutated, no accidental leakage of global/administrator user memberships. Filter non-admin profiles/models; `Cache-Control: private, no-store`; safe 401/403/409/429/503 responses.
- [ ] After feature implementation, update maintained LLM architecture, operator guide, security/OPA and end-to-end tests; until then **do not describe profiles/limits as shipped**.

**Delivery:** #3838 implements SQL profile management, managed per-profile role grants, model entitlements and approximate **per-model usage limits together**, building on the positive provider-specific evidence in #3934/#3936. No billing-grade reservations, user-facing dollar accounting, or LiteLLM Postgres/Redis integration is part of this scope.
