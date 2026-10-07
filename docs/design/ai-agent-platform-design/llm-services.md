# Magda LLM Services design

**Status:** Proposed  
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

The exact resource/action schema is still owned by #3838.

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

#3838 must settle which surfaces are actually promised and how streaming/errors/unsupported fields are handled.

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
