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
- **No special non-admin wildcard invocation operation** (`llm/access/*/access`). A normal profile with `allowed_models=['*']` and nullable/unlimited ceilings gives administrators a controlled way to grant unrestricted use to selected users. MAGDA's existing global OPA administrator override remains.
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

Every daily/weekly/monthly ceiling applies **separately to each requested public model alias**, including aliases matched through `"*";` limits do not create a shared pool across models. Updating an explicit model list to `["*"]`, adding aliases, raising/removing limits, enabling an unavailable profile or altering exemption/ACL grants are widening changes: require administrator or a deliberately **unconstrained** `llm/access/update` grant, not only an owner-scoped or per-profile editor permission.

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

Seed the base `llm/access` resource with management operations `llm/access/create`, `read`, `update`, `delete`; special explicit unrestricted invocation operation `llm/access/*/access`; and per-created-profile resource `llm/access/<uuid>` with operation `llm/access/<uuid>/access`. Per-profile operation IDs, resource identifiers, role/permission memberships and assignment remain inside the **Authorization API**, not duplicated as SQL ownership/grant tables. Create/delete those using LLM Services' internal trusted Auth API calls, **never direct writes to the authorization database tables**.

**Preserve MAGDA's existing global OPA administrator override** (`entrypoint/allow.rego`). Administrators may manage/access all profiles and invoke any deployment-allowed model without quotas. Internal services using their existing default administrator credentials are unaffected. This is not a new special-case OPA override. The explicit wildcard invocation grant exists for non-admin trusted callers and does not bypass the deployment model allowlist or basic request safety. Its literal `*` is matched by a custom rule, never treated as a general string glob.

OPA evaluates a **full, exact operation decision** using Auth API's trusted user permissions and server-fetched/proposed profile context, e.g. `input.object.llmAccessProfile` for management. LLM Services, not the client, constructs that input. For the normal management resource `llm/access`:

| Grant/constraint | Required behaviour |
| --- | --- |
| No constraint | Matching operation grants management of any profile |
| Ownership | Profile `owner_id` equals the authenticated user ID |
| OrgUnit | Non-null profile `org_unit_id` belongs to one of the user's **managed** orgUnit IDs; null never matches |
| Owner AND OrgUnit | Both constraints must match on the **same** granted permission and profile |
| Pre-authorised | A **single matching caller permission** must have the correct `resourceUri`, operation URI and `preAuthorisedConstraint=true`, and **its own ID** must be in `profile_pre_authorised_permissions` for that profile |
| Constraint exemption | `constraint_exemption=true` AND caller holds a permission for the **same management operation** with `allowExemption=true`. This bypasses normal object scope for **that operation only**, not every operation or invocation right |
| Admin | Existing global admin override, regardless of profile owner/orgUnit/flags; deployment model allowlist still applies to model calls |

These are aligned with `magda-opa/policies/common/verifyRecordPermission.rego`, `magda-opa/policies/object/agentSkill/allow.rego` and `object/accessGroup/allow.rego`, but are deliberately explicit about absent orgUnits (no implicit read fallback), matching **one permission ID** for pre-authorisation, and permission-scoped exemptions. Avoid reimplementing authorization in SQL. The operation-specific `allowExemption` behaviour applies to matching read/update/delete grants when configured. A record's exemption flag alone never grants a caller access.

**Create** checks `llm/access/create` on the validated *proposed* row. An ownership-constrained create requires `owner_id` to be the caller; an orgUnit-constrained create requires an orgUnit they manage; combined constraints must both match. A pre-authorised create is not meaningful without an existing profile, so do not grant create through that constraint by default. The new profile does **not** automatically grant invocation or visibility to all users.

**Read** checks `llm/access/read` on each current SQL row. A caller who only holds a `llm/access/<id>/access` invocation entitlement does not automatically see the profile's owner, pre-authorised IDs or token configuration. The `/v1/models` endpoint separately uses invocation rights and returns only authorized aliases.

**Update** checks `llm/access/update` against **both original and proposed** profile values; this includes changes to owner/orgUnit, exemption flag and pre-authorised IDs. The SQL transaction locks/re-reads the row and verifies the expected `revision` before committing, so an authorization decision cannot be reused against a concurrently changed record. To avoid a privilege escalation through modifying the authorization context itself, require **unconstrained `llm/access/update`** (or administrator) to set/clear `constraint_exemption` or change the pre-authorised mapping. Other field changes may use constrained update permissions when both before/after decisions allow them. Profile ID and `state` remain immutable to callers.

**Delete** checks `llm/access/delete` against the current row and retires the profile using the lifecycle below. Callers cannot grant themselves arbitrary Auth API permissions merely by creating or updating a profile.

OPA policy should explicitly test constraint combinations (owner-only, orgUnit-only, both, pre-authorised and exemption). Use the same *permission object* for checking matching operation and matched pre-authorised UUID; do not use unbound permission indices that could mix IDs from unrelated grants. Existing global admin role overrides decisions by design.

### Non-admin model entitlement

Model use checks the caller's exact `llm/access/<profile-id>/access` operation (or the explicit `llm/access/*/access` grant) via the Auth API. Only **unconstrained** per-profile invocation grants are supported initially; profile ownership/orgUnit/pre-authorised mappings describe **management**, not *who has an invocation entitlement*. This avoids accidentally giving profile owners the ability to consume the model or mixing two separate scopes.

For a normal caller, an invocation is permitted only when: (1) alias is deployment-allowed; (2) some `enabled=true, state='ready'` profile lists that alias; (3) the exact corresponding Auth API operation is granted; and (4) the **user's usage for this alias** satisfies all ceilings within that profile. At no point can a client select a more permissive profile by submitting its ID.

For multiple granted profiles: **OR**, no stacking, and one user/model counter across profiles. The service evaluates each candidate profile's **whole combination** of day/week/month limits; never synthesize a fictional profile by taking independent maxima from different profiles. Profile A's usage does not exhaust profile B when they cover *different models*. Same-model eligible profiles effectively allow the largest suitable capacity without accumulating allowances. A disabled/deleted profile or orphan grant never authorizes a request.

## Public LLM Services endpoints

OPA operation URIs are **permission identifiers**, distinct from HTTP paths.

| HTTP under `/api/v0/llm` | Required permission | Behaviour |
| --- | --- | --- |
| `POST /access-profiles` | `llm/access/create` | Validate proposed SQL profile, create pending entry and dynamic Auth API operation |
| `GET /access-profiles` | Per-record `llm/access/read` | Return filtered administrative rows, excluding secrets and internal lifecycle details |
| `GET /access-profiles/:id` | `llm/access/read` on actual row | Read profile; otherwise deny without metadata leak |
| `PUT /access-profiles/:id` | `llm/access/update` on before+after | Atomically edit profile and pre-authorised mapping, protect restricted metadata changes |
| `DELETE /access-profiles/:id` | `llm/access/delete` on current row | Disable first and complete revocation/cleanup safely |
| `GET /v1/models` | Effective per-alias model access | Filter allowed models without exposing management metadata |
| `POST /v1/chat/completions` and `POST /v1/responses` | Effective alias access | Proxy calls and soft usage tracking |

Do not add `/v1/messages` just for completeness; implement it only if a supported consumer requires it. Set `Cache-Control: private, no-store` on caller-specific discovery and profile responses to override MAGDA Gateway's public GET default. Never include SQL credentials, provider keys or private administrative metadata in errors or logs.

## Profile lifecycle: SQL transactions + cross-API recovery

An LLM-owned SQL transaction can update profile fields and pre-authorised links together, **but cannot transactionally create/delete Auth API permissions**. Plan idempotent steps, fail-closed reads and a repair path:

1. **Create:** LLM Services assigns a UUID (never reused), validates owner/orgUnit and the entire profile, checks caller's typed create permission, and inserts `state='pending'` in SQL. Register resource/operation through Auth API using trusted service authority and verify the expected URI/IDs. Change `state='ready'` in SQL only on success; preserve the user's requested `enabled` value. A failed registration leaves the row non-invokable for retry/repair. No automatic grant.
2. **Update:** Full authorization on original and proposed row; atomically update profile fields and its permission-ID mapping. Restriction/disable must take effect for subsequent admission; an existing stream may complete. Authorization resource/operation URI does not change because ID is immutable.
3. **Delete:** After typed delete authorization, mark `state='deleting', enabled=false` in SQL first. Revoke/remove Auth API resource/operation and related owned permissions/grants using ownership checks; then delete SQL row. Failures remain `deleting` for safe retry, never re-enable automatically.
4. **Repair:** check pending/deleting rows and missing/mismatched Auth API resources. Ensure existing operations belong to the expected profile before deleting, and never automatically adopt unrelated permissions. An orphan entitlement never authorizes if a matching `ready` profile is missing.
5. **No ID reuse:** UUID identifiers are minted for each creation and are not client-provided; never resurrect a deleted identifier. Validate operation URI/path encoding; reserved `*` is not a profile identifier. The rare theoretical UUID collision must fail creation rather than overwrite an existing row.

A service-admin identity may be used for internal Auth API coordination, consistent with other MAGDA service integrations; the **external caller's** management rights must still be checked before acting. Avoid ever exposing that internal authority through a public API.

## Soft usage ledger and model-based quota evaluation

Use **total input + output tokens** for the operational budget guardrail. Treat provider reasoning tokens as part of output and cache-read input tokens as part of input; **never double count**. This is an approximate volume metric, not a currency bill (different models/input/output/cache have different pricing).

The quota key is **authenticated MAGDA user UUID plus requested public model alias**. Same-model profiles look at the same ledger; different model aliases have independent ledgers even when routed to the same underlying provider. Never use the client-supplied `user` field, profile ID, DSH session, API key or provider ID as the counter identity.

- Extract Chat Completions `usage.prompt_tokens` and `usage.completion_tokens`, or Responses `usage.input_tokens` and `usage.output_tokens` (normally nested under the terminal `response.usage` for streamed Responses). Count **one validated final snapshot per forwarded facade request**, not one debit per usage event, completion marker, conversation or tool invocation. Check `total_tokens = input + output` when present; reasoning/cached token details are subsets and must never be added again. Streaming SSE observation must preserve raw bytes, chunk order, headers and backpressure; never reconstruct provider output, buffer whole streams or log prompts/responses.
- Accept **valid final usage from `response.completed` or `response.incomplete`**, and from `response.failed` only when a valid usage snapshot is actually supplied. Chat streaming usage normally arrives in a final usage-bearing chunk before `[DONE]`. Treat provider `[DONE]` after a Responses terminal as **another marker, not another billable request**. Before terminal, later validated snapshots can supersede earlier provisional ones; freeze on the first authoritative terminal. A Chat `finish_reason` alone is **not** a streaming terminal. Never sum duplicate, conflicting or provisional usage events. Invalid, absent or oversize terminal metadata is **unknown**, not an exact zero.
- On missing authoritative final usage (cancellation, incomplete background request, provider error, timeout, malformed/oversize event or process interruption), apply one documented **approximate fallback** when upstream processing may have occurred. Record it as `estimated_tokens`/`estimated_requests`, never also as measured input/output. A request refused before forwarding to LiteLLM costs no tokens in our ledger. Avoid a fallback based solely on visible output characters: hidden reasoning, cached/repeated input and background generation are not reflected in visible text. A conservative estimate may use coarse request-input size plus a configured model output allowance; it is not a tokenizer or billing guarantee. No reservation/atomic pre-debit is required in v8: modest concurrent and termination-related under-accounting is an accepted *soft* limit.
- Perform one atomic daily `INSERT ... ON CONFLICT ... DO UPDATE` increment. Use one operator-configured IANA timezone (default UTC); `local_date` is the completion day in that timezone. Sum daily rows for weekly ISO Monday–Sunday windows and calendar months. Record times in UTC for operational logs and handle DST boundaries. Changing timezone requires an explicit reset/rebucket plan.
- **Soft cutoff:** check persisted counters **before** each forwarded model request, allow eligible profiles when usage is *below every configured limit*, and deny when exhausted. No mandatory reservations or midstream cutoff. Concurrent admitted requests may overshoot; this is accepted and not billing-grade. A single DSH turn may involve several model requests: count initial generation, tool-call request, post-tool continuation and auxiliary/background (e.g. title) requests **independently**, all against the authenticated MAGDA user and each request's alias. A background request cancelled during shutdown must follow the same missing-terminal estimate policy; do not count only the visible final response.
- If a **required** ledger read/write facility is unavailable, fail **bounded non-admin** requests with a safe `503` rather than silently allow unchecked spending; admins and explicitly unbounded access still follow their normal policy. An incomplete provider usage value is different: use the documented estimate. Monitor DB write failures so they don't become invisible loss of quota protection.
- Expose aggregate totals/estimation counts to authorized operators, with a retention/cleanup policy. Do not store raw prompt text, output content or LiteLLM master/provider secrets. Consider provider-side budget alerts independently for financial safety.

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
- [ ] Ownership, managed-orgUnit, combined constraint, exact pre-authorised permission-ID mapping and `allowExemption` decisions match the table above. Include negative tests for wrong permission ID, non-manager, null orgUnit, fake caller context, exemption without matching grant, and restricted metadata edits.
- [ ] Creation, updates (old+new context), deletion, retry/repair of SQL pending/deleting and Auth API partial failures; no stale grant resurrection, UUID reuse or unexpected cross-service DB writes.
- [ ] Same-model OR without quota stacking or independent-limit mixing, independent model A/B counters, per-user rather than shared budgets, administrator/unbounded access.
- [ ] Timezone day/week/month/DST and concurrent SQL upserts; count measured or estimated usage **once per upstream request** including tool continuations and background title requests; never separately add reasoning/cached subsets.
- [ ] Integrate with pinned LiteLLM and actual DSH Responses streaming, preserving bytes/tool-call argument chunks; test final `response.completed`, `response.incomplete` with usage, `[DONE]` duplicate markers, Chat usage toggles, cancelled/missing-terminal/oversized events, timeouts, and exact no-charge cases before upstream dispatch.
- [ ] For Chat streaming `include_usage:false`, ensure bounded ordinary callers cannot suppress metering to evade quota (controlled endpoint-specific request normalization when compatible, otherwise estimated debit). Confirm the Responses path **never** gets Chat-specific `stream_options`. Provider compatibility tests are needed for other model routes before claiming broad support.
- [ ] Non-leaking model discovery, management-list filtering and `Cache-Control: private, no-store`; safe 401/403/429/503 errors.
- [ ] After feature implementation, update maintained LLM architecture, operator guide, security/OPA and end-to-end tests; until then **do not describe profiles/limits as shipped**.

**Delivery:** #3838 implements profile management, model entitlements and approximate **per-model usage limits together**, after #3934 establishes metering feasibility. No billing-grade reservations, user-facing dollar accounting, or LiteLLM Postgres/Redis integration is part of this scope.
