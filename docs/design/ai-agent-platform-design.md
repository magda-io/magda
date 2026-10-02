# Magda v8 AI Agent Platform Design

## Status

Proposed design for Magda v8.

- Parent epic: [#3810](https://github.com/magda-io/magda/issues/3810)
- Design issue: [#3811](https://github.com/magda-io/magda/issues/3811)
- PoC: [#3812](https://github.com/magda-io/magda/issues/3812)
- PoC implementation: [PR #3817](https://github.com/magda-io/magda/pull/3817)
- PoC findings: [v8 Agent Sandbox investigation](../investigations/v8-agent-sandbox-minikube.md)

This is v8 work and targets the `next` branch.

The design deliberately incorporates the measured results from #3812 rather than treating Kubernetes Agent Sandbox, gVisor, DSH or `mgd` behaviour as assumptions.

## Decision summary

The v8 agent platform uses this control/data-plane split:

```text
Browser
  |
  | normal Magda login/session
  v
Magda Gateway
  |
  v
Agent Manager
  |  | \ browser DSH proxy
  |  \
  |   +------------------------------+
  |                                  |
  | SandboxClaim lifecycle           | HTTP/WebSocket
  v                                  v
Kubernetes Agent Sandbox       per-sandbox bridge
  |                                  |
  | configurable RuntimeClass        | loopback proxy
  v                                  v
runc (trusted dev)             DSH 127.0.0.1:3080
or gVisor (production)                |
                                      +--> mgd / Python / tools
                                             |
                                             | opaque agent-session token
                                             v
                                      Agent Manager internal proxy
                                        |                |
                                        |                +--> LLM provider
                                        v
                                      Magda Gateway
```

Key decisions:

| Area | Decision |
| --- | --- |
| Sandbox lifecycle | Kubernetes SIG Apps Agent Sandbox is the lifecycle abstraction in all environments. |
| Runtime isolation | RuntimeClass is configurable. Trusted local development may use the default runtime/runc. Shared, staging and production deployments use gVisor by default. Kata remains a future stronger-isolation option. |
| DSH location | DSH runs inside the per-user sandbox. There is no shared privileged DSH host. |
| DSH command confinement | Default DSH permission mode is `workspace-write` with approval/ask semantics. Under gVisor the PoC proved DSH selects bubblewrap; under runc it falls back to Landlock. |
| Session model | One active long-lived agent session per user by default. Every session gets a unique immutable session id and SandboxClaim name. |
| Workspace | One PVC per session. DSH state, workspace files and temporary analysis artifacts live there. |
| Durable user state | User skills and Agent Manager metadata live outside the sandbox in Agent Manager-owned persistent storage. |
| Browser routing | The browser never sees Pod IPs or talks directly to DSH. Agent Manager reverse-proxies DSH HTTP/WebSocket traffic. |
| Sandbox addressing | Production templates request an Agent Sandbox headless Service and Agent Manager connects using `status.serviceFQDN`, not a recycled Pod IP. |
| DSH loopback | A small Magda-owned bridge sidecar in each sandbox Pod exposes DSH's loopback-only listener to Agent Manager. |
| Magda credentials | Raw Magda API keys are never exposed to the agent container. Agent Manager owns a short-lived rotating user API key and proxies `mgd`/agent requests using an opaque session capability. |
| LLM credentials | Deployment/provider secrets remain outside the sandbox. DSH calls an Agent Manager LLM proxy with the opaque session capability. |
| Initial mutation policy | The first Agent Manager implementation is read-only for Magda APIs. Server-enforced approval grants for mutating workflows are a separate implementation step. |
| User skills | User-created skills are text-only, durable, user-owned and versioned. |
| Global skills | Trusted deployment skills are separate from user skills and may include code. Code-bearing global skills are versioned with the trusted runtime image. |
| Warm pools | Supported by the architecture but optional; initial deployments may use `replicas: 0`. Per-user configuration is applied after SandboxClaim adoption so warm adoption remains possible. |
| Current WebGPU agent | Keep it as an optional/fallback lightweight mode during the v8 transition; do not remove it until the new platform is proven in production. |

## Problem

The existing open-source Magda AI assistant runs its model in the browser through WebGPU. This provides a useful local capability but deliberately constrains model size, execution tools, file handling and long-running workflows.

The `mgd` CLI now exposes a much richer agent-facing Magda interface. A coding-agent harness can search and inspect metadata, download distributions, analyse files locally, create or modify datasets, work with custom aspects and upload artifacts.

The missing product layer is a safe way to make those coding-agent capabilities available from a normal Magda browser session without requiring each user to install and operate a local coding agent.

The v8 platform therefore needs to combine:

- a capable coding-agent harness;
- browser access;
- per-user execution state;
- arbitrary-code isolation;
- Magda identity and authorisation;
- constrained credentials;
- reusable skills;
- lifecycle and resource controls;
- deployment/runtime portability.

## Goals

The design must enable a signed-in Magda user to:

1. open the agent from the Magda web UI;
2. obtain or reconnect to one private long-lived agent workspace;
3. use DSH with `mgd` and approved local analysis tools;
4. search, inspect, download and analyse Magda data;
5. perform authorised mutations only through explicit confirmation flows;
6. save useful workflows as reusable personal skills;
7. return later without losing the active session;
8. start a clean new session when required.

Operators must be able to:

- select the sandbox RuntimeClass;
- enforce production isolation and network policy;
- set resource limits;
- manage model/provider access;
- supply trusted global skills;
- observe and audit lifecycle and consequential operations.

## Non-goals

The first v8 implementation does not require:

- multiple simultaneous active sessions per user;
- automatic idle shutdown or full VM-memory hibernation;
- unrestricted privileged/container-in-container workloads;
- user-created executable skills;
- direct browser access to Sandbox Pods;
- production dependence on MAGDA++ closed-source services;
- automatic federation/query planning across arbitrary datasets;
- a full remote IDE or unrestricted human shell.

## Design principles

### 1. The sandbox contains the agent, not only its shell commands

DSH, `mgd`, Python and other tools all execute inside the per-user Agent Sandbox. The Agent Manager is a control plane and proxy, not a shared place where untrusted model-controlled code executes.

### 2. Runtime isolation is deployment policy

Agent Sandbox owns lifecycle; RuntimeClass owns the container isolation choice.

The application architecture must not assume gVisor-specific APIs. The same Agent Manager should work with runc, gVisor and a future Kata RuntimeClass.

### 3. Production and trusted development are intentionally different profiles

Local development optimises for iteration speed and may use runc. Production optimises for hostile-code containment and uses gVisor by default.

This difference must be explicit and continuously tested rather than hidden behind environment detection.

### 4. Keep reusable knowledge outside disposable execution state

A sandbox can be deleted without deleting user skills. Conversely, temporary files or installed packages in a sandbox do not become durable Magda/user state automatically.

### 5. Do not give arbitrary code reusable platform/provider secrets

The model-controlled process should not receive the deployment LLM key or the real Magda API key. It receives an opaque capability that is useful only through Agent Manager's internal proxy.

### 6. Prefer existing Magda authorisation

Agent execution does not create a second authorisation model for datasets. Agent Manager authenticates as the user, and Magda's existing authorisation API/OPA decisions remain authoritative.

### 7. Server-enforce the high-risk boundary

Prompt/skill instructions are useful behaviour guidance but are not a security boundary. Credential management, network reachability, runtime isolation, resource limits and mutating-operation approval must have server/runtime enforcement.

## Architecture

### Components

#### Magda web client

The web client owns:

- the Agent entry point;
- provisioning/recovery/reset UX;
- user-visible lifecycle state;
- explicit mutation approval UI;
- personal skill management;
- the transition between the current WebGPU assistant and the v8 server agent.

The first v8 release should reuse the DSH web application as much as practical rather than reimplementing its conversation/tool UI. Magda-specific chrome and controls can wrap the proxied DSH surface.

The production UI should hide/disable DSH's generic human terminal and unrestricted workspace picker by default:

- the PoC showed the human web terminal is outside DSH's bubblewrap command confinement;
- the workspace picker can browse DSH internal state such as `$DSH_HOME`.

The agent itself still uses DSH's tool interface. Trusted developer deployments may opt into the terminal for debugging.

#### Magda Gateway

Gateway remains the external same-origin entry point.

Agent Manager's browser/control routes are configured as authenticated gateway routes so the service receives the normal signed `X-Magda-Session` identity used by other Magda services.

No Sandbox Service, Pod IP, DSH token or Agent Manager internal-agent endpoint is exposed externally.

#### Agent Manager

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

#### Agent Sandbox

One Agent Sandbox corresponds to one agent session generation.

Each Sandbox Pod contains at least:

1. **agent container**
   - DSH;
   - `mgd`;
   - Python and approved analysis tools;
   - trusted global skills;
   - DSH/Magda integration plugin;
   - session workspace/PVC mount.

2. **bridge sidecar**
   - exposes the DSH loopback listener to Agent Manager on a Pod port;
   - provides health/bootstrap coordination;
   - does not execute user/model commands;
   - holds any bridge bootstrap secret separately from the agent container.

Containers share the Pod network namespace, so the bridge can reach DSH at `127.0.0.1:3080` while Agent Manager reaches the bridge through the sandbox's headless Service.

The bridge is not a replacement security boundary for DSH. NetworkPolicy and DSH authentication remain required.

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

#### Agent Manager database

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

### Component/trust-boundary diagram

```text
                         EXTERNAL / BROWSER
+------------------------------------------------------------------+
| Browser                                                          |
|  Magda session cookie                                            |
+--------------------------+---------------------------------------+
                           |
                           | HTTPS
                           v
+--------------------------+---------------------------------------+
| Magda Gateway                                                    |
| authenticates browser, emits signed X-Magda-Session              |
+--------------------------+---------------------------------------+
                           |
                           v
+------------------------------------------------------------------+
| TRUSTED CONTROL PLANE: Agent Manager                             |
|                                                                  |
| lifecycle  DSH proxy  user-skill DB  Magda proxy  LLM proxy     |
|                    encrypted user API key                        |
+-------------+------------------+------------------+--------------+
              |                  |                  |
              | K8s API          | internal         | provider key
              |                  | capability       | stays here
              v                  v                  v
+------------------------------------------------------------------+
| UNTRUSTED EXECUTION: Agent Sandbox                               |
| RuntimeClass: runc (trusted dev) / gVisor (production)           |
|                                                                  |
| +---------------------------+   +------------------------------+ |
| | agent container           |   | bridge sidecar               | |
| | DSH + mgd + Python        |-->| 127.0.0.1:3080 -> :8080     | |
| | model-controlled code     |   | lifecycle/bootstrap health   | |
| | opaque session capability |   +------------------------------+ |
| +---------------------------+                                    |
|              |                                                   |
|              +---- PVC: DSH_HOME + workspace                     |
+--------------+---------------------------------------------------+
               |
               | only policy-approved egress
               v
     public data endpoints / Agent Manager internal proxy
```

## Runtime and sandbox profiles

### Trusted local development: Agent Sandbox + runc

A local single-developer environment may use the cluster's default runtime:

```yaml
agent:
  sandbox:
    securityProfile: trusted-dev
    runtimeClassName: ""
```

The PoC showed that DSH remains usefully confined:

- bubblewrap cannot mount its private procfs in the tested runc Pod;
- DSH falls back to Landlock;
- `workspace-write` remains enforced.

This profile is faster for syscall-heavy coding workflows and avoids requiring gVisor on every developer cluster.

It is **not** an appropriate default for a shared environment that executes untrusted/model-generated code from multiple users.

### Production/shared environments: Agent Sandbox + gVisor

Production and shared staging environments use gVisor by default:

```yaml
agent:
  sandbox:
    securityProfile: production
    runtimeClassName: gvisor
```

The PoC verified:

- gVisor is active under Agent Sandbox;
- DSH selects bubblewrap;
- DSH `workspace-write` enforcement works;
- normal `mgd`, download and pandas workloads remain practical;
- gVisor adds approximately 55-70 MiB memory per sandbox;
- syscall-heavy workloads can be significantly slower.

The chart must fail validation when `securityProfile: production` is selected with no RuntimeClass.

The RuntimeClass value is not hard-coded to `gvisor`; operators may choose a supported Kata RuntimeClass later.

### Common hardening

Both profiles keep the same Pod hardening:

- non-root UID/GID;
- `allowPrivilegeEscalation: false`;
- all Linux capabilities dropped;
- no privileged containers;
- no hostPath;
- no host PID/IPC/network;
- no container runtime socket;
- `automountServiceAccountToken: false`;
- finite CPU/memory/ephemeral-storage/PVC limits;
- managed NetworkPolicy;
- RuntimeDefault seccomp unless the selected RuntimeClass requires otherwise.

### DSH inner confinement

Default agent command policy:

```text
workspace-write + ask/approval
```

Do not use DSH `read-only` as the normal mode for the current DSH version; #3812 found that every bash call requires approval in that mode.

Production health should report at least:

- Kubernetes RuntimeClass;
- DSH sandbox backend;
- DSH reported enforcement level.

A production sandbox that cannot obtain the expected DSH confinement should be reported as degraded or fail readiness according to deployment policy.

### Required runtime test matrix

The project must keep both paths tested:

| Test tier | Runtime | Purpose |
| --- | --- | --- |
| fast/local | runc | developer inner loop |
| integration | gVisor | production parity |
| release/security | gVisor | isolation, network and adversarial checks |

A successful runc test is not sufficient evidence for production because DSH selects a different inner backend and gVisor changes networking/PTY behaviour.

## Sandbox template

The production SandboxTemplate should request a per-sandbox headless Service:

```yaml
spec:
  service: true
```

Agent Manager should use `Sandbox.status.serviceFQDN` when available.

This is preferred over caching Pod IPs because the Service is lifecycle-bound to the Sandbox and avoids accidentally dialing a recycled Pod IP.

Other important template properties:

- one `ReadWriteOnce` PVC generated per Sandbox;
- no per-claim volume override;
- no per-claim environment override for identity/credentials;
- restart policy appropriate for a long-running interactive agent;
- labels identifying agent-runtime version and runtime profile;
- NetworkPolicy admitting Agent Manager to the bridge port only.

## Session model

### Identity

Each session gets a random immutable UUID.

Kubernetes names must be unique per generation and must not reuse the previous claim/PVC name:

```text
magda-agent-<user-hash>-<session-short-id>
```

Do not put email/display name in Kubernetes resource names.

The PoC demonstrated a storage race when a deleted claim/PVC name was immediately reused on Minikube hostPath. Unique names also make audit/lifecycle reasoning clearer.

### One active session per user

Agent Manager enforces one active session row per user using a database uniqueness constraint for active states.

A user may start a new session only through an explicit reset flow.

### State model

Minimum externally visible states:

```text
PROVISIONING
STARTING
READY
RECOVERING
AUTH_EXPIRED
DEGRADED
FAILED
RESETTING
DELETING
```

Internal reconciliation may use additional substates.

### First-use provisioning sequence

```text
Browser          Gateway       Agent Manager      Agent Sandbox      DSH/bridge
  |                |                |                  |                |
  | open agent     |                |                  |                |
  |--------------->|                |                  |                |
  |                | X-Magda-Session|                  |                |
  |                |--------------->|                  |                |
  |                |                | lookup session   |                |
  |                |                | create DB row    |                |
  |                |                | create user API  |                |
  |                |                | key (short TTL)  |                |
  |                |                | create claim ---->|                |
  |                |                |                  | create sandbox |
  |                |                |                  |--------------->|
  |                |                | wait Ready       |                |
  |                |                |<-----------------|                |
  |                |                | bootstrap opaque session token    |
  |                |                |---------------------------------->|
  |                |                | acquire DSH upstream auth cookie  |
  |                |                |<--------------------------------->|
  |                |<---------------|                  |                |
  |<---------------| Agent READY    |                  |                |
```

The API call may return `202 PROVISIONING` and the UI may poll/subscribe until ready.

### Reconnect sequence

Browser disconnect does not affect Sandbox lifetime.

On return:

1. Gateway authenticates the user.
2. Agent Manager finds the active session.
3. Agent Manager reconciles the claim/sandbox.
4. If DSH restarted, Agent Manager reacquires DSH upstream authentication through the bridge.
5. The browser is proxied back to the same DSH workspace/session.

### Start-new-session/reset sequence

The UI must warn that sandbox-local state will be discarded.

The request includes the expected current session id to avoid resetting a newly replaced session from a stale browser tab.

```text
POST /api/v0/agent/session/reset
{
  "expectedSessionId": "..."
}
```

Agent Manager:

1. marks the old session `RESETTING`;
2. revokes/deletes the old Magda API key;
3. deletes the SandboxClaim;
4. allows Agent Sandbox/StorageClass GC to delete Sandbox/Pod/PVC/PV;
5. records any cleanup failure;
6. creates a new session with a new id/name/capability;
7. provisions a fresh SandboxClaim.

With a `Retain` StorageClass, Agent Manager must explicitly clean up retained storage or report it as operator action required.

User skills are not touched by reset.

## Warm pools

Warm pools are compatible with this design but not required for the first release.

Initial default:

```yaml
warmPool:
  replicas: 0
```

Why the architecture still preserves warm-pool compatibility:

- Agent Sandbox v1.0.4 requires a WarmPool reference for SandboxClaim;
- the PoC measured warm adoption around 0.34 s versus multi-second cold starts;
- per-claim env/volume overrides prevent adoption.

Therefore user/session identity must be applied **after adoption** through the bridge/bootstrap path rather than via claim-specific environment injection.

Agent Manager must always resolve the actual sandbox from claim status; a warm-adopted Sandbox keeps its pool-generated name.

## Browser-to-DSH routing and authentication

### Addressing

Production path:

```text
browser
  -> Magda Gateway
  -> Agent Manager
  -> Sandbox headless Service :8080
  -> bridge sidecar
  -> DSH 127.0.0.1:3080
```

The bridge exists because DSH's shipped CLI intentionally binds loopback, and the PoC confirmed external Pod/port-forward traffic cannot directly reach the gVisor loopback netstack.

### DSH browser credential handling

DSH currently uses:

- a per-process launch token;
- a persistent DSH_HOME signing secret;
- an authority-bound browser cookie.

The launch token is sensitive and must not become a durable URL in Agent Manager logs or browser history.

Production behaviour:

1. a small DSH launcher wrapper captures the startup token without logging it;
2. it writes readiness/token state to an in-Pod bootstrap channel consumed by the bridge;
3. Agent Manager requests the token from the bridge over its trusted control connection;
4. Agent Manager performs the DSH token-to-cookie exchange server-side;
5. Agent Manager stores the resulting upstream DSH cookie in memory/cache;
6. browser requests remain authenticated by the normal Magda session;
7. Agent Manager injects the DSH cookie on upstream HTTP/WebSocket requests.

The browser never receives the DSH launch token or DSH cookie.

If Agent Manager restarts, it can reacquire the current process token from the bridge and repeat the exchange.

If DSH restarts, the launch token changes but its signing secret remains on the PVC, so existing DSH cookies may remain valid. Agent Manager nevertheless treats a 401 as a signal to reacquire upstream auth.

The PoC's "read token from Pod logs and put it in the browser URL" flow is explicitly **PoC-only**.

### Host/Origin

Agent Manager presents one stable internal authority to DSH and rewrites upstream Host/Origin consistently.

DSH's Host/Origin/browser-auth fences remain active; the proxy does not disable them.

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

## Mutation approval model

The final v8 system must not rely only on prompt text saying "ask before publishing".

Agent Manager's Magda proxy is the enforcement point because direct authenticated Magda access from the sandbox is blocked.

Proposed protocol:

1. the agent/`mgd` prepares a proposed mutation invocation;
2. the UI shows a human-readable summary;
3. the user approves;
4. Agent Manager issues a short-lived, single-session mutation grant;
5. `mgd` includes the grant on the mutating requests for that invocation;
6. Agent Manager validates method/path/session/invocation and forwards;
7. the grant expires or is consumed.

`mgd` already emits an invocation identifier for mutating requests, which should be reused to bind a grant to one command/workflow.

A later implementation ticket must define the exact grant scope for multi-request operations such as dataset creation/publish.

Until that ticket lands, production agent Magda access remains read-only.

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

## Network policy

### Ingress

Sandbox ingress allows only:

- Agent Manager -> bridge port;
- required health/metrics paths if separately configured.

No sandbox-to-sandbox ingress.

### Egress

Production default:

- DNS;
- Agent Manager internal service;
- approved public data access according to deployment policy.

Direct access from sandbox to internal Magda services/gateway is denied in production; authenticated Magda traffic must use Agent Manager's proxy.

Block:

- Kubernetes API;
- RFC1918/internal cluster ranges except explicitly allowed services;
- link-local/cloud metadata;
- other Sandbox Pods.

### External datasets

Agents need to download distributions hosted outside Magda.

Support deployment policy levels such as:

- `disabled`;
- `public-https` (recommended default);
- `custom`.

A later egress implementation may use Cilium FQDN policy or an explicit egress proxy. NetworkPolicy alone can enforce private/link-local denial but cannot express all domain-level policy.

The opaque Agent Manager capability has no value to arbitrary Internet hosts, reducing the impact of accidental token exfiltration.

## Workspace and persistence

### Session/PVC state

PVC-mounted state includes:

- `DSH_HOME`;
- DSH conversation/session data;
- workspace;
- downloaded distributions;
- generated files;
- temporary scripts;
- user-installed packages/caches if allowed;
- `mgd` non-secret configuration.

This state survives:

| Event | Session PVC |
| --- | --- |
| browser refresh/disconnect | survives |
| Agent Manager restart | survives |
| DSH process restart | survives |
| Sandbox Pod recreation | survives |
| Start new session/reset | deleted |
| explicit operator storage loss | lost |

### Durable user state

Agent Manager database stores:

- user skills;
- skill version history;
- session metadata;
- audit/lifecycle metadata.

It does not treat arbitrary workspace files as durable user data.

Generated artifacts become durable only when explicitly uploaded/saved through an authorised Magda workflow.

## User-created skills

### Trust model

User skills are user-owned **text-only** knowledge.

Initial format:

- name;
- description;
- Markdown body compatible with the DSH/Magda skill provider;
- metadata/version/provenance.

Do not allow executable attachments, binaries, symlinks or package installation as part of a user skill in the initial system.

Text may contain command examples, but those commands still execute through normal DSH sandbox/approval policy.

### Storage

Agent Manager DB is the source of truth.

Each update creates a new immutable version and advances `current_version`.

Useful provenance:

- source session id;
- creation/update timestamp;
- optional "generated by agent" / "edited by user" marker.

### Agent-facing API

Add `mgd` commands conceptually equivalent to:

```text
mgd agent-skill list
mgd agent-skill get <id>
mgd agent-skill create ...
mgd agent-skill update <id> ...
mgd agent-skill delete <id>
```

The exact CLI names are an implementation-ticket decision.

These commands call Agent Manager through the internal agent proxy when running in a managed sandbox and through the normal authenticated Agent Manager API for a local human `mgd` client if later enabled.

### DSH discovery

A Magda DSH skill provider loads:

1. trusted global skills;
2. current user-skill versions from Agent Manager.

User/global namespaces do not silently shadow one another.

Skill updates should be refreshable without replacing the sandbox. If the selected DSH version cannot dynamically reload a skill provider, the UI must expose an explicit "reload skills" operation rather than pretending the change is immediately active.

### Capture workflow as skill

After a successful task, the user can ask the agent to "save this as a skill".

The agent drafts the Markdown body, shows it to the user, and only writes it through the user-skill API after confirmation.

## Trusted global skills

Deployment/global skills are controlled by Magda deployers, not by sandbox users.

They may contain trusted code.

Initial v8 packaging rule:

- code-bearing global skills are built into/versioned with the agent runtime image;
- optional text-only deployment skills may also be mounted read-only from configuration;
- the agent user cannot modify either source.

This keeps trusted executable skill code within the normal image supply-chain/review process.

## Resource model

PoC measurements provide a useful initial baseline:

- idle sandbox: about 0.18-0.25 GiB;
- typical turn: about 0.36 GiB peak;
- 5M-row pandas analysis: about 1.1 GiB peak;
- gVisor overhead: about 55-70 MiB/sandbox;
- syscall-heavy workloads can consume significantly more CPU under gVisor.

Initial default:

```yaml
resources:
  requests:
    cpu: 250m
    memory: 512Mi
    ephemeral-storage: 512Mi
  limits:
    cpu: "2"
    memory: 2Gi
    ephemeral-storage: 2Gi
workspace:
  size: 2Gi
```

Deployments supporting larger analysis should raise memory/workspace limits.

The PoC demonstrated that a Pod-level memory limit can OOM-kill the gVisor sentry and restart the whole sandbox. The UI/Agent Manager must surface this as a runtime restart, not as a generic chat failure.

Per-command memory/process limiting is a follow-up hardening ticket.

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

## Failure handling

| Failure | Behaviour |
| --- | --- |
| Browser disconnect | sandbox remains running |
| Agent Manager restart | reconcile DB/claims; sandbox remains |
| DSH process restart | PVC survives; bridge reports new process; Manager reacquires upstream DSH auth |
| Pod OOM/restart | state becomes RECOVERING; PVC survives; user sees runtime restart |
| Magda API key expiry | state AUTH_EXPIRED for Magda operations; DSH/workspace remains |
| LLM provider outage | DSH reports provider failure; session remains |
| Sandbox claim failure | state FAILED with reset/retry action |
| PVC/storage loss | session FAILED; user skills unaffected |
| reset cleanup failure | new session may proceed with unique name; old resource is reported for cleanup |

## Security model

### Protected assets

- host node/kernel;
- other users' sandboxes/PVCs;
- Kubernetes control plane;
- Magda credentials;
- LLM/provider credentials;
- private Magda data the user is not authorised to access;
- durable user skills.

### Primary threats

- model-generated malicious command;
- prompt injection from dataset/document content;
- sandbox escape;
- cross-tenant network access;
- credential exfiltration;
- resource exhaustion;
- abuse of user/admin Magda permissions;
- malicious user skill text;
- compromised external data source.

### Controls

**Sandbox escape**

- gVisor RuntimeClass in production;
- common Pod hardening;
- optional future Kata.

**Cross-tenant**

- one PVC per sandbox;
- managed NetworkPolicy;
- no service-account token;
- Service FQDN bound to one Sandbox.

**Credentials**

- real Magda/LLM keys outside sandbox;
- opaque internal capability only;
- short-lived rotating Magda key;
- credential-management routes denied from agent proxy.

**Consequential mutations**

- read-only initial proxy;
- later server-issued mutation grants.

**Resource exhaustion**

- Pod/PVC limits;
- per-user one-session limit;
- provider/model budgets;
- future per-command resource limits.

**Malicious user skill**

- text-only;
- user ownership;
- normal DSH execution confinement still applies.

## Observability and audit

Agent Manager exposes metrics such as:

- active sessions by state/runtime;
- provisioning/ready latency;
- Sandbox restarts/OOMs;
- DSH readiness;
- Magda proxy request counts/latency/status;
- LLM requests/tokens/cost where available;
- skill CRUD;
- reset/cleanup failures.

The PoC found the existing Magda authorisation path becomes a bottleneck under concurrent agent API loops. Production sizing must include `authorization-api` and registry scaling/rate limits.

Audit events for consequential operations should record:

- user/session id;
- timestamp;
- `mgd` invocation id where present;
- method/route/record identifiers;
- approval grant id;
- result.

Do not centralise prompt bodies, downloaded data, API keys or provider secrets in normal operational logs.

## Helm/deployment configuration

Illustrative values:

```yaml
agent:
  enabled: false

  manager:
    replicas: 1

  sandbox:
    securityProfile: production       # production | trusted-dev
    runtimeClassName: gvisor
    image: ghcr.io/magda-io/magda-agent:<version>

    resources:
      requests:
        cpu: 250m
        memory: 512Mi
      limits:
        cpu: "2"
        memory: 2Gi

    workspace:
      storageClassName: ""
      size: 2Gi

    warmPool:
      replicas: 0

    externalNetworkAccess: public-https

  model:
    allowedModels: []
    # provider secrets come from Kubernetes Secrets, never chart values

  skills:
    # trusted global skill configuration/image options
    enabled: true
```

For local development:

```yaml
agent:
  enabled: true
  sandbox:
    securityProfile: trusted-dev
    runtimeClassName: ""
```

Chart validation:

- production profile requires a non-empty RuntimeClass;
- trusted-dev profile emits a warning that runc is not a strong untrusted-code boundary;
- no profile enables privileged/host mounts.

Agent Sandbox CRDs/controller and the configured RuntimeClass are explicit installation prerequisites.

gVisor must be pinned by release rather than relying on a moving "latest" installer URL; #3812 demonstrated that the Minikube addon download path can drift/break.

## DSH version and integration policy

Pin DSH in the agent runtime image.

Upgrading DSH is treated like upgrading an execution runtime and requires the runc + gVisor integration suite.

Magda-specific integration should live in a small DSH plugin/profile plus the bridge/launcher rather than a large permanent fork.

Known PoC constraints to keep visible:

- gVisor + bubblewrap: confined bash has no PTY;
- the human DSH web terminal is outside bubblewrap command confinement;
- `read-only` bash is approval-heavy in DSH 0.2.0-rc.2;
- DSH CLI binds loopback by design;
- DSH browser launch token must be moved out of logs for production.

Where possible, upstream generic hooks should be proposed to DSH rather than carrying Magda-only patches.

## Relationship to the Data Understanding Layer

The v7 Data Understanding Layer is complementary:

- `data-dictionary`: what the distribution contains;
- `distribution-contract`: how it can be accessed/queried;
- `dataset-usage`: suitability and limitations.

The v8 agent can use these aspects through `mgd` to make planning more deterministic.

These aspects remain descriptive metadata; they do not replace Agent Manager execution policy, credentials, approval or network controls.

## Migration from the current WebGPU agent

Do not remove the current browser/WebGPU agent at the beginning of v8.

Recommended transition:

1. keep current WebGPU agent available as a lightweight/local feature;
2. add the v8 Agent Platform behind its own feature flag/entry point;
3. gather production evidence on reliability/cost/security;
4. decide later whether the WebGPU mode remains as a privacy/local option or is deprecated.

This avoids making v8 adoption depend on immediate feature parity.

## Implementation sequence / child-ticket breakdown

The design should be implemented in this order.

### A. Runtime foundation

1. **Productionise the agent runtime image and SandboxTemplate**
   - move PoC image conventions into supported deployment assets;
   - runc/gVisor runtime profiles;
   - Service FQDN;
   - bridge sidecar;
   - DSH workspace-write health;
   - no secrets baked into image.

2. **Implement DSH bridge/bootstrap contract**
   - token capture without logs;
   - readiness;
   - HTTP/WebSocket forwarding;
   - Manager-only ingress;
   - DSH restart re-authentication.

### B. Agent Manager MVP

3. **Agent Manager session controller**
   - DB;
   - one-active-session invariant;
   - create/reconcile/reset;
   - SandboxClaim/WarmPool integration;
   - unique names;
   - Service FQDN resolution.

4. **Browser -> Agent Manager -> DSH proxy**
   - same-origin gateway route;
   - WebSocket;
   - upstream DSH cookie held server-side;
   - reconnect/restart handling.

5. **Read-only delegated Magda proxy**
   - short-lived rotating user API key held by Manager;
   - opaque sandbox capability;
   - `mgd` managed-agent auth mode;
   - credential/admin route deny rules;
   - direct sandbox -> Magda blocked.

6. **LLM provider proxy**
   - session auth;
   - provider secret isolation;
   - allowed models;
   - streaming;
   - usage/budget telemetry.

### C. Product integration

7. **Magda web-client Agent experience**
   - provisioning/status/recovery;
   - DSH surface;
   - reset warning;
   - terminal/workspace restrictions.

8. **Server-enforced mutation approvals**
   - approval UX;
   - grant API;
   - `mgd` invocation binding;
   - audit;
   - enable create/edit/publish workflows.

### D. Skills

9. **User skill persistence/API**
   - DB schema/versioning/access control.

10. **`mgd agent-skill` commands + DSH user-skill provider**
    - list/get/create/update/delete;
    - refresh semantics;
    - capture-workflow-as-skill.

11. **Trusted deployment/global skills**
    - runtime-image packaging;
    - optional read-only text configuration;
    - precedence/namespacing.

### E. Hardening and operations

12. **Production egress controls**
    - public-data policy;
    - metadata/private network denial;
    - optional FQDN/egress proxy.

13. **Resource/abuse controls**
    - per-command resource limits;
    - session/provider quotas;
    - OOM recovery UX.

14. **Observability/security integration tests**
    - multi-user isolation;
    - runc/gVisor matrix;
    - credential exfiltration attempts;
    - reset/storage GC;
    - authz load.

15. **Helm/operator documentation**
    - Agent Sandbox prerequisite;
    - RuntimeClass setup;
    - production/trusted-dev profiles;
    - sizing.

## Acceptance mapping for #3811

This document makes concrete decisions for all #3811 scope areas:

- component architecture: defined;
- Agent Manager API/state model: defined;
- browser routing: defined;
- sandbox lifecycle: defined;
- DSH execution model: defined using #3812 findings;
- `mgd` integration: managed-agent proxy mode selected;
- delegated authentication: Manager-held rotating API key + opaque sandbox capability;
- user skills: text-only Manager-owned/versioned model;
- global skills: trusted image/config model;
- persistence: session PVC vs Manager DB separated;
- security/network/resource controls: defined;
- web UX: migration and production restrictions defined;
- deployment/Helm: runtime profiles and validation defined;
- observability/audit: defined;
- migration: coexistence with WebGPU mode selected.

Remaining uncertainties are intentionally isolated into implementation tickets rather than architecture ambiguity:

- exact DSH hook/patch used to deliver the launch token to the bridge without logs;
- exact external-data egress technology (NetworkPolicy + Cilium FQDN vs explicit egress proxy);
- exact mutation-grant shape for multi-request `mgd` commands;
- model-provider adapters beyond the first OpenAI-compatible path.
