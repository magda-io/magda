# MAGDA LLM Services architecture

**Scope:** This page describes the merged Agent Workspace MVP #3850 baseline on `next`, including its original Workspace-only gate and allowlist settings. Per-user profiles, soft limits and usage accounting for [#3838](https://github.com/magda-io/magda/issues/3838) are implemented separately in the [#3937 PoC](https://github.com/magda-io/magda/issues/3937), with reconciliation under review in [PR #3973](https://github.com/magda-io/magda/pull/3973), but are not yet merged into `next`. The [living design](../../design/agent-workspace/llm-access-profiles.md) describes that PoC, not the older baseline below; neither this design PR nor PoC status claims production qualification.

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

## Profile and soft-limit PoC (not yet merged into `next`)

[#3838](https://github.com/magda-io/magda/issues/3838) now has an implemented PoC: centrally managed profiles in the component-owned PostgreSQL database, role/audience/exemption invoke grants, and approximate per-user, per-model daily, weekly and monthly limits. **Public is not everyone automatically:** it requires an exemption-capable invoke grant. The PoC replaces the Workspace-only invoke gate and old allowlist setting described above. See [the living design](../../design/agent-workspace/llm-access-profiles.md) and [its Settings UI](../../design/agent-workspace/llm-access-profiles-ui.md); the maintained replacement architecture and qualification evidence are under review in [PR #3973](https://github.com/magda-io/magda/pull/3973). Keep this older baseline distinct from that implementation until integration.

See [Workspace architecture](./agent-workspace.md), [Workspace security](./agent-workspace-security.md), [deployment](../agent-workspace-deployment.md) and [Agent Workspace E2E](../e2e-test-cases/agent-workspace.md).