# Session lifecycle design

**Status:** Accepted  
**Owner ticket:** #3822  
**Depends on:** [sandbox-runtime.md](./sandbox-runtime.md)  
**Blocks:** Agent Manager implementation and web lifecycle UX

## Identity model

The platform does not maintain a separate Agent session record/id.

```text
Magda user UUID
    -> deterministic SandboxClaim name
    -> claim.status.sandbox.name
    -> Sandbox
    -> Pod + Service + PVC
```

The claim UUID (`metadata.uid`) identifies a particular incarnation when required.

The one-user/one-current-sandbox invariant is enforced by deterministic Kubernetes resource identity rather than a separate database uniqueness constraint.

## Lifecycle states

The externally meaningful states are:

```text
ABSENT
  |
  v
ALLOCATING
  |
  v
BOOTSTRAPPING
  |
  v
READY
  |
  +---- idle ----> SUSPENDING -> SUSPENDED
  |                              |
  |<---------- activity ----------+
  |
  +---- logout/new session/expiry ----> DELETING -> ABSENT

Any stage may enter FAILED/DEGRADED with a user-visible reason.
```

Kubernetes `Ready=True` means the Sandbox infrastructure is ready. Magda `READY` additionally means post-claim bootstrap has completed and DSH may be exposed to the browser.

## First-use / new-agent sequence

1. Resolve the authenticated Magda user UUID.
2. If a current claim exists and the user explicitly requested a new agent, delete the old sandbox lifecycle first.
3. Remove any stale system-managed agent API key(s) for the user.
4. Create one fresh system-managed Magda API key.
5. Create/adopt the deterministic `SandboxClaim` from the configured WarmPool.
6. Watch the Claim `Ready` condition and read `status.sandbox.name`.
7. Resolve the backing Pod (current Agent Sandbox contract: same name as Sandbox).
8. Run the Magda bootstrap helper through Kubernetes exec with bootstrap data on stdin.
9. Bootstrap writes the `mgd` profile and DSH provider/default-model config to PVC-backed paths and verifies required access.
10. Mark the user-visible state READY and allow the DSH browser proxy.

Failure cleanup is idempotent: remove a partially created claim and revoke a newly created managed API key.

## Browser reconnect and resume

A browser refresh/disconnect does not destroy the Sandbox.

If the Sandbox is RUNNING, reconnect proxies to the existing DSH instance.

If the Sandbox is SUSPENDED:

1. set `Sandbox.spec.operatingMode=Running`;
2. wait for Sandbox `Ready=True`;
3. wait for DSH/bridge readiness;
4. proxy the browser back to the same PVC-backed DSH environment.

No new Magda API key is created on resume.

## Inactivity

Defaults are configurable:

```text
suspend after: 30 minutes
delete after:   8 hours
```

"Meaningful activity" must not be equated with raw HTTP/WebSocket traffic. Static requests, keepalives and background pings do not keep a Sandbox alive.

Meaningful activity includes user interaction and an actively executing foreground agent turn/tool flow. Agent Manager/Gateway may throttle persistence of the last-activity timestamp rather than writing on every frame.

When idle reaches the suspend threshold, Agent Manager sets the Sandbox to `Suspended`.

The hard deletion deadline is maintained using Agent Sandbox lifecycle/shutdown semantics so abandoned sandboxes are eventually removed even if Agent Manager is restarted/unavailable.

## Logout

Explicit user logout triggers immediate best-effort permanent cleanup:

- revoke/delete the system-managed agent API key;
- delete the SandboxClaim;
- allow Agent Sandbox/StorageClass GC to delete Sandbox/Pod/Service/PVC.

A later reconciliation pass must clean leftovers after partial failure.

## New agent / reset

Starting a new DSH agent means:

1. warn that current sandbox-local state will be lost;
2. revoke the current managed Magda API key;
3. delete the current claim/sandbox/PVC;
4. create a fresh managed key;
5. claim a fresh warm/cold Sandbox;
6. bootstrap and expose it.

The deterministic claim name may be reused only after the previous claim has been deleted; the new Kubernetes UID distinguishes the generation.

## Process restart semantics

Persistent filesystem state survives:

| Event | PVC / DSH session files |
| --- | --- |
| browser disconnect | survives |
| Agent Manager restart | survives |
| DSH process restart | survives |
| Pod replacement | survives |
| Sandbox suspend/resume | survives |
| start new agent | deleted |
| logout / hard idle deletion | deleted |

Running process memory is not preserved. Long-running user processes may be terminated by suspend/Pod replacement. After resume, DSH can inspect durable session/workspace state and continue/restart work.

## Control-plane persistence

Agent Manager does not need its own database for lifecycle state.

Kubernetes resources are authoritative. Non-secret operational metadata such as last meaningful activity may be stored as claim annotations, while the server-side hard delete deadline uses Agent Sandbox lifecycle fields.

User-created durable skills are a separate future design and are not stored in Agent Manager merely to support sandbox lifecycle.
