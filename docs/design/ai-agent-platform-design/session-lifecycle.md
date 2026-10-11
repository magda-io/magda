# Session lifecycle design

**Status:** Accepted foundation (#3822), with explicit MVP implementation details and one unresolved foreground-work semantics question  
**Owner ticket:** #3822; implementation PR #3850  
**Depends on:** [sandbox-runtime.md](./sandbox-runtime.md), [authentication.md](./authentication.md)  
**Blocks:** Agent Manager and web lifecycle UX

## Identity and ownership

There is no separate Magda Agent session database/id. Each Magda **installation + user UUID** has one current deterministic `SandboxClaim` (the #3850 naming pattern is `magda-agent-<installation-id>-<user-uuid>`). The claim resolves its adopted Sandbox via `status.sandbox.name`. The claim's Kubernetes `metadata.uid` distinguishes a new incarnation after reset.

Installation-scoped naming/labels and API-key reservation isolate different Magda releases, even when an operator configures the same Sandbox namespace.

## States

```text
ABSENT
   -> ALLOCATING -> BOOTSTRAPPING -> READY
                                      |
                        inactivity -> SUSPENDING -> SUSPENDED
                                      ^                |
                                      +--- RESUMING ---+
                   logout/reset/expiry -> DELETING -> ABSENT

Failure/reconciliation states include FAILED and DEGRADED.
```

KAS `Ready=True` proves infrastructure readiness. Magda `READY` additionally means post-claim user bootstrap finished and DSH can be exposed to the browser.

## First use / reset

Current MVP #3850 deliberately creates a **persisted claim first**, before rotating/issuing the user's raw Magda key. The sequence is:

1. Authenticate user and check installation's deterministic current claim.
2. If starting a new workspace, warn about permanent loss and destroy the previous claim/PVC and revoke its managed API key.
3. Persist the new claim, with installation-scoped ownership, last-activity annotation and KAS lifecycle deletion deadline.
4. Remove the installation's stale reserved managed keys; issue one fresh user-scoped system-managed key **with an eight-hour expiry**.
5. Wait for `claim.status.sandbox.name`, Pod readiness and warm/cold adoption.
6. Run post-claim bootstrap through `pods/exec` with secret material on stdin; write restrictive PVC-backed DSH and `mgd` config, then confirm DSH restart/readiness.
7. Mark the workspace `READY`, expose the same-origin runtime proxy.

A crash during ALLOCATING/BOOTSTRAPPING may leave partially written sensitive data on the PVC. Recovery must fail closed: revoke the reserved key and then destroy the claim/PVC. Do not expose a partially bootstrapped Sandbox to the browser.

The key and claim are installation-scoped. It is incorrect to rotate another installation's reserved key for the same Magda user.

## Browser reconnect, suspend and resume

A browser refresh/disconnect does not destroy the Sandbox. When READY, route to its existing DSH instance. When SUSPENDED, set `Sandbox.spec.operatingMode=Running`, wait for Pod/DSH readiness on the **same PVC**, and reconnect; do **not** rotate the key merely on resume. Successful explicit resume renews the persisted activity/deletion deadline and matching key expiry.

Suspend/resume preserves **disk** state, not process memory or running tool processes. On CSI storage, `fsGroupChangePolicy: OnRootMismatch` prevents DSH's mode-0600 credentials being broadened on remount (verified in real GKE PoC #3852).

## Inactivity contract and current MVP mapping

Accepted configurable defaults:

```text
suspend after 30 minutes of meaningful inactivity
permanently delete after 8 hours of meaningful inactivity
logout/reset -> immediate destructive cleanup
```

An open WebSocket, DSH heartbeat/ping-pong, passive browser polling, static reads/list/catalog/status or a background transport stream **must not** keep a Sandbox indefinitely alive.

**#3850 implementation evidence (not necessarily final semantic contract):** successful, authenticated explicit DSH HTTP mutation operations such as prompt/session/terminal creation, rename, write, cancel and delete, plus an explicit resume, count as activity. HTTP method alone does not count: DSH uses POST for both reads and mutations. The Manager rate-limits claim activity writes. Browser/WebSocket Remote streams and keepalives are excluded. A successful qualifying operation updates the claim's `agent.magda.io/last-activity` annotation and `SandboxClaim.spec.lifecycle.shutdownTime`, and extends the managed API-key expiry to the same activity-relative deadline. KAS's shutdown deadline provides cleanup even when the Manager is absent; Manager reconciliation handles idle suspension.

**Unresolved accepted-design vs MVP semantics:** the original #3822 design included **an actively executing foreground agent turn/tool flow** as meaningful activity. A tool or inference executing for over 30 minutes might produce only WebSocket/Remote stream events after its initial HTTP prompt. If #3850 treats only that initial prompt as activity, reconciliation could suspend **active foreground work**. We must decide and test either:

- preserve foreground activity while a **verified active** turn/tool is still executing (without treating any open socket or background heartbeat as active); or
- explicitly scope alpha semantics to interaction-based inactivity and warn that long-running foreground work can be interrupted.

Do **not** silently substitute one definition for the other. Test a foreground operation longer than the suspension threshold, plus an idle-open-WS control case, before considering this semantic decision settled.

## Persistence consistency and partial failures

The **intended invariant** is that after a recorded meaningful event, both the KAS deletion deadline and managed key expiry reflect the same monotonic activity-based deadline. Both stores must resist replay of older activity timestamps, be idempotent on retries and reconcile independently after restart/partial error.

**Implementation gap to resolve in #3850:** `RuntimeProxy.touchActivity` currently stores the in-memory rate-limit timestamp *before* an asynchronous write completes; failure is logged without an immediate retry. The Manager currently renews claim deadline and API-key expiry with `Promise.all`, so one can succeed while the other fails. This is **not an atomic two-store update**. Add tests for partial update success, concurrent/late writes, near-expiry renewal and Manager restart. Until a retry/reconciliation policy is implemented, do not describe this as fully fail-safe inactivity renewal.

The Manager must recover persisted SUSPENDING/RESUMING/DELETING states after process restart. An interrupted bootstrap should destroy the incomplete workspace fail-closed. Failed credential revocation must retain a visible/retryable DELETING state and claim/PVC; do not first destroy the only evidence needed for cleanup.

## Logout and reset

Explicit logout/reset:

1. close the user's active Agent Manager -> DSH proxy sockets;
2. revoke the installation-scoped managed Magda API key (fail closed/retry on failure);
3. delete the claim and KAS-owned Sandbox, Service, Pod and PVC, with StorageClass reclaim of backing media;
4. ensure later reconciliation repairs incomplete cleanup.

Reusing a deterministic claim name is safe only after the previous claim has actually been deleted; the Kubernetes UID identifies the new incarnation. Show a clear unsaved-data warning before reset/logout.

## Process and data lifecycle matrix

| Event | PVC / DSH session files | Processes | Managed key |
| --- | --- | --- | --- |
| Browser refresh | Preserved | Continue | Preserved |
| Agent Manager restart | Preserved | Continue | Preserved |
| DSH process restart | Preserved | Restart | Preserved |
| Pod replacement / suspension | Preserved | Terminated/recreated | Preserved |
| Resume | Same PVC | New process | Same key; expiry renewed |
| Reset/new workspace | Deleted and replaced | Terminated | Revoked/rotated |
| Logout/hard inactivity deletion | Deleted | Terminated | Revoked |

## Implementation and evidence

- Baseline design: #3822 / #3823 and [sandbox-runtime.md](./sandbox-runtime.md).
- Local runc/gVisor and stock DSH auth: [PR #3844](https://github.com/magda-io/magda/pull/3844).
- GKE gVisor/PD suspend-resume and remount regression/fix: [PR #3852](https://github.com/magda-io/magda/pull/3852).
- Current integrated Agent Manager implementation and lifecycle tests: [draft PR #3850](https://github.com/magda-io/magda/pull/3850). Its activity/error semantics require the additional tests above.
