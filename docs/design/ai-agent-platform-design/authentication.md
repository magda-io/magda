# Delegated authentication and credential boundaries

**Status:** Draft  
**Owner ticket:** #3825  
**Depends on:** #3822 and #3823; coordinates with #3824  
**Blocks:** managed-agent mgd auth, Magda proxy, LLM proxy, mutation approval input  
**Evidence:** #3812 plus current Magda auth/API-key implementation to be verified

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

#### `mgd`

`mgd` remains the preferred agent-facing Magda interface.

In an agent sandbox, `mgd` uses an **agent-proxy auth mode** rather than a real Magda API key:

```text
MGD_BASE_URL=http://agent-manager-internal/.../magda/api
MGD_AGENT_TOKEN_FILE=/run/magda-agent/session-token
```

Exact CLI/environment names may change in the implementation ticket, but the contract is:

- the token is an opaque Agent Manager session capability;
- `mgd` sends it only to Agent Manager;
- Agent Manager injects the real Magda credential upstream;
- no real Magda API secret is written to the agent workspace/profile.

Outside the managed agent environment, existing `mgd` API-key/profile behaviour remains unchanged.

## Agent-to-Magda delegated authentication

### Why the real key must stay out of the sandbox

A raw user API key in the model-controlled environment could be read and exfiltrated to an arbitrary public endpoint.

The runtime only needs the *ability to perform authorised Magda calls*, not possession of the reusable credential.

### Selected model

Agent Manager creates and owns a short-lived API key for the user using Magda's existing API-key support, which already provides:

- user ownership;
- expiry time;
- enable/disable/delete;
- normal Gateway/OPA authorisation.

The key is never passed to the sandbox.

Instead, the sandbox receives a random opaque session capability. `mgd` and approved tools send that capability to Agent Manager's internal Magda proxy.

```text
mgd
  |
  | opaque session token
  v
Agent Manager internal Magda proxy
  |
  | X-Magda-API-Key-Id + X-Magda-API-Key
  v
Magda Gateway
  |
  v
normal Magda auth/OPA
```

The session capability:

- is at least 256 bits of cryptographic randomness;
- is stored hashed by Agent Manager;
- is accepted only on the internal agent-facing service/port;
- is bound to one session;
- is rejected after reset/delete;
- may also be checked against the current Sandbox Service/source identity.

### API-key lifetime/rotation

Recommended default:

- API-key TTL: 24 hours;
- Agent Manager rotates well before expiry;
- session reset/delete revokes the current key immediately.

The current key can authenticate the user's normal permission to create the replacement key and then delete the previous key, so rotation does not require the browser to remain connected.

If rotation fails until expiry, the session enters `AUTH_EXPIRED`: DSH/workspace remains available but Magda proxy calls fail until the user/session is reauthorised.

### Proxy restrictions

The Agent Manager Magda proxy is not a blind route to every platform administration endpoint.

At minimum block:

- API-key create/update/delete endpoints;
- authentication-plugin credential flows;
- Agent Manager's own control APIs;
- other credential-minting endpoints.

This prevents the sandbox from using its delegated authority to mint a persistent credential and bypass the session lifetime.

For the first Agent Manager MVP, the proxy is **read-only**:

- GET/HEAD allowed for supported Magda data APIs;
- mutating methods return an explicit "approval required / not implemented" response.

Mutation support is added only with the server-enforced approval-grant protocol described below.

## LLM provider access

Do not inject the deployment's OpenAI/DeepSeek/other provider key into every sandbox.

DSH should point at an OpenAI-compatible Agent Manager LLM proxy:

```text
DSH
  -> Agent Manager internal LLM proxy
     -> configured provider
```

DSH receives only the same opaque session capability (or a derived provider capability).

Agent Manager:

- validates session;
- enforces allowed provider/model;
- injects the real provider credential;
- streams responses without buffering the whole completion;
- records usage/cost metadata;
- applies per-user/session limits;
- redacts provider credentials from logs.

Trusted development may support a direct provider-key override, but production defaults to the proxy.

## Design warning

The inherited design selects a Manager-held short-lived Magda API key plus an opaque sandbox capability. #3825 must evaluate this rather than treating it as final.

The accepted design must define identity, scope, lifetime, rotation, revocation, reset/logout/user-disable semantics and the exact boundary between authentication, network policy and future mutation approval.
