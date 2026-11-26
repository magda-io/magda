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

The Gateway and LLM Services verify the Magda caller. The initial Workspace model route checks the **self-only** `agentWorkspace/access` permission; this is a grantable Workspace permission, **not** a per-model entitlement. In addition, LLM Services checks the deployment-level list of served models. Both controls are necessary; an allowed alias by itself does not grant Workspace access.

The allowlist is the aliases of the served models: `global.llmServices.defaultModel` followed by `global.llmServices.additionalModels` (it replaced the `llm-services.allowedModels` string array). Aliases must be unique, with no surrounding whitespace, and must match exactly. Bundled LiteLLM renders one route per served model; an external backend must serve every listed alias.

Each served model is one entry, validated once by the shared Helm helpers `magda.llmModel.entry` and `magda.llmModels` (in `magda-common`), so LLM Services, bundled LiteLLM and the Agent Workspace render from the same values. An entry's `reasoningEfforts` map gives each level the model accepts the value sent to the API, or is `false` for a model that doesn't reason. Bundled LiteLLM's `reasoning_effort` for each route is the **mapped** value of that entry's `reasoningEffort` (default `medium`), and is omitted when `reasoningEffort` is the **empty string** `""` or the model doesn't reason; `""` deliberately leaves the effort to the provider, so do not substitute a `provider-default` sentinel or let Helm `default` change it to `medium`. LiteLLM merges a request's own effort over this value, so it only fills in for requests that name none: other clients' requests without `reasoning.effort`, and Agent Workspace requests whose configured effort is `""`. LiteLLM 1.81.12 didn't send it on `/v1/responses`; 1.83.14 does (#3945). The Agent Workspace uses the default model unless `agent-services.model` selects another served model. See the [deployment guide](../agent-workspace-deployment.md#models) for every field and an example of each kind of model.

DSH model requests use OpenAI-compatible Responses or Chat Completions paths as appropriate, with streaming and tool compatibility dependent on the configured provider and selected model.

## Secrets and failure isolation

The caller's Magda authentication does not become a LiteLLM provider credential. LLM Services strips/replaces caller authorization when contacting the private backend and supplies its own Secret-backed internal credential. Provider/model Secrets must not enter DSH, the Sandbox, browser content or public error bodies. Keep LiteLLM unreachable directly from Sandboxes and other external clients.

The initial bundled LiteLLM deployment can run without a PostgreSQL, Redis, Admin UI, virtual-key or usage database. Router state/limits may be per replica; this is *not* globally coordinated quota enforcement. Explicit metering and quota guarantees require later implementation and acceptance tests.

## Future model entitlements and quotas (not shipped)

[#3838](https://github.com/magda-io/magda/issues/3838) proposes Registry-backed LLM access profiles and typed authorization/usage limits. Do not document profile CRUD, per-user token budgets, quota resetting, dynamic entitlement filtering or model-level rights as present. Future design material is in [the proposed profile design](../../design/agent-workspace/llm-access-profiles.md); it must be reviewed against actual code and security requirements before implementation.

See [Workspace architecture](./agent-workspace.md), [Workspace security](./agent-workspace-security.md), [deployment](../agent-workspace-deployment.md) and [Agent Workspace E2E](../e2e-test-cases/agent-workspace.md).