# MAGDA LLM Services architecture

This page describes the v8 implementation of access profiles, invocation admission, soft token limits and usage reporting. The provider-qualified route is OpenAI Responses streaming through the bundled LiteLLM; other provider routes need separate compatibility checks. Token accounting is approximate, not billing-grade.

## Component and routing boundary

```text
Authenticated MAGDA client (browser, API key, Workspace/DSH)
  -> MAGDA Gateway (/api/v0/llm -> llm-services /v0)
  -> MAGDA LLM Services
       caller verification and llm/* decisions via Authorization API
       profiles and daily usage in the component-owned llm database
       deployment allowlist, per-user/per-alias soft quota admission
       OpenAI-compatible proxy and bounded usage observation
  -> private LiteLLM (provider configuration and credentials)
  -> configured model provider
```

LLM Services is independently enabled with `global.llmServices.enabled`. Workspace requires the facade, but **LLM invocation no longer requires or follows from `agentWorkspace/access`**. That permission controls opening the Workspace; an independent LLM client needs an invoke grant instead. See the [release notes](../llm-services-release-notes.md) and [operator setup](../agent-workspace-deployment.md#llm-access-profiles-and-usage).

The `llm-services` chart owns an optional nested `litellm` subchart. Disabling it requires an explicit external LiteLLM-compatible backend URL and credential Secret. The bundled pin is **`ghcr.io/magda-io/litellm:v1.83.14-stable.patch.3`** (LiteLLM 1.83.14), MAGDA's image copy, not the older 1.81.12 used by the initial observer experiment. See the [LiteLLM values](../../../deploy/helm/internal-charts/litellm/values.yaml). Provider routing capability is not proof that every provider/model is tested.

## Identity and authorization

The Gateway establishes the MAGDA caller; LLM Services verifies the session and uses the Authorization API. Profile management uses `llm/access/{create,read,update,delete}`; invocation uses `llm/access/invoke`; reading another user's usage uses `llm/usage/read`. Management and other-user usage decisions accept **unconstrained** permissions or the administrator override only. Owner, org-unit, pre-authorised and exemption grants do not delegate profile management (AUTH-3).

For a non-administrator, an enabled profile covering the requested alias must match at least one invoke grant:

| Grant | Matching profile |
| --- | --- |
| Unconstrained invoke | Every eligible profile, still subject to quota |
| Org-unit-constrained invoke | Profile's `org_unit_id` is the user's own unit or an ancestor |
| Pre-authorised invoke | Profile's `use_permission_id` matches that same permission's ID and invoke flags |
| Exemption-capable invoke | Profile has `constraint_exemption=true` (Public) |

Org-unit invoke has **audience**, not management-scope, semantics (AUTH-5): a Finance profile is available to Finance and Finance's descendants, not to users above Finance or in siblings. A profile without an org unit cannot match this grant; a user without an org unit needs another grant. Public means users with an exemption-capable invoke grant, **not** anonymous users and **not automatically everyone signed in** (AUTH-6).

Each profile owns exactly one pre-authorised invoke permission, not a role or direct-user grant (AUTH-7). Managers attach that permission to existing roles through LLM Services. **Authenticated Users is allowed: attaching it grants this profile to everyone who can sign in**, including accounts created later (AUTH-8). Anonymous Users is excluded because there is no individual authenticated identity to meter. Admin Users is excluded because attachment is pointless: administrators already have every deployment-allowed model without a profile or quota. A manager does not receive general `authObject/role/update`, which would permit unrelated privilege changes. See [ADR 0013](../adrs/0013-central-llm-profile-management-and-invoke-grants.md).

The migration adds the unassigned **LLM Profile Managers** role (central management, invoke, all-user usage, read-only org-unit access), and adds the audience/exemption invoke permission to **Agent Workspace Users** if that role still exists. It neither assigns these roles to users nor grants default LLM access to Authenticated Users or Anonymous Users. Managers with unconstrained invoke can test all existing profiles but are still limited by them; only Admin Users bypass profile/quota requirements. Administrators remain bound by the deployment model allowlist and are metered.

### Partial decision and consistency boundary

On a caller-access cache miss, LLM Services verifies `whoami`, distinguishes Admin Users, and for non-administrators obtains one partial `llm/access/invoke` decision with `input.object.llmAccessProfile` unknown. The flat fields `org_unit_id`, `use_permission_id` and `constraint_exemption` match SQL columns. `AuthDecision.toSql` translates the residual into a parameterised condition on `access_profiles p`. An unconditional true removes only the authorization filter, not enabled-state, model or quota checks; false grants no profile access. No Registry record, SQL view or full decision per profile is needed (EVAL-1).

The same access condition drives admission, `GET /v1/models` and usage-report eligibility. Access is cached per user, per process for `decisionCacheSeconds` (default **30**; `0` disables; implementation accepts **0–30**). Grant revocations, org-unit changes and administrator-role changes may take that configured TTL to apply. Profile attributes are read on each query, so profile edits affect subsequent requests without waiting for this cache. Already running requests are not revoked. See [ADR 0014](../adrs/0014-translate-llm-invoke-decisions-to-profile-sql.md) and [caller access implementation](../../../magda-llm-services/src/access/CallerAccess.ts).

## Models and deployment allowlist

The allowlist consists of aliases in `global.llmServices.defaultModel` followed by `global.llmServices.additionalModels`. It replaces `llm-services.allowedModels`. Aliases are unique, exact and without surrounding whitespace. The shared `magda.llmModel.entry` / `magda.llmModels` Helm helpers render LLM Services, bundled LiteLLM and Workspace from one schema. Clients send the public alias, not a provider model ID.

A profile names explicit aliases or exactly `["*"]`. Wildcard means the intersection of deployment-allowed and backend-served aliases, including later additions; when the backend's model list cannot be read it falls back to the explicit deployment allowlist. Successful backend lists are cached for 60 seconds and failures for 15 seconds. Explicit profile aliases are validated against available aliases on writes, and remain bounded by the deployment allowlist on requests. An external backend must actually route every configured alias. See [served-model handling](../../../magda-llm-services/src/access/ServedModels.ts).

`GET /v1/models` lists eligible aliases **even if their quota is exhausted**. An empty list means no eligible model, not a zero remaining budget. It is not the same as the profile-reader `GET /available-models` picker.

Each model entry's `reasoningEfforts` maps accepted levels to provider values, or is `false` for a non-reasoning model. Bundled LiteLLM uses the mapped `reasoningEffort`, omitting it for the empty string `""` or a non-reasoning model. Workspace uses the default model unless `agent-services.model` selects another served alias. See [Models](../agent-workspace-deployment.md#models) for field semantics, examples and rollout behaviour.

## Profiles and persistence

LLM Services owns the **`llm` database** with `access_profiles` and `daily_model_usage`. The standard topology uses the existing combined-db (or configured external PostgreSQL) via `llm-services-db`; it does **not** require a new PostgreSQL server, Redis, a LiteLLM database, virtual keys, Admin UI or LiteLLM budgets. The chart can opt into a dedicated instance through the existing database deployment mechanism, but that is not a requirement of profiles. LLM Services never accesses Authorization DB tables directly. See the [initial schema](../../../magda-migrator-llm-services-db/sql/V1__Initial.sql).

Profile updates require the revision in `If-Match`; reads return `ETag`. Missing revision gives `428`, stale revision `409`. Role attachment serialises against deletion with a profile row lock. Creation makes a service-chosen permission ID and uses one best-effort compensating delete after an uncertain failure; deletion removes permission links, never roles or users. These are **not distributed transactions** across the two services. A timeout or lost response must not be described as proof that nothing changed.

A missing managed permission is recreated with the **same** ID on the next role attachment. Detaching the last role retains it. A mismatched existing permission is not adopted by name or overwritten; there is no background reconciliation. See [profile lifecycle implementation](../../../magda-llm-services/src/profiles/ProfileService.ts).

## Soft quota and accounting

Usage is keyed by **authenticated MAGDA user UUID + requested public alias + request-start local date**, never client `user`, session, API key, provider ID or profile. Daily, Monday-start ISO-week and calendar-month sums use `usage.timeZone` (default `Australia/Sydney`) with DST-aware local dates. Streams crossing midnight settle on their start date. Changing the timezone does not reinterpret existing rows.

Budget volume is measured input + measured output + estimated tokens. Cached input is already part of input; reasoning is already part of output. Limits apply independently per user and alias. A profile admits while usage is below **all of its own** configured limits; eligible profiles combine as OR, without stacking limits across profiles. Null means unlimited and `0` refuses new non-administrator requests. Admission reads eligibility and period sums in one SQL query but makes **no reservation**, so concurrent and already-running requests can overshoot.

Remaining quota chooses the profile with the greatest minimum remaining across its configured periods; period details belong to that same profile, not independent maxima from different profiles. Exhausted reports select the profile that next admits by its reset dates. Unlimited, exhausted and no eligible profile are distinct states. Remaining is not a promised number of tokens a request can spend.

After forwarding, settlement atomically increments the daily row once with measured or estimated usage. In-process duplicate suppression is not durable exactly-once processing. A process crash before settlement can lose usage; there is no durable request journal, reservation or replay. Rows are not pruned in this implementation, and deleting a profile or user does not clear usage history.

Profiles and usage share the same `llm` database. Non-administrator admission **fails closed** with `503` when its eligibility/usage query cannot be read, including for an unbounded profile; an unlimited budget does not bypass the database authority needed to prove access. This is the accepted read-failure behavior, not a promise of unlimited-profile availability during an outage.

A failed settlement write logs a critical accounting event, is **not retried** (its commit may be uncertain), and gates bounded admissions **in that service process** until a rolled-back write probe passes. This gate is not shared across replicas. Administrators bypass quota admission; an unbounded eligible profile may bypass the write-failure gate only after a successful eligibility read. The service's `/v0/status/ready` checks `SELECT 1`, not accounting completeness or the write gate. See [admission](../../../magda-llm-services/src/access/Admission.ts) and [ledger](../../../magda-llm-services/src/usage/UsageLedger.ts).

### Metering boundary

The [request meter](../../../magda-llm-services/src/metering/RequestMeter.ts), [usage observer](../../../magda-llm-services/src/metering/usageObserver.ts) and [settlement configuration](../../../magda-llm-services/src/metering/settlement.ts) define the executable metering contract.

When valid final usage is absent:

```text
input = ceil(forwarded request body bytes / bytesPerToken)
if nonempty visible text/tool output was observed:
    visible = ceil(observed output bytes / bytesPerToken)
    fallback = 0
else:
    visible = 0
    fallback = outputTokensByModel[alias] if that override exists, otherwise outputTokens
factor = 1 for normal completion, otherwise incompleteFactor
estimated_tokens = visible + ceil((input + fallback) * factor)
```

The same configurable byte ratio is used for request input and visible output. No extra output amount is added when visible output has been observed. The `outputTokens` fallback, or its per-alias override, applies **only when no nonempty visible output was observed**. An explicitly configured per-alias override of `0` is valid and must not fall back to `outputTokens`.

A failed/incomplete terminal, missing terminal, interruption, unobservable format or observer failure is not normal completion. Visible output is **never discounted**; the incomplete factor applies to estimated input and any fallback output only. Valid final usage remains measured and unchanged, including failed/incomplete terminals; the formula applies only to estimates.

Defaults in the [chart values](../../../deploy/helm/internal-charts/llm-services/values.yaml) are `bytesPerToken: 5`, `incompleteFactor: 0.25`, `outputTokens: 4096` and `outputTokensByModel: {}`. These are **provisional budget-policy defaults**, not measured token ratios, statistically calibrated values or provider billing reconciliation. Generated text, JSON-heavy requests, language and model behavior can have different byte/token relationships, and visible output does not account for all reasoning or background generation. Safe quality metadata includes byte counts, observation flags, terminal type/status, completion flag and done-marker count—never the content itself.

- Chat uses one validated final `usage.prompt_tokens` / `completion_tokens` snapshot. Streaming Chat requests ask for usage; Responses requests must not be given Chat `stream_options`.
- Responses uses `input_tokens` / `output_tokens`, including valid terminal usage on completed, incomplete or failed events. Terminal detection and valid final usage are separate. `[DONE]` and repeated events do not cause additional settlement.
- Usage snapshots are not summed. Before the terminal, a later valid snapshot may replace an interim one; the first terminal freezes final accounting and later conflicting frames cannot overwrite it. An invalid, malformed or oversize later Chat frame invalidates its provisional usage candidate, so `[DONE]` cannot promote a stale interim zero.
- Missing, invalid, unreadable or oversize **final** usage is unknown, not free. A processed request without valid final usage uses the configurable estimate, recorded separately from measured counters. Visible output alone cannot account for hidden reasoning or background generation.
- Requests rejected before forwarding, definite connection/DNS failures and non-2xx upstream answers cost nothing. A request sent upstream with an uncertain outcome may be estimated. Client cancellation after a 2xx response uses valid final usage if already observed, otherwise an estimate.
- Observation is bounded (default 64 KiB SSE event, 1 MiB non-streaming JSON) and forwards the original bytes through the same backpressure path. Parser buffers are transient; it does not log or persist prompts, model output or tool arguments. An observer runtime failure must not stop forwarding a valid response.
- A truncated upstream response fails the client's connection; it must not be presented as a normally completed response. Before headers, an upstream connection failure returns `502`. The proxy has a 120-second upstream inactivity timeout and a 2 MiB JSON request-body limit.
- Every forwarded request is independent, including tool continuations, titles and compaction/background requests; not merely the visible user turn.

## Public API and user-facing operations

Paths below are relative to `/api/v0/llm`:

| Routes | Access / purpose |
| --- | --- |
| `/access-profiles`, `/access-profiles/:id` | Central profile list/read/create/update/delete |
| `/access-profiles/:id/roles`, `/role-candidates`, `/roles/:roleId` under that profile | List, choose, attach/detach existing roles |
| `/available-models` | Profile-reader model picker |
| `/usage/me`, `/usage/me/daily` | Any authenticated user's own report/history; caller-supplied user identity is ignored |
| `/usage/users`, `/usage/users/:userId`, `/usage/users/:userId/daily` | Unconstrained `llm/usage/read` or administrator |
| `/access-help` | Authenticated access to operator help text/link |
| `/v1/models` | Caller-eligible aliases, independent of remaining quota |
| `/v1/chat/completions`, `/v1/responses` | POST, caller admission and proxy/metering |

User-specific responses send `Cache-Control: private, no-store`, including proxied model responses. Invocation returns `401` for an invalid/unknown user, `403 llm_no_eligible_profile` for missing profile access, `429 llm_quota_exceeded` with `x-should-retry: false` for exhaustion, and `503 llm_usage_unavailable` for required ledger reads/gating. Deployment-disallowed aliases also return `403`, without a profile-specific code.

**Settings → LLM Services** has Access Profiles, My Usage and User Usage tabs. Tab visibility is a convenience, not authorization: the API checks access. My Usage navigation requires an invoke permission (any constraint) or administrator, while its API accepts any authenticated user. Other-user eligibility uses the **subject's grants**, after authorising the viewer; name/email search and names on result rows use the **viewer's user-read rights**, not the service's administrator credentials. IDs and retained history remain usable for deleted users. History's API `from` / `to` dates are inclusive in the accounting timezone; SQL uses half-open ranges internally.

## Secrets, evidence and limitations

Caller authentication is not a provider credential. LLM Services supplies its Secret-backed backend credential instead of forwarding caller authorization. Its internal administrator session is used only after the caller's `llm/*` decision for the narrowly implemented Auth API changes and lookups. Provider Secrets stay in private LiteLLM; keep it unreachable directly from Sandboxes and external clients.

Only the tested OpenAI Responses streaming route through the bundled LiteLLM is provider-qualified here. Chat and other provider/backend routes must not inherit support claims from synthetic fixture tests. Record the actual provider/model, backend version and route for each compatibility check; neither byte estimates nor successful routing demonstrate provider billing accuracy.

Use the [LLM Services test procedure](../e2e-test-cases/llm-services.md) to reproduce checks and record results with the PR or release evidence, separately from these maintained docs.

See [Workspace architecture](./agent-workspace.md), [Workspace security](./agent-workspace-security.md), [deployment](../agent-workspace-deployment.md) and [Workspace E2E](../e2e-test-cases/agent-workspace.md).
