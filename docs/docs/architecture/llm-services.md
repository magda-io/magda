# MAGDA LLM Services architecture

**Status:** The opt-in LLM facade and optional LiteLLM deployment are implemented in merged Agent Workspace MVP #3850 on the `next` development branch. Per-user model access profiles, quotas and usage accounting proposed in [#3838](https://github.com/magda-io/magda/issues/3838) are **not** implemented.

## Component and routing boundary

```text
Authenticated MAGDA client (including Workspace/DSH)
  -> external MAGDA Gateway
  -> MAGDA LLM Services (user auth + model allowlist + error boundary)
  -> private LiteLLM (provider configuration/credentials)
  -> configured model provider
```

LLM Services can be enabled independently of Agent Workspace using `global.llmServices.enabled`; Workspace currently requires the facade. With bundled LiteLLM, the `llm-services` chart owns an optional nested `litellm` subchart. With the subchart disabled, the operator must provide an explicit external LiteLLM-compatible backend URL and credential Secret. It must not silently fall back to a nonworking backend.

LiteLLM can route to OpenAI, Anthropic, Bedrock, Azure, or a configured OpenAI-compatible local endpoint depending on deployment configuration. **Provider configuration is not a claim that every provider/model is tested or universally available.**

## Identity and authorization

The Gateway and LLM Services verify the Magda caller. The initial Workspace model route checks the **self-only** `agentWorkspace/access` permission; this is a grantable Workspace permission, **not** a per-model entitlement. In addition, LLM Services checks the deployment-level `llm-services.allowedModels` list. Both controls are necessary; an allowed alias by itself does not grant Workspace access.

The `allowedModels` Helm value is a YAML string array. Empty `[]` inherits the configured `global.defaultAgentModel.alias`; bundled LiteLLM's current single-model routing must match exactly that alias, while an external backend may allow multiple aliases. Explicit allowlist items have surrounding whitespace trimmed; blank or duplicate normalized entries are rejected. The configured model alias itself still must match exactly.

The default `global.defaultAgentModel.reasoningEffort` is `medium`. Setting it to the **empty string** `""` deliberately omits the reasoning-effort parameter and lets the provider choose its default; do not substitute a `provider-default` sentinel or let Helm `default` silently change the empty string to `medium`.

DSH model requests use OpenAI-compatible Responses or Chat Completions paths as appropriate, with streaming and tool compatibility dependent on the configured provider and selected model.

## Secrets and failure isolation

The caller's Magda authentication does not become a LiteLLM provider credential. LLM Services strips/replaces caller authorization when contacting the private backend and supplies its own Secret-backed internal credential. Provider/model Secrets must not enter DSH, the Sandbox, browser content or public error bodies. Keep LiteLLM unreachable directly from Sandboxes and other external clients.

The initial bundled LiteLLM deployment can run without a **LiteLLM-managed** PostgreSQL, Redis, Admin UI, virtual-key or usage database. Router state/limits may be per replica; this is *not* globally coordinated quota enforcement. Proposed #3838 introduces MAGDA-owned profiles and usage on the **existing Authorization PostgreSQL instance** without provisioning a new PostgreSQL server; even after implementation, limits are intentionally approximate, not guaranteed hard billing cutoffs.

## Future model entitlements and quotas (not shipped)

[#3838](https://github.com/magda-io/magda/issues/3838) proposes **one combined feature**: PostgreSQL-backed LLM access profiles, typed authorization and practical **per-user/per-model soft token usage limits**. The [proposed profile design](../../design/agent-workspace/llm-access-profiles.md) is the implementation contract, not shipped functionality. MAGDA v8 is unreleased, so no released-user authorization migration is required.

The proposed policy removes `agentWorkspace/access` as a prerequisite for **direct LLM invocation**; Workspace itself still requires that self-only permission. MAGDA administrators retain the existing global OPA override and bypass profile quotas, **but must obey the deployment-wide model allowlist**. Non-admins need an actual enabled profile and its invocation entitlement. A profile can use `allowed_models: ["*"]` to cover all currently configured/served and deployment-allowed aliases, **not** arbitrary provider names. A wildcard model profile with unlimited ceilings replaces the earlier proposed `llm/access/*/access` special authorization operation. Actual provider/model configuration remains operator-owned via Helm/Secrets; no SQL model catalogue or UI model-provider management is proposed.

Profile CRUD is owned by LLM Services using an LLM-owned PostgreSQL schema; **there are no new Registry profile records/aspects**. The shared Authorization API resource `llm/access` has typed `create/read/update/delete/invoke` operations. Every profile has **three automatically managed role/permission pairs** (`use`, `read`, `edit`) stored in `profile_managed_roles` for simple direct user grants, **plus a separate `profile_pre_authorised_permissions` table** containing their three permission UUIDs **and optional additional advanced custom pre-authorised permission IDs**. LLM Services projects all associated IDs, owner/orgUnit and constraint exemption into a trusted Registry-like `access-control` OPA decision context. The Authorization API remains authoritative for permissions, roles and user-role memberships; these SQL mappings do not create grants by themselves. Custom pre-authorised permissions can combine `read/update/delete/invoke` and be attached by authorized operators to existing, caller-editable roles; **pre-authorised `create` is not profile-scopable** and is excluded from the advanced picker.

**Non-admin invocation supports MAGDA's existing scope modes:** unconstrained, owner-constrained, orgUnit-constrained, combined owner+orgUnit, or exact pre-authorised grants. For an orgUnit-constrained `invoke` permission, the profile's actual non-null `orgUnitId` must be in the **caller's `managingOrgUnitIds`** (their assigned orgUnit and descendants); an unassigned profile orgUnit does **not** match, and the reverse child-to-parent check must not be used. An authenticated user's orgUnit or profile ownership by itself is never sufficient without an appropriate `llm/access/invoke` operation permission. A custom pre-authorised grant can share a profile across unrelated orgUnit structures; **no separate `audienceOrgUnitId`** is introduced. All non-admin paths still require an enabled ready profile, an available deployment-allowed alias, and per-user/model quota admission.

The separate proposed [Settings UI design](../../design/agent-workspace/llm-access-profiles-ui.md) covers General, **Access** (direct managed-role grants only), **Pre-authorised permissions** (advanced custom permission/role management) and Usage tabs. It expressly **does not enumerate** all users or global roles with implied owner/orgUnit access: the Access tab shows a short explanation instead. Scope-limited editors cannot widen models/quotas or grant other users editor or advanced ACL authority without unrestricted management rights; advanced role and permission changes also require the caller's real Authorization API rights.

Proposed accounting uses **total input + output tokens** in an LLM-owned daily per-user/per-model PostgreSQL ledger alongside profile definitions, co-located with the existing Authorization DB PostgreSQL instance in a dedicated `llm_services` schema with a least-privilege LLM login. One row per (authenticated user, public alias, local day) is **summed for ISO Monday-based weeks and calendar months**; no separate weekly/monthly tables. The proposed Helm-configurable accounting timezone defaults to `Australia/Sydney`, with requests attributed to the local day they start, including when their streams finish after midnight. Multiple granted profiles for the same model use OR semantics with **non-stacking** limits; activity on model A does not consume model B's allocation. The goal is budget protection, **not** precise billing: concurrent-request overshoot and estimated usage for incomplete streams are acceptable, but an unavailable required ledger must not silently convert bounded access to unlimited spending. No LiteLLM PostgreSQL, Redis or virtual-key administration is required. The [pinned-LiteLLM/actual DSH metering PoC #3936](https://github.com/magda-io/magda/pull/3936) **confirmed feasible response metadata observation for one tested OpenAI Responses route** on bundled LiteLLM 1.81.12, installed DSH 0.2.1-alpha.1, and the existing facade, without a LiteLLM upgrade. This is *PoC evidence*, not a shipped feature or universal provider guarantee. Its key design consequences are:

- **Endpoint-specific usage:** Chat Completions uses `prompt_tokens`/`completion_tokens` and a final streamed usage chunk; explicit `stream_options.include_usage: false` suppressed it on the tested route. Responses uses `input_tokens`/`output_tokens`, including nested `response.usage` in terminal SSE events; **do not inject Chat `stream_options` into Responses** (the tested route returned HTTP 400).
- **One final debit per forwarded request:** `response.incomplete` can include valid final usage. Count that as measured, not estimated. Duplicate terminal markers and intermediate usage snapshots must not lead to extra debits. When final usage is missing (cancellation, provider errors, unfinished auxiliary work), use one documented marked estimate, never exact zero or visible-output characters alone.
- **Whole DSH workflow:** account for every model call made on behalf of the authenticated MAGDA user, including tool continuations and background title requests, rather than only the last visible assistant message. Preserve streaming bytes and tool-call frames through a bounded, read-only observer; failures to parse usage use the same estimated fallback. The PoC was an isolated tap, not a production metering implementation.
- **Provider limits:** tool-bearing Chat requests were rejected for the tested configured model, while actual DSH Responses tool loops succeeded. Other providers, browser UI and provider billing accuracy remain unverified; require compatibility testing when adding them. See the [full proposed metering contract](../../design/agent-workspace/llm-access-profiles.md).

Caller-specific model discovery and profile responses must remain non-cacheable.

Do **not** document profile CRUD, dynamic model entitlements, metering or quotas as implemented until #3838 code and acceptance tests merge.

See [Workspace architecture](./agent-workspace.md), [Workspace security](./agent-workspace-security.md), [deployment](../agent-workspace-deployment.md) and [Agent Workspace E2E](../e2e-test-cases/agent-workspace.md).