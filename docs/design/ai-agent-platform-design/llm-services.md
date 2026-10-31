# Magda LLM Services design

**Status:** Proposed generic authorization contract; MVP subset implemented in draft PR #3850  
**Owner ticket:** #3838  
**Depends on:** Magda Gateway/authentication and generic authorisation  
**Consumed by:** DSH Agent Platform and future Magda components

## Component boundary

Magda LLM Services is a reusable Magda service, deliberately separate from Agent Manager.

Its job is to expose authenticated/authorised LLM APIs through Magda and delegate provider translation/routing to internal LiteLLM.

```text
Magda API client / DSH
  -> Magda external endpoint
  -> Magda Gateway
  -> Magda LLM Services
  -> LiteLLM (internal only)
  -> provider/model endpoint
```

## Authentication

External clients use normal Magda authentication, including API-key bearer form:

```http
Authorization: Bearer <apiKeyId>:<apiKey>
```

Magda Gateway validates the credential and forwards trusted Magda user context to Magda LLM Services.

The service does not invent a separate Magda-Agent LLM token.

## Authorisation

Magda's generic authorisation system is authoritative for who may use which model.

Magda LLM Services:

1. identifies the authenticated Magda user;
2. parses the requested model alias;
3. asks the normal Magda authorisation layer whether that user may invoke the model/action;
4. returns 403 if denied;
5. proxies an allowed request to LiteLLM.

Model discovery should return only models the authenticated user is authorised to use.

**Agreed future authorization direction:** [Registry-backed LLM Access Profiles](./llm-access-profiles.md) defines typed `llm-access-profile` records with `llm-access-profile-details` and `access-control`, plus LLM Services-owned `llm/access/create|read|update|delete` management endpoints that coordinate Registry and Auth API. Each created profile has a grantable `llm/access/<profile-id>/access` entitlement and a dedicated OPA wildcard rule for `llm/access/*/access`. One enabled authorized profile suffices (OR semantics), subject to the deployment model allowlist. Initial flat fields include `allowedModels`, optional per-user day/week/month token limits and `enabled`; usage counters are supplied by LLM Services as OPA inputs once measured, with atomic quota enforcement in the service, not OPA. Future entitlement/profile support is **not** implemented in #3850. Details and security constraints remain in the linked design.

The ownership ticket for the future implementation and remaining API details is #3838.

## LiteLLM responsibility

LiteLLM is an implementation dependency for:

- OpenAI-compatible API/protocol handling;
- Anthropic/provider adaptation where exposed;
- model aliases;
- provider routing/fallback/retry;
- streaming;
- provider-specific credentials/config.

Initial providers:

- OpenAI;
- Anthropic;
- AWS Bedrock;
- Azure-hosted models;
- OpenAI-compatible local/model-server endpoints.

Magda remains authoritative for access policy. LiteLLM is authoritative for how an allowed alias is routed/invoked.

## Internal authentication

LiteLLM is not externally exposed and is not reachable directly from Agent Sandboxes.

Magda LLM Services removes/replaces the incoming Magda `Authorization` header and authenticates to LiteLLM with an internal credential.

For the minimal deployment, using the LiteLLM master key as that internal credential is acceptable because LiteLLM is network-private and only Magda LLM Services may reach it. A narrower service credential may replace it later.

Provider credentials and the LiteLLM internal credential never enter user sandboxes.

## MVP Helm packaging and feature flags

Draft PR #3850 implements an independent `global.llmServices.enabled` feature flag: the LLM facade can be deployed without Agent Workspace, whereas Agent Workspace currently requires the LLM facade. The `llm-services` chart owns a nested **optional** `litellm` subchart. With bundled LiteLLM enabled, the facade derives its backend URL and master-key Secret from the subchart. With bundled LiteLLM disabled, the operator supplies an external `backend.url` and `backend.masterKeySecret.{name,key}`; configuration must not silently fall back to an unusable backend.

Draft #3850 uses the self-only, **grantable** `agentWorkspace/access` OPA decision for the Workspace's model route, with administrator access initially and an unassigned stock Workspace role for controlled grants. This is not a hard-coded admin-role gate and is not fine-grained per-model entitlement. The Registry/OPA profile and quota scheme in [llm-access-profiles.md](./llm-access-profiles.md) remains future work under #3838; do not conflate the two.

**Current draft #3850 model configuration (implemented, pending PR integration):** Retain the deployment-wide `llm-services.allowedModels` gate even after per-user OPA authorization exists. It is a Helm YAML **string array**, defaulting to `[]`, which inherits `[global.defaultAgentModel.alias]`; bundled LiteLLM's current single-model router requires **exactly its configured alias**, while an external LiteLLM backend may expose multiple allowed aliases. The resolved array is passed to LLM Services as JSON. For convenience, explicit entries have surrounding whitespace trimmed, with empty entries and duplicates **after trimming** rejected; actual configured model aliases still must match exactly. The default `global.defaultAgentModel.reasoningEffort` is **`medium`**. An explicit **empty string `""`** means *omit the reasoning-effort setting* from Agent Manager/DSH and LiteLLM, using the provider's own default. This is **not** equivalent to `off`, and there is **no** `provider-default` sentinel. Use the effective global value directly: Helm `default`/`coalesce` would incorrectly replace `""` with `medium`, while nested-chart YAML-null overrides are unreliable. These settings are implemented in draft PR #3850 (reviewed at `e4e81ce08`), **not yet merged**; the future Registry-backed per-user entitlement and quota scheme remains unimplemented.

## Minimal LiteLLM deployment

Initial deployment intentionally avoids LiteLLM persistence/control-plane features:

- static `config.yaml`;
- Kubernetes Secret/environment provider credentials;
- no PostgreSQL;
- no Redis;
- no LiteLLM virtual-key/team/user source of truth;
- no LiteLLM Admin UI requirement.

PostgreSQL is added only if Magda intentionally adopts LiteLLM persistence/key-management/spend features.

Redis is optional. Magda may run multiple LiteLLM replicas without Redis for HA, accepting that router cooldowns, rate-limit counters and caches are per process rather than cluster-global. Redis can be added later when shared coordination is worth the complexity.

Magda-level policy must not assume a LiteLLM per-process RPM/TPM value is a cluster-global limit when Redis is disabled.

## External API

The public Magda mount should be independent of Agent Manager, for example:

```text
/api/v0/llm/v1/models
/api/v0/llm/v1/chat/completions
/api/v0/llm/v1/responses
/api/v0/llm/v1/messages
```

#3850 currently exposes an initial authenticated streaming-compatible OpenAI facade with Chat Completions and Responses support; the permanent generic model-level authorization and exact advertised API contract remain #3838 decisions. Do not claim full provider/protocol parity from the MVP subset.

## DSH consumption

The managed DSH profile is configured with:

- Magda LLM Services external base URL;
- the same system-managed Magda API-key bearer value used by `mgd`;
- deployment-selected model alias;
- deployment-selected reasoning effort.

DSH does not receive OpenAI/Anthropic/AWS/Azure credentials.

## Future consumers

The service is intentionally reusable for:

- the v8 Agent Platform;
- future metadata/data-understanding producers;
- semantic/enrichment services;
- other Magda features requiring authorised LLM access.

This is why the LLM service is not nested under `/agent` or owned by Agent Manager.
