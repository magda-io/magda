# Session lifecycle design

**Status:** Draft  
**Owner ticket:** #3822  
**Depends on:** sandbox runtime contract  
**Blocks:** Agent Manager state machine, persistence guarantees, reconnect/reset UX  
**Evidence:** #3812 lifecycle evidence; additional focused experiments if required

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

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

## Important provisional point: PVCs

The inherited design above assumes one PVC per session. That is **not yet an accepted platform requirement**.

#3822 must decide the initial session/workspace durability contract:

- what must survive browser disconnect;
- what must survive DSH restart;
- what must survive Pod replacement;
- what must survive Sandbox replacement;
- whether a persistent volume is required for all supported production profiles;
- whether disposable/ephemeral workspace is sufficient for some profiles.

This decision affects Agent Manager recovery, EKS/Fargate feasibility, reset semantics and cost.
