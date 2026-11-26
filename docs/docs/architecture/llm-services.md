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

The `allowedModels` Helm value is a YAML string array. Empty `[]` allows only `global.defaultAgentModel.alias`. With bundled LiteLLM, which routes only that alias, the list must be empty or exactly the alias; an external backend may allow multiple aliases. With the Agent Workspace enabled, the list must include the alias. Explicit allowlist items have surrounding whitespace trimmed; blank or duplicate normalized entries are rejected. The configured model alias itself still must match exactly.

`global.defaultAgentModel` is the one model config shared by LLM Services, bundled LiteLLM and the Agent Workspace, validated once by the shared Helm helper `magda.defaultAgentModel` (in `magda-common`). Its `reasoningEfforts` map gives each level the model accepts the value sent to the API, or is `false` for a model that doesn't reason. Bundled LiteLLM's `reasoning_effort` is the **mapped** value of `reasoningEffort` (default `medium`), and is omitted when `reasoningEffort` is the **empty string** `""` or the model doesn't reason; `""` deliberately leaves the effort to the provider, so do not substitute a `provider-default` sentinel or let Helm `default` change it to `medium`. LiteLLM merges a request's own effort over this value, so it only fills in for requests that name none. See the [deployment guide](../agent-workspace-deployment.md#the-workspace-model) for every field and an example of each kind of model.

DSH model requests use OpenAI-compatible Responses or Chat Completions paths as appropriate, with streaming and tool compatibility dependent on the configured provider and selected model.

## Secrets and failure isolation

The caller's Magda authentication does not become a LiteLLM provider credential. LLM Services strips/replaces caller authorization when contacting the private backend and supplies its own Secret-backed internal credential. Provider/model Secrets must not enter DSH, the Sandbox, browser content or public error bodies. Keep LiteLLM unreachable directly from Sandboxes and other external clients.

The initial bundled LiteLLM deployment can run without a PostgreSQL, Redis, Admin UI, virtual-key or usage database. Router state/limits may be per replica; this is *not* globally coordinated quota enforcement. Explicit metering and quota guarantees require later implementation and acceptance tests.

## Future model entitlements and quotas (not shipped)

[#3838](https://github.com/magda-io/magda/issues/3838) proposes Registry-backed LLM access profiles and typed authorization/usage limits. Do not document profile CRUD, per-user token budgets, quota resetting, dynamic entitlement filtering or model-level rights as present. Future design material is in [the proposed profile design](../../design/agent-workspace/llm-access-profiles.md); it must be reviewed against actual code and security requirements before implementation.

See [Workspace architecture](./agent-workspace.md), [Workspace security](./agent-workspace-security.md), [deployment](../agent-workspace-deployment.md) and [Agent Workspace E2E](../e2e-test-cases/agent-workspace.md).