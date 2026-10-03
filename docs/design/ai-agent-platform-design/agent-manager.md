# Agent Manager design

**Status:** Draft  
**Owner ticket:** #3823  
**Depends on:** #3822 sandbox/session contracts  
**Blocks:** Agent Manager implementation, DSH routing, auth, UI state  
**Evidence:** #3812 where relevant; current Magda gateway/auth/controller patterns

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

## Magda Gateway

Gateway remains the external same-origin entry point.

Agent Manager's browser/control routes are configured as authenticated gateway routes so the service receives the normal signed `X-Magda-Session` identity used by other Magda services.

No Sandbox Service, Pod IP, DSH token or Agent Manager internal-agent endpoint is exposed externally.

## Agent Manager

Agent Manager is a new Magda service and the control plane for the platform.

Responsibilities:

- resolve the authenticated Magda user;
- enforce one active session per user;
- create/reconcile/delete SandboxClaims;
- map session id -> claim -> sandbox -> Service FQDN;
- manage session state in persistent storage;
- reverse-proxy DSH browser HTTP/WebSocket traffic;
- manage DSH bootstrap/re-authentication;
- issue and validate opaque per-session sandbox capabilities;
- own rotating Magda user credentials;
- proxy agent-originated Magda API traffic;
- proxy LLM traffic and enforce provider/model/budget policy;
- store/version user-created text skills;
- provide lifecycle/health/metrics/audit data.

Agent Manager must run with narrowly scoped Kubernetes RBAC limited to the agent namespace and the Agent Sandbox resources it manages. It does not run model-generated code.

## Agent Manager database

Agent Manager needs durable control-plane state independent of Pod/PVC lifetime.

Use a dedicated Postgres-backed store owned by Agent Manager rather than overloading Registry dataset metadata or the Gateway session database.

Minimum logical tables:

```text
agent_session
  id
  user_id
  generation
  state
  claim_name
  sandbox_name
  service_fqdn
  runtime_profile
  created_at / updated_at
  last_seen_at
  encrypted_magda_api_key_id
  encrypted_magda_api_key_secret
  magda_api_key_expiry
  session_capability_hash

agent_skill
  id
  user_id
  name
  description
  current_version
  created_at / updated_at / deleted_at

agent_skill_version
  skill_id
  version
  body
  created_at
  source_session_id
```

The raw sandbox capability is stored only in the sandbox and returned once at bootstrap; Agent Manager stores a strong hash.

Real Magda API-key secret material is encrypted at rest with an Agent Manager encryption key supplied through Kubernetes Secret management.

## Agent Manager API

Representative browser/control API:

```text
GET    /api/v0/agent/session
POST   /api/v0/agent/session
POST   /api/v0/agent/session/reset
GET    /api/v0/agent/session/status
POST   /api/v0/agent/session/reauthorize

GET    /api/v0/agent/skills
POST   /api/v0/agent/skills
GET    /api/v0/agent/skills/:id
PUT    /api/v0/agent/skills/:id
DELETE /api/v0/agent/skills/:id
GET    /api/v0/agent/skills/:id/versions
```

Representative internal sandbox-only endpoints on a separate ClusterIP port:

```text
ANY  /internal/session/:id/magda/*
POST /internal/session/:id/llm/*
GET  /internal/session/:id/skills
```

These internal endpoints accept the opaque agent-session capability, not the browser session.

DSH browser traffic uses a separate same-origin reverse-proxy route, for example:

```text
/agent/runtime/*
```

The precise mount path should be verified with the selected DSH frontend build so relative assets/WebSockets work without a fork.

## Agent Manager reconciliation

Agent Manager is a controller-like service, not only an HTTP request handler.

A reconciliation loop compares:

- DB session state;
- SandboxClaim;
- bound Sandbox;
- Sandbox status/Service FQDN;
- DSH/bridge readiness;
- credential expiry.

This allows recovery after Agent Manager restart and makes request handling idempotent.

Important rules:

- resolve the bound sandbox from `claim.status.sandbox.name`;
- use `status.serviceFQDN` for the data path;
- never assume claim name == sandbox name because warm adoption keeps pool-generated names;
- never reuse a previous session's Kubernetes/PVC name.

## Design boundary

The API/schema above is a current proposal, not yet accepted. #3823 must verify it against the accepted session-lifecycle contract and avoid baking unresolved authentication or DSH-specific details into the control plane.

In particular, Agent Manager should consume explicit interfaces for:

- sandbox/session lifecycle;
- DSH connectivity/readiness;
- sandbox capability authentication;
- Magda delegated authority;
- persistence/recovery.

Those interfaces should remain replaceable where downstream design is still open.
