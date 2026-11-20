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

The proposed access policy no longer uses `agentWorkspace/access` as a prerequisite for LLM invocation: Workspace still requires its self-only permission, while independent MAGDA clients need a model entitlement. MAGDA administrators keep the existing global OPA override and bypass profile quotas, **but still obey the deployment-wide model allowlist**. Non-admins may also receive an explicitly granted `llm/access/*/access` entitlement. Profile CRUD is owned by LLM Services using an LLM-owned PostgreSQL schema; **there are no new Registry profile records/aspects**. Authorization API still owns operations, roles, permissions and grants. The SQL schema preserves management ownership, managed-orgUnit, exact pre-authorised permission-ID mappings and operation-specific `constraintExemption`/`allowExemption` behaviour. The [PoC #3934](https://github.com/magda-io/magda/issues/3934) validates LiteLLM metering before implementation.

Proposed accounting uses **total input + output tokens** in an LLM-owned daily per-user/per-model PostgreSQL ledger alongside profile definitions, co-located with the existing Authorization DB PostgreSQL instance in a dedicated `llm_services` schema with a least-privilege LLM login. Daily rows are summed for ISO weeks/months. Multiple granted profiles for the same model use OR semantics with **non-stacking** limits; activity on model A does not consume model B's allocation. The goal is budget protection, **not** precise billing: concurrent-request overshoot and estimated usage for incomplete streams are acceptable, but an unavailable required ledger must not silently convert bounded access to unlimited spending. No LiteLLM PostgreSQL, Redis or virtual-key administration is required. The [pinned-LiteLLM/actual DSH metering PoC #3936](https://github.com/magda-io/magda/pull/3936) **confirmed feasible response metadata observation for one tested OpenAI Responses route** on bundled LiteLLM 1.81.12, installed DSH 0.2.1-alpha.1, and the existing facade, without a LiteLLM upgrade. This is *PoC evidence*, not a shipped feature or universal provider guarantee. Its key design consequences are:

- **Endpoint-specific usage:** Chat Completions uses `prompt_tokens`/`completion_tokens` and a final streamed usage chunk; explicit `stream_options.include_usage: false` suppressed it on the tested route. Responses uses `input_tokens`/`output_tokens`, including nested `response.usage` in terminal SSE events; **do not inject Chat `stream_options` into Responses** (the tested route returned HTTP 400).
- **One final debit per forwarded request:** `response.incomplete` can include valid final usage. Count that as measured, not estimated. Duplicate terminal markers and intermediate usage snapshots must not lead to extra debits. When final usage is missing (cancellation, provider errors, unfinished auxiliary work), use one documented marked estimate, never exact zero or visible-output characters alone.
- **Whole DSH workflow:** account for every model call made on behalf of the authenticated MAGDA user, including tool continuations and background title requests, rather than only the last visible assistant message. Preserve streaming bytes and tool-call frames through a bounded, read-only observer; failures to parse usage use the same estimated fallback. The PoC was an isolated tap, not a production metering implementation.
- **Provider limits:** tool-bearing Chat requests were rejected for the tested configured model, while actual DSH Responses tool loops succeeded. Other providers, browser UI and provider billing accuracy remain unverified; require compatibility testing when adding them. See the [full proposed metering contract](../../design/agent-workspace/llm-access-profiles.md).

Caller-specific model discovery and profile responses must remain non-cacheable.

Do **not** document profile CRUD, dynamic model entitlements, metering or quotas as implemented until #3838 code and acceptance tests merge.

See [Workspace architecture](./agent-workspace.md), [Workspace security](./agent-workspace-security.md), [deployment](../agent-workspace-deployment.md) and [Agent Workspace E2E](../e2e-test-cases/agent-workspace.md).