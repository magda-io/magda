# Registry-backed LLM Access Profiles and usage quotas

**Status:** Agreed *future* design direction, proposed under [#3838](https://github.com/magda-io/magda/issues/3838); **not implemented** by the grantable self-only Workspace-access-gated LLM facade in draft [#3850](https://github.com/magda-io/magda/pull/3850).
**Related:** [llm-services.md](./llm-services.md), [authentication.md](./authentication.md), [open-questions.md](./open-questions.md).
**Owner:** Magda LLM Services (not Agent Manager, DSH, Registry API or LiteLLM).

## Scope and layering

Magda LLM Services is the user-facing, authenticated facade and policy decision/enforcement point. Registry stores the definitions of reusable LLM entitlement profiles; Authorization API stores *who is granted an entitlement* through resources, operations, permissions and roles; OPA makes access decisions. Usage accounting, per-user quota enforcement and model allowlist enforcement remain LLM Services responsibilities. LiteLLM is the internal model router and holds provider credentials.

Retain a **deployment-wide model allowlist** even after OPA becomes available: this constrains which model aliases the installation exposes at all. OPA then narrows which listed models a specific user is permitted to invoke. The MVP uses a simple allowlist plus a grantable `agentWorkspace/access` OPA decision (initially administrator-granted), not model-specific entitlement; **none of the profile/usage/OPA design below is claimed as shipped by #3850**.

For #3850's current single-model bundled LiteLLM chart, `llm-services.allowedModels` is implemented as a YAML **string array**, not a comma-delimited string. An empty list defaults to `global.defaultAgentModel.alias`. When bundled LiteLLM configures only one alias, the resolved allowlist must be **exactly that alias**, rather than advertising models which the bundled router cannot serve. External LiteLLM deployments may allow multiple aliases; actual model availability still comes from the external router.

## Registry record: `llm-access-profile`

The Registry record has `llm-access-profile-details` and `access-control` aspects. The record ID is the **stable entitlement/profile identifier** (e.g. `access-type-1`, `access-type-2`), not a particular user's assignment. The record name is a human-readable display name. Initial details aspect is intentionally **flat**, with only `enabled` added to the original model:

```yaml
id: access-type-1
name: Standard LLM Access
aspects:
  llm-access-profile-details:
    allowedModels:
      - magda-agent-default
    enabled: true
    allowedDailyTokens: 1000000        # optional
    allowedWeeklyTokens: 5000000       # optional
    allowedMonthlyTokens: 15000000     # optional
  access-control:
    ownerId: "<admin-uuid>"
    orgUnitId: "<optional-org-unit-uuid>"
    preAuthorisedPermissionIds: []
```

Schema rules:
- `allowedModels`: required, nonempty, distinct array of model **aliases**, intersected with the deployment allowlist; no provider secret or raw provider model ID.
- `enabled`: boolean; required/default true for an explicitly enabled published profile. Disabled profiles cannot authorize model invocation, regardless of existing role permissions.
- `allowedDailyTokens?`, `allowedWeeklyTokens?`, `allowedMonthlyTokens?`: optional non-negative integer ceilings, consistently plural; absent means *no limit for that period within this profile*, **not** an authorization grant. Quotas never override model allowlists, `enabled=false`, or missing entitlement.
- `access-control` governs **who can manage/read the record**, not who may invoke the models defined by the record.
- The record ID and defining typed aspect must not be silently replaced or removed to bypass its specialized policy. Owner/organization metadata changes require ordinary authorization, with extra checks on changing entitlement definitions.

Possible **later** fields (not required for the initial flat schema): `maxOutputTokensPerRequest?`, `maxRequestsPerMinute?`, `maxConcurrentRequests?`, `validFrom?`, `expiresAt?`, `allowedMonthlyCost?`, model-specific quotas, billing/budget group, hard/soft warning thresholds and provider-specific metrics. Do not build these in the first stage merely for speculative extensibility.

## Entitlement operations: `llm/access/<profile-id>/access`

The Authorization API registers a **resource and operation** for each created profile, such as:

- Profile `access-type-1` -> resource URI `llm/access/access-type-1` with operation URI `llm/access/access-type-1/access`.
- Profile `access-type-2` -> resource URI `llm/access/access-type-2` with operation URI `llm/access/access-type-2/access`.

These are **grantable entitlements**, assigned via the existing Authorization API permission/role model. A Registry record by itself does not grant the creator or owner permission to use its LLMs. Likewise, record create/update rights do not permit granting oneself an arbitrary access operation. The authenticated request's effective permissions are evaluated server-side; no caller-provided profile/owner/usage data is authoritative.

Also define the explicit built-in operation **`llm/access/*/access`** as privileged access across access profiles without their quotas, but **still subject to the deployment model allowlist and basic request/transport safety limits**. It needs a **dedicated rule** in `magda-opa/policies/llm/access/allow.rego` and entrypoint routing. MAGDA's ordinary permission helpers use exact URI matching; a literal `*` is **not automatically** a glob. Follow the existing wildcard-type technique used for draft/published dataset permissions while preserving exact resource/operation semantics. Avoid accidental wildcard matching, path collisions and unauthorized profile IDs.

**OPA access rule:** allow one request if **at least one** condition is true:
1. The caller has an active built-in `llm/access/*/access` entitlement, and the requested alias passes the deployment allowlist; or
2. At least one **enabled** profile has been registered, its dynamic `llm/access/<id>/access` operation is granted to this user, its `allowedModels` includes the requested alias (which also passes the deployment allowlist), and any configured per-user limits for that profile are not exhausted.

Multiple granted profiles use **logical OR**, not intersection. Each applicable profile can independently permit the requested model, but quotas do **not** silently add together. Evaluate the **same aggregate per-user usage totals** against each candidate profile's limits, so different profiles do not create multiple per-profile token balances by default. If several profiles permit one request, LLM Services selects a deterministic, auditable matching entitlement (e.g. stable profile-ID order); the choice must be consistent with any reservation/usage enforcement, and re-evaluated safely if another concurrent request changes usage. Do not let the client forge a stronger selected profile.

The OPA decision input is constructed by LLM Services from trusted sources: authenticated user/roles/permissions, requested model alias, normalized enabled candidate profile records, system-wide allowlist and **server-retrieved per-user usage data** for each configured limit period when usage metering is available. No user-supplied usage counters. Carefully distinguish authorization to access an existing profile from the user's ability to read/manage that profile's Registry metadata.

## Profile management operations are owned by LLM Services

Seed the **base Authorization API resource `llm/access`** and built-in management operations `llm/access/create|read|update|delete` (plus the special wildcard invocation resource/operation) via authorization migrations. Per-profile `llm/access/<profile-id>` resources and their `/access` operations are created/deleted dynamically by LLM Services when profiles are managed. All permission records and grants remain normal Authorization API objects.

Prefer the user-proposed **`llm/access/create|read|update|delete`** operation family for the *public management facade* rather than requiring clients to manually coordinate `object/llmAccess/*` via Registry plus Authorization API.

- `llm/access/create`: early policy check with a proposed record and `access-control` context; validate fields and record ID; LLM Services creates typed Registry record and registers the corresponding Auth API resource/operation using **trusted service authority**, not arbitrary caller Auth API create rights. No automatic grant to the creator.
- `llm/access/read`: read/list profile metadata subject to the specific Registry record's `access-control` and the facade's management policy. Possessing an *invoke* entitlement does **not** imply permission to read private administrative profile details.
- `llm/access/update`: validate and authorize the actual server-fetched record/owner/org-unit and **proposed changes**, then update Registry details; keep the dynamic permission identity stable while the profile ID stays stable. A revoked or disabled profile must stop authorizing new requests.
- `llm/access/delete`: authorize the existing profile; coordinate Registry delete/disable and Authorization API resource/operation removal/revocation, with safe retries. An orphan dynamic grant cannot authorize if the profile is missing or disabled.

These public operations are delegated to `magda-opa/policies/llm/access/allow.rego`, with a distinct management rule for each operation and record-scoped `access-control` (owner/org-unit/pre-authorized permission IDs). For `create`, the future owner/organization attributes must be validated **before** creation. Treat the explicit built-in wildcard invocation operation separately from management; it is **not** CRUD authority.

The service owns the **cross-system lifecycle** because Registry and Authorization DB cannot commit in one transaction. Design idempotent, recoverable create/disable/delete sequencing so partial failures never yield a usable entitlement without a valid enabled Registry profile. Use narrowly scoped service-to-Auth API authority, action audit logs and deny-by-default reconciliation. Profile IDs/operation URI encodings must be validated; the wildcard `*` and reserved path segments are not valid user profile IDs.

**Direct generic APIs:** privileged users may still invoke generic Registry or Authorization APIs. Do not claim that a facade makes them technically unreachable. Preserve dedicated typed record authorization (including generic `object/record/*` delegation and fallback exclusion) and ordinary Auth API permission checks, avoiding privilege escalation when directly modifying profiles. Direct out-of-band changes may create cross-service consistency defects; enforce fail-closed invocation against a missing/disabled profile and document repair.

## Quota usage data and enforcement (later than the MVP)

**Initially use output-token usage** as the accounting unit when it is reliably available, or **input + output tokens** when equally straightforward. Prefer total token units when reliably available; reasoning tokens are already included in provider output tokens and must **not** be counted again. If cached-input tokens are included in total input tokens, count them once, not as an additional category. Choose **one deployment-wide accounting metric** for all users/profiles so comparisons are consistent; document its semantics clearly. If reliable usage is unavailable, do not claim hard quota enforcement.

Token ceilings are **per authenticated user**, not a shared allowance across users who hold the same access profile. For each user, collect daily/weekly/monthly counters from a durable, cross-replica-usable usage ledger. LLM Services supplies the relevant **trusted current usage snapshot** as OPA input, enabling OPA to evaluate whether any matching profile satisfies the requested model and configured ceilings. OPA is a **stateless decision engine**, not a mutable counter store.

**Hard enforcement is a separate LLM Services responsibility:** concurrency-safe budget reservation/atomic accounting (or another explicitly bounded overshoot policy) is necessary so parallel/streaming requests cannot all pass an OPA snapshot before spending tokens. Response usage must be reconciled for successes, cancellations, failures and partial streaming; handle missing provider usage conservatively. Consider per-request maximum output tokens later to bound worst-case reservations. Without this mechanism, initial profile token limits are advisory rather than guaranteed.

Time-window calculations use **one LLM Services deployment configuration** for every user, e.g. `llm-services.usage.timezone: UTC` (an IANA timezone such as `Australia/Sydney` can be chosen by an operator). Daily windows start at local midnight, weekly windows use ISO weeks starting Monday, and monthly windows start on the first local calendar day; compute boundary instants carefully across DST. Apply identical windows in usage accounting and OPA request preparation. Store timestamps in UTC regardless of the configured calendar timezone.

## Security / tests / staged delivery

- Check that unentitled users cannot access any model; wildcard entitlements remain explicitly privileged and cannot bypass deployment allowlists.
- Check model-level authorization, disabled profiles, updates/revocation, unknown records/operations, ownership/org-unit/pre-authorized management constraints, and unauthorized direct Registry/Auth API mutation.
- Verify OR semantics for two grants, per-user rather than shared budgets, **one common user's usage** against each profile, no implicit addition of allowances, and deterministic selection of an eligible profile.
- Verify custom timezone daily/weekly/monthly boundaries including DST, provider tokens/missing usage, streaming/retries and concurrency once the metering stage is implemented.
- Ensure `/models` only advertises available aliases for the **current caller** after future authorization, without leaking private profile data.
- Keep current #3850 changes limited to typed YAML-array model allowlist and Helm/model defaults. Design/implementation of Registry profile CRUD, dynamic auth resource generation, OPA profile policies and metered quotas is **future work under #3838**, with separate implementation breakdown when ready; do not silently expand draft #3850's foundation scope.
