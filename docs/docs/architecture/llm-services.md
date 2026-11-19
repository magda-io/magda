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

The initial bundled LiteLLM deployment can run without a PostgreSQL, Redis, Admin UI, virtual-key or usage database. Router state/limits may be per replica; this is *not* globally coordinated quota enforcement. Explicit metering and quota guarantees require later implementation and acceptance tests.

## Future model entitlements and quotas (not shipped)

[#3838](https://github.com/magda-io/magda/issues/3838) proposes **one combined feature**: Registry-backed LLM access profiles, typed authorization and practical **per-user/per-model soft token usage limits**. The [proposed profile design](../../design/agent-workspace/llm-access-profiles.md) is the implementation contract, not shipped functionality. MAGDA v8 is unreleased, so no released-user authorization migration is required.

The proposed access policy no longer uses `agentWorkspace/access` as a prerequisite for LLM invocation: Workspace still requires its self-only permission, while independent MAGDA clients need a model entitlement. MAGDA administrators keep the existing global OPA override and bypass profile quotas, **but still obey the deployment-wide model allowlist**. Non-admins may also receive an explicitly granted `llm/access/*/access` entitlement. Profile CRUD is owned by LLM Services following the feature-on-Registry-records pattern; Registry acts as the storage layer and Authorization API owns the grants.

Proposed accounting uses **total input + output tokens** in an LLM-owned daily per-user/per-model PostgreSQL ledger, co-located with the existing Authorization DB PostgreSQL instance using a separate schema and least-privilege login. Daily rows are summed for ISO weeks/months. Multiple granted profiles for the same model use OR semantics with **non-stacking** limits; activity on model A does not consume model B's allocation. The goal is budget protection, **not** precise billing: concurrent-request overshoot and estimated usage for incomplete streams are acceptable, but an unavailable required ledger must not silently convert bounded access to unlimited spending. No LiteLLM PostgreSQL, Redis or virtual-key administration is required. Validate streamed usage support against the **pinned bundled LiteLLM version**, and keep caller-specific model discovery and profile responses non-cacheable.

Do **not** document profile CRUD, dynamic model entitlements, metering or quotas as implemented until #3838 code and acceptance tests merge.

See [Workspace architecture](./agent-workspace.md), [Workspace security](./agent-workspace-security.md), [deployment](../agent-workspace-deployment.md) and [Agent Workspace E2E](../e2e-test-cases/agent-workspace.md).