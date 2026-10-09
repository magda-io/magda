# Agent Manager design

**Status:** Accepted  
**Owner ticket:** #3823  
**Depends on:** #3822  
**Blocks:** Agent Manager implementation, DSH routing, browser lifecycle UX

## Responsibility

Agent Manager is a stateless Magda control-plane service for per-user Agent Sandboxes.

It owns:

- resolve authenticated Magda user identity received through Magda Gateway;
- enforce one current sandbox per user;
- create/get/watch/patch/delete `SandboxClaim` and the bound `Sandbox`;
- suspend/resume and hard-delete lifecycle;
- post-claim bootstrap using Kubernetes exec + stdin;
- lifecycle-bound system-managed Magda API-key creation/rotation/revocation;
- DSH browser HTTP/WebSocket proxying;
- meaningful-activity tracking and idle policy;
- lifecycle/readiness/error information for the Magda web client;
- operational lifecycle metrics/audit.

It does **not** own:

- LLM provider routing/credentials/model authorisation — see #3838 / [llm-services.md](./llm-services.md);
- a dedicated Agent Manager database;
- user skill persistence (later skills design);
- model-generated command execution.

## Source of truth

The initial design intentionally has no Agent Manager persistence database.

```text
user ownership/lifecycle -> SandboxClaim/Sandbox
DSH/workspace/session     -> sandbox PVC
Magda API credential      -> Magda auth/API-key store + PVC-backed mgd/DSH config
LLM providers             -> Magda LLM Services / LiteLLM
```

Claim metadata includes:

```text
metadata.name = magda-agent-<user-uuid>
metadata.labels["agent.magda.io/user-id"] = <user-uuid>
```

A separate `session-id` is unnecessary. `SandboxClaim.metadata.uid` is the incarnation identifier.

## Agent Sandbox control protocol

Agent Manager talks to the Kubernetes API. It may use an Agent Sandbox SDK where suitable, but there is no requirement for a separate controller REST service.

Provisioning:

1. create/adopt `SandboxClaim` against configured WarmPool;
2. watch the Claim `Ready` condition rather than polling;
3. read `claim.status.sandbox.name`;
4. resolve the bound Sandbox/Pod/Service;
5. run bootstrap;
6. expose DSH only after bootstrap succeeds.

Warm adoption means claim name and Sandbox name can differ. Current Agent Sandbox guarantees the backing Pod name matches the Sandbox name.

## Kubernetes RBAC

RBAC is namespace-scoped to the dedicated agent namespace and limited to required resources.

Expected permissions include:

- `SandboxClaim`: get/list/watch/create/patch/delete;
- `Sandbox`: get/list/watch/patch as needed for operating mode;
- Pods: get and `pods/exec` for bootstrap and stock-DSH launch-token hand-off;
- read only the Services/status needed for DSH routing.

Agent Manager does **not** need `pods/log` for DSH authentication. The Magda agent image hands the stock DSH launch token to Agent Manager through a restrictive in-memory file read via `pods/exec`; see #3824 / [dsh-integration.md](./dsh-integration.md).

Agent Manager must not receive cluster-wide exec privileges and sandboxes have no service-account token.

## Bootstrap

Warm sandboxes run DSH before assignment and contain no user-specific Magda/LLM credentials.

After claim:

```text
Agent Manager
  -> Kubernetes exec
  -> /usr/local/bin/magda-agent-bootstrap
  -> stdin bootstrap payload
```

Bootstrap data includes:

- external Magda base URL;
- system-managed Magda API-key id + secret;
- reserved `mgd` profile name/config;
- Magda LLM Services endpoint/provider alias;
- default model and reasoning effort.

Secrets are passed on the exec stream/stdin, not command-line arguments, claim labels/annotations or Pod environment.

The helper writes required configuration under PVC-backed locations with restrictive permissions and performs a minimal verification before Agent Manager considers the environment READY.

## System-managed Magda API key

Agent Manager owns lifecycle orchestration for one reserved-name key per current sandbox.

Rules:

- before a new sandbox, remove stale keys with the reserved name and create exactly one fresh key;
- suspend/resume retains the existing key/profile;
- starting a new sandbox rotates the key by deleting/recreating it;
- permanent sandbox deletion/logout revokes/deletes it;
- reconciliation enforces "no current sandbox -> no system-managed agent key" best-effort.

The key has no intrinsic TTL in the initial design; its lifetime is bounded by sandbox lifecycle.

## API shape

Representative browser/control API:

```text
GET    /api/v0/agent/session
POST   /api/v0/agent/session
POST   /api/v0/agent/session/reset
DELETE /api/v0/agent/session
GET    /api/v0/agent/session/status
```

The exact REST naming may change during implementation, but semantics are fixed:

- GET derives state from current Kubernetes resources;
- POST creates when absent and is idempotent for the current user;
- reset deletes/recreates;
- DELETE permanently destroys current sandbox/key;
- state/error responses distinguish ALLOCATING, BOOTSTRAPPING, READY, SUSPENDED, DELETING and FAILED/DEGRADED.

DSH browser traffic uses a separate authenticated same-origin HTTP/WebSocket proxy route.

`X-Magda-Session` is verified by Agent Manager and stripped before forwarding. It never enters the Sandbox. Agent Manager pins the configured external Host, forwards the browser Origin/Fetch metadata required by DSH's trust fence, and strips browser/Magda credentials before DSH.

For stock DSH browser authentication, Agent Manager holds the DSH cookie server-side in a per-Sandbox in-memory cache. Multiple Manager replicas may independently redeem the same process launch token; no shared cookie database/sticky session is required.

When logout or another lifecycle transition permanently deletes a Sandbox, Agent Manager must promptly close active DSH proxy sockets associated with that Sandbox.

## Concurrency and restart

Deterministic claim identity provides the primary race guard. Concurrent creates converge on the same claim or receive conflict/retry behavior rather than creating two user sandboxes.

Agent Manager restart requires no DB recovery. It re-derives state from Kubernetes resources and the Magda API-key store.

Operations must be idempotent because any create/bootstrap/delete may be interrupted between steps.
