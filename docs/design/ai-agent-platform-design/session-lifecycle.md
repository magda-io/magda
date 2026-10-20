# Session lifecycle design

**Status:** Accepted foundation (#3822), reconciled with draft MVP #3850 at `ae8c2f268` (2026-10-20); full GKE/provider qualification remains separate  
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

**Implemented MVP foreground-activity contract (#3850):** In addition to
authenticated, allowlisted DSH mutation RPCs and explicit resume, an **actively
executing foreground turn** renews activity while DSH reports it running. The
Agent Manager observes the pinned DSH `api-session/status` Remote events,
corroborates running sessions with connection-epoch/sequence-tagged
`session/list` snapshots, and renews activity on a bounded timer. An idle
WebSocket, background transport stream or ping/pong alone does **not** renew
activity. Per-socket ownership, a short disconnect/reconnect grace, and
out-of-order snapshot suppression prevent stale status from indefinitely
keeping an abandoned Sandbox alive. A >30-minute running turn and idle-open
WebSocket are covered by the draft MVP tests; this resolves the earlier
design-vs-implementation mismatch. Changes to the pinned DSH protocol require
requalification before relying on those event semantics.

## Persistence consistency and partial failures

The **intended invariant** is that after a recorded meaningful event, both the KAS deletion deadline and managed key expiry reflect the same monotonic activity-based deadline. Both stores must resist replay of older activity timestamps, be idempotent on retries and reconcile independently after restart/partial error.

**Implemented in draft #3850:** These remain two distinct durable stores,
not an atomic distributed transaction, but the Manager persists the monotonic
claim activity/`shutdownTime` first and then extends the system-managed key
expiry with bounded retries. `RuntimeProxy.touchActivity` now advances the
in-memory successful-write throttle only **after** persistence completes;
failed writes retain a pending timestamp and the corresponding DSH mutation is
not executed. Per-user renewal serialization prevents stale requests reducing
the deadline. On restart/periodic reconciliation the persisted claim timestamp
is reread and any partial key extension is repaired. The implementation has
retry/partial-failure, concurrent/late write, foreground and restart tests.
This is compensating reconciliation, **not** a claim of atomicity or immunity
to indefinite external dependency outages.

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
