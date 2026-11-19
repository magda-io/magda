# Registry-backed LLM Access Profiles and soft usage limits

**Status:** Proposed implementation-ready design for [#3838](https://github.com/magda-io/magda/issues/3838), **not yet implemented**. MAGDA v8 is unreleased; only local test deployments exist. This design supersedes the earlier October 2026 access-profile proposal and requires no released-user migration.
**Maintained implementation:** [LLM Services](../../docs/architecture/llm-services.md), [Workspace security](../../docs/architecture/agent-workspace-security.md), and [deployment](../../docs/agent-workspace-deployment.md).
**Owner:** MAGDA LLM Services, not Agent Manager, DSH, Registry API, or LiteLLM.

## Purpose and boundaries

The existing merged #3850 facade authenticates requests, checks `agentWorkspace/access`, enforces the deployment-wide `llm-services.allowedModels` list, and proxies `/v1/chat/completions` and `/v1/responses` to internal LiteLLM. The new contract makes the facade reusable for any authorized MAGDA client, without needing Workspace access.

- **Gateway:** normal MAGDA authentication/session and public `/api/v0/llm/...` routing.
- **LLM Services:** the only public LLM policy and profile-management facade; resolves actual caller, owns validation, per-model entitlement checks, soft usage accounting and access-profile lifecycle.
- **Registry:** stores `llm-access-profile` records; it is not the feature's public CRUD API.
- **Authorization API / OPA:** owns grants/roles and the yes/no entitlement and management decisions. OPA is stateless and does not store usage.
- **LiteLLM:** private, statically configured provider/router behind LLM Services. It keeps provider secrets, not MAGDA user grants. No LiteLLM PostgreSQL, Redis, virtual-key lifecycle, or Admin UI is required for this design.
- **Workspace:** retains its separate self-only `agentWorkspace/access` permission for lifecycle/runtime access. When DSH invokes a model, that user also needs the applicable LLM entitlement. Direct non-Workspace clients only need their LLM entitlement.

The deployment allowlist is always a separate outer bound and MUST be checked in LLM Services **even for administrators**. Bundled LiteLLM currently exposes one alias, whereas an explicitly configured external backend can expose more. Do not promise availability of a model that the backend cannot serve.

## Authorization and administrator semantics

**Preserve MAGDA's existing global administrator override:** the administrator role is allowed by the OPA entrypoint without a special `llm` exception. Internal services using an administrator identity continue to work. Administrators can call any deployment-allowed model without profile grants, and **are not subject to profile usage quotas**. This is an intentional system-wide privilege, not a separately granted model-access permission. Normal transport, authentication, deployment allowlist, and request-size safety checks still apply.

Define built-in `llm/access/*/access` for an explicitly granted **non-admin** unrestricted-model entitlement; it bypasses *profile* quotas, not the deployment allowlist. The literal `*` is not a generic URI glob: match this exact operation in its own `magda-opa/policies/llm/access/allow.rego` rule and entrypoint delegation. Guard against collisions with generated profile IDs.

Regular user invocation requires at least one granted, enabled profile for the requested model alias, with available soft quota according to the rules below. Profile ownership and permission to manage profiles **do not** implicitly grant model invocation, and invoking a model does not grant the ability to read a profile's administrative details. No MAGDA v8 release has occurred, so replacing the old LLM-route `agentWorkspace/access` check needs only local test-fixture and role configuration changes, **not a public migration or temporary compatibility bypass**.

Authorization happens against the **real authenticated user**. A client-provided user ID, selected profile, usage total, model-permission assertion, or LiteLLM virtual-key identity is never authoritative. Do not forward any original MAGDA bearer credential to LiteLLM.

## Registry record and management facade

A profile has its own typed `llm-access-profile-details` aspect and ordinary `access-control` aspect. The ID is a stable, service-generated, opaque identifier (not a user's assignment). The name is a display label.

```yaml
id: <service-generated-profile-id>
name: Standard LLM Access
aspects:
  llm-access-profile-details:
    allowedModels: [magda-agent-default]
    enabled: true
    allowedDailyTokens: 1000000     # optional, per user AND model
    allowedWeeklyTokens: 5000000    # optional, per user AND model
    allowedMonthlyTokens: 15000000  # optional, per user AND model
  access-control:
    ownerId: "<admin-uuid>"
    orgUnitId: "<optional-org-unit-uuid>"
    preAuthorisedPermissionIds: []
```

- `allowedModels`: required, non-empty distinct array of bundled/external **model aliases**, never provider IDs or secrets. Any listed alias must be deployment-allowed at invocation time; optionally reject invalid aliases during management to catch mistakes early.
- `enabled`: required boolean, defaults to true at creation. Disabling prevents new non-admin invocations; does not terminate an already-started stream.
- `allowedDailyTokens`, `allowedWeeklyTokens`, `allowedMonthlyTokens`: optional non-negative **safe integers**. Absence means no limit for that period *within this particular profile*, not a standalone access grant. Zero means no new ordinary requests can pass that period's quota. Units are **total input plus output tokens**, counted separately per user and model alias. The same ceiling applies independently to each alias in `allowedModels`. JSON Schema and service-side validation must agree.
- `access-control` governs **management/record visibility**, not model consumption. Immutable aspect identity and service-generated profile IDs must be validated, including updates to owner/orgUnit fields and changes to effective entitlement definitions.
- Not in this scope: per-provider pricing, dollar billing, per-profile separate balances, shared team budgets, strict atomic reservations, RPM/TPM concurrency limits, expiry dates or per-model override objects. Do not add speculative schema fields.

### Operations and consistency

The LLM Services public API is the only **supported** non-admin management interface. Define the concrete REST routes under `/api/v0/llm` (suggestion below); OPA operation URIs are **permission identifiers**, not literal HTTP URL paths:

| HTTP endpoint | OPA management operation | Behaviour |
| --- | --- | --- |
| `POST /access-profiles` | `llm/access/create` | Validate proposed record, ownership/OrgUnit and caller grant; create profile and dynamic authorization resource |
| `GET /access-profiles` and `GET /access-profiles/:id` | `llm/access/read` | Return only administrative records the caller can read; do not equate invocation with metadata visibility |
| `PUT /access-profiles/:id` | `llm/access/update` | Authorize existing and proposed state, enforce immutable ID/typed aspect, retain entitlement identity |
| `DELETE /access-profiles/:id` | `llm/access/delete` | Revoke/disable before removal; retriable cleanup of dynamic authorization objects |

Seed base resource `llm/access` with `llm/access/create|read|update|delete` operations and the special unrestricted invocation operation in an Authorization DB migration. Each created profile registers a resource `llm/access/<profile-id>` and operation `llm/access/<profile-id>/access`, which are granted via ordinary Authorization API roles/permissions. **No automatic invocation grant** to the creator. Profile management uses trusted LLM Services authority for its *internal* Registry/Auth API writes, after evaluating the caller's typed operation and the relevant `access-control` context. Do not require regular callers to manually create both kinds of object.

Follow [Building Features on Registry Records](../../docs/architecture/Guide%20to%20Magda%20Internals.md#building-features-on-registry-records): LLM Services is the only non-admin writer, aspect JSON Schema plus LLM Services validate data, typed OPA authorizes the caller, and privileged generic Registry/Authorization writers are explicitly trusted exceptions. For generic reads, apply typed `object/record/*` delegation/fallback exclusions and check typed read on each returned record. Preserve limited partial-evaluation-friendly OPA expressions for record queries; use full decisions for known object mutations.

Registry and Authorization DB cannot commit a profile change atomically. Design create/update/delete as idempotent operations with retries and an explicit **fail-closed** sequence:

1. Allocate a service-generated non-reused ID; validate the proposed record and caller. Create the profile **disabled or pending**, then register its dynamic resource/operation. Enable only when the expected pair is confirmed.
2. Updates that remove a model or disable the profile must be reflected in the authoritative profile before acknowledging success. Every new request checks the current enabled record; stale grants alone are insufficient.
3. Deletion first makes the profile non-invokable (disabled), then removes grants/resource/operation and finally the record. Retry partial cleanup. An orphan permission cannot authorize without an enabled matching profile.
4. Never reuse a deleted ID. Reserve path components such as `*`, `create`, `read`, `update` and `delete` and validate IDs/URL encoding. Administrative out-of-band changes can still break consistency; provide explicit validation/repair guidance.

No public v8 data migration is necessary.

## Invocation semantics: model-specific OR and non-stacking quotas

For each request, LLM Services verifies the caller and exact requested model alias. After the deployment allowlist check:

1. If the caller is a MAGDA administrator, allow without profile selection or quota checks.
2. Otherwise, if the caller is explicitly granted `llm/access/*/access`, allow without profile quotas.
3. Otherwise, find currently enabled profiles that include the **requested alias**, and authorize the caller against their corresponding dynamic `llm/access/<id>/access` operations.
4. Read the server-maintained **usage for this user AND this requested alias**, not the user's aggregate across all models. A profile is eligible when this same usage is below **every configured** daily/weekly/monthly ceiling in that profile. Allow if **any** granted profile is eligible. If none is eligible, refuse the new request with a stable quota-exceeded error.

Profile limits **do not add together** and usage does **not** reset or split when the applicable profile changes. Two grants for the same alias with comparable ceilings effectively permit the higher ceiling. If their daily/weekly/monthly ceilings differ, evaluate each profile independently as a whole: never take the maximum of each field from *different* profiles to construct a fictional combined entitlement. The service may select any deterministically ordered eligible profile for audit, but this choice never changes which counter is incremented.

Example (per authenticated user):

| Granted profile | Alias | Daily ceiling |
| --- | --- | ---: |
| Basic | model-A | 100,000 |
| Premium | model-A | 300,000 |
| Research | model-B | 200,000 |

After consuming 250,000 tokens on `model-A`, Premium still grants `model-A`. After reaching 300,000 tokens on `model-A`, subsequent requests to it are denied, but `model-B` still has its independent 200,000-token allowance. An unbounded enabled profile for that alias makes the corresponding period unlimited.

Use OPA to check **entitlement/management grants**. The LLM Service can perform the small, application-specific usage comparison after the OPA results: do **not** force mutable token counters or all profile candidate data into OPA unless integration makes that demonstrably simpler. Resolve granted profiles under trusted service authority, while keeping private profile metadata out of `/models` and ordinary invocation responses.

## Lightweight usage metric and storage

### Metric

Use **provider/LiteLLM-reported total tokens** (`input_tokens + output_tokens`, equivalently `prompt_tokens + completion_tokens`), recorded once per accepted call. It is more useful for containing operational overuse than output-only tokens: repeated context/prompt submissions cost money even with short outputs. Reasoning tokens are normally part of output totals; cached input tokens are normally part of input totals. **Never add either category a second time.** Do not claim total tokens equal provider dollars: model pricing, cache discounts and input/output rates differ. For now administrators set a sensible allowance per model; cost-oriented caps may be considered later.

All accounting is for the **authenticated MAGDA user UUID and the public requested model alias** (not provider model, API key, profile ID or arbitrary request `user`). Aliases are the stable isolation boundary. Treat a request to a differently named alias as separate usage even if two aliases route to the same provider deployment. Count each successful facade request once; do not assume LiteLLM's internal retries can be billed exactly.

### Durable store with no additional Redis or LiteLLM database

**Recommended:** reuse an existing MAGDA PostgreSQL deployment, with a narrowly authorized, LLM-owned logical database/schema and migration, **not** LiteLLM's own Prisma tables. The current MAGDA Helm stack uses separate PostgreSQL instances for several services; the implementation must select/document a supported co-location target and provision least-privilege access. Do not grant LLM Services a Registry/Authorization administrator database password or add an unowned table to an application schema. No *new PostgreSQL server/pod* or Redis cluster should be required just for usage. This is a concrete deployment design task, not proof that credentials/migrations already exist.

A small aggregate table is sufficient, conceptually:

```sql
-- Within an LLM-owned schema/database; exact migration DDL TBD.
PRIMARY KEY (user_id, model_alias, local_date)
columns: consumed_total_tokens BIGINT NOT NULL DEFAULT 0
```

On completion, atomically upsert/increment one row using `INSERT ... ON CONFLICT ... DO UPDATE`, never read-modify-write in application memory. Query daily usage by one date, weekly usage by summing the ISO Monday–Sunday dates, and monthly usage by summing dates in that calendar month. This persists through restart, coordinates multiple LLM Services replicas with ordinary PostgreSQL, and avoids separate daily/weekly/monthly ledgers. Counters are **not** stored as Registry aspects: high-frequency event-sourced record writes, access-control exposure and version conflicts would be a poor fit. They are also not ephemeral in-process counters or a Prometheus-based authority.

Use one operator-configured IANA timezone (default `UTC`) for all users, derived from a UTC event timestamp; assign each completed/aborted request to the local **completion** day. An ISO week begins Monday, and a month begins on day 1. DST is resolved before deriving `local_date`. Changing the configured timezone makes existing date buckets incomparable; document a reset/rebucket migration rather than silently reinterpreting them. Store minimal metrics, not prompts, completions, provider keys or raw conversation logs.

Optional profiles with no ceilings still authorize access. Deployments with soft quota enforcement enabled require the small ledger to be configured; no separate LiteLLM database is necessary. When no quotas or tracking are enabled, keep the existing DB-free LiteLLM mode. The exact MAGDA Helm Secret/DB bootstrap wiring is implementation work and must be covered in deployment tests.

### Soft enforcement, not billing

- Check persisted totals **before** starting a new request; deny when all eligible profiles are exhausted. Do not attempt per-token admission/reservation or stream interruption at the exact limit.
- Increment counters **after** the request returns provider usage; multiple in-flight requests may exceed ceilings temporarily. This is accepted. Next requests after the updated total is visible are refused.
- Streaming cancellations or incomplete upstream responses can omit final usage. Charge one configurable approximate fallback (for example, the greater of a small fixed debit and a crude request-body-size-based input estimate) **when the provider may have processed the request**. Never treat a cancelled stream as reliably free. Label these entries as estimated and expose counts for operators, not as an invoice.
- Prefer exact final usage when available; never apply both final usage and the fallback debit for the same facade request. Do not buffer full streamed responses merely to extract usage.
- If a required usage ledger is unavailable, deny *quota-bounded, non-admin* new requests with `503` (rather than silently granting unlimited spending), while permitting administrator/unbounded paths according to their normal authorisation contract. Report the outage clearly. Ordinary missing usage metadata may use the documented approximation rather than fail the request.
- Small overshoots, incomplete provider accounting, lost completion writes on process crashes and estimates are acknowledged limitations. Monitor them, but **do not present the quota as a financial hard stop**. Provider-side account budgets/alerts remain an independent safeguard.

For an operational budget issue, expose per-user/model/day totals and number of estimates to authorized administrators, with appropriate retention/cleanup (for example, configurable months of daily aggregates). A later dollar-based limit would require a reliable provider-specific cost normalization strategy and is explicitly out of scope.

## LiteLLM integration and streaming details

Keep the current network-private static LiteLLM router: LiteLLM provides provider translation, model aliases and provider secrets, while MAGDA owns identities, profiles and limits. The existing bundled chart pins `ghcr.io/berriai/litellm:main-v1.81.12-stable`; **validate streaming usage against that pinned version** rather than assuming the newest documentation applies. Backend compatibility must also be tested for explicitly configured external LiteLLM-compatible endpoints.

For non-streaming `/v1/chat/completions` and `/v1/responses`, inspect the returned `usage` object (normalizing `prompt_tokens`/`completion_tokens` and `input_tokens`/`output_tokens`). For streaming Chat Completions, ask the supported provider/router for a final usage event (`stream_options.include_usage` where supported); for Responses, inspect the terminal response usage event. Validate the actual frames emitted by the deployed LiteLLM version with DSH tool calls and reasoning output. If a provider or client combination cannot deliver usage, use the documented estimated fallback rather than pretending it has exact counts.

The current Node.js facade pipes LiteLLM responses directly to clients. Implement metering as a **bounded, read-only streaming observer**: incrementally recognize usage-bearing SSE frames while passing original bytes, ordering, headers and backpressure through unchanged. Do not delay token delivery, collect prompt/response content in logs, rewrite client SSE framing, or accidentally treat ordinary text as usage metadata. Cancel/destroy upstream when the client disconnects, preserving existing SSE behaviour. Keep per-request memory bounded and avoid leaking credentials or raw provider errors.

Continue to expose `GET /api/v0/llm/v1/models`, `POST /api/v0/llm/v1/chat/completions` and `POST /api/v0/llm/v1/responses`. Provider-native `/v1/messages` is not initially required. `/models` must list only deployment-allowed aliases the caller can actually use (including administrators and the unrestricted grant); do not leak administrative profile metadata or token balances through model discovery. Set `Cache-Control: private, no-store` on caller-specific discovery, profile APIs and sensitive responses to override Gateway's default GET caching. No data-sensitive API response should be shared-cacheable.

Continue to replace caller Authorization with an internal Secret-backed LiteLLM credential. Surface safe 401/403, quota-exceeded (recommend 429 plus stable machine-readable code), 503, backend error and optional `Retry-After` semantics. Do not confuse an exhausted soft budget with a provider's rate limit. Preserve ordinary streaming/tool-calling semantics and provider `retry-after` where possible.

## Why not LiteLLM's built-in budget system?

LiteLLM has mature [spend tracking](https://docs.litellm.ai/docs/proxy/cost_tracking), [budget management](https://docs.litellm.ai/docs/proxy/users) and [virtual key management](https://docs.litellm.ai/docs/proxy/virtual_keys). Their full budgets depend on its PostgreSQL-backed spend/key model, and Redis is used for distributed cache/coordination. Without a database, LiteLLM does **not** enforce its documented spending budgets. Using that path would require mapping MAGDA identities/grants to LiteLLM users or virtual keys and maintaining two policy systems, even though MAGDA wants only approximate per-model consumption. A master-key-only proxy cannot provide reliable MAGDA-user budgets simply by turning on a budget option.

A lighter alternative is LiteLLM/Prometheus per-user telemetry, but it is not a durable authoritative per-user budget ledger: metric cardinality, process resets and scrape delays make quota admission fragile. Pure in-memory counters likewise reset/reconcile poorly. Using response usage plus a small MAGDA-owned daily table is the preferred trade-off; this is a design recommendation, **not yet a proven implementation**. The service should still record which provider/backend returns usable usage fields and keep a deliberate fallback.

Source material reviewed (2026-11-19):
- [LiteLLM budget database prerequisites](https://docs.litellm.ai/docs/proxy/users) and [request architecture](https://docs.litellm.ai/docs/proxy/architecture)
- [LiteLLM spend tracking](https://docs.litellm.ai/docs/proxy/cost_tracking), [virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys), [Prometheus](https://docs.litellm.ai/docs/proxy/prometheus)
- [LiteLLM streaming and Responses changes](https://docs.litellm.ai/release_notes/v1.109.0rc1/v1-109-0-rc-1) — newer than MAGDA's pinned image; **not** evidence of current pinned-version compatibility
- [MAGDA's bundled LiteLLM values](../../../deploy/helm/internal-charts/litellm/values.yaml), [config](../../../deploy/helm/internal-charts/litellm/templates/config.yaml) and [LLM facade](../../../magda-llm-services/src/createApp.ts)

## Acceptance / verification for the combined delivery

1. **No release migration:** test from a clean v8 `next` install; old `agentWorkspace/access` remains a Workspace permission and is no longer an LLM invocation requirement.
2. **Admin consistency:** existing OPA administrator override permits any deployment-allowed alias without a profile or quota. Non-admin wildcard grants are explicit and cannot bypass the deployment allowlist. Anonymous/unauthenticated requests fail.
3. **Profile lifecycle:** typed create/read/update/delete checks both existing and proposed `access-control`, OPA grants and service-managed Registry/Auth API writes. No auto-grants, ID reuse, wildcard path injection, stale profile resurrection or direct constrained generic Registry write bypass.
4. **Model OR:** two granted profiles for one alias do not stack limits; a larger eligible profile can authorize it. Test distinct daily/weekly/monthly combinations with independent per-profile evaluation. `model-A` usage cannot spend or block `model-B`.
5. **Metering:** both API endpoints, ordinary/streamed requests, tools, cancellations, incomplete usage, duplicate terminal chunks, missing usage, retries and client disconnects. Test pinned LiteLLM plus an external mock backend, checking that SSE byte delivery remains intact.
6. **Durability:** PostgreSQL daily upserts across concurrent calls, multiple replicas, restarts, calendar/ISO weeks/months, DST and documented timezone changes. Monitor estimates and failures without storing prompts, bodies or secrets.
7. **Soft quota:** a newly admitted request is refused once persisted totals reach every eligible profile's applicable ceiling; concurrent in-flight overshoot is explicitly accepted. Ledger outages return 503 for bounded ordinary callers; administrator/unbounded cases retain designed behavior.
8. **Discovery/security:** list only callable aliases; no private profile information or public caching. Check provider credential isolation, safe error bodies and independent optional LiteLLM deployment.
9. **Documentation:** after implementation, update maintained LLM architecture, Helm operator guide, security notes and E2E acceptance; keep this file classified as a proposal until code is merged.

**Delivery decision:** implement access profiles **together with** practical per-user/per-model soft token limits in #3838; do not ship a separate model-only entitlement stage that merely moves the existing allowlist. No precise payment-grade limit, reservations, Redis, or mandatory LiteLLM PostgreSQL stack is part of this scope.
