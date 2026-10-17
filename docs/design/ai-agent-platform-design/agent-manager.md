# Agent Manager design

**Status:** Accepted architectural foundation (#3823), aligned with MVP #3850; activity consistency/open foreground-turn policy need follow-up  
**Owner ticket:** #3823  
**Depends on:** #3822, #3824, #3825 and [session-lifecycle.md](./session-lifecycle.md)

## Responsibilities and boundaries

Agent Manager is Magda's **stateless** control-plane service for per-user Sandboxes. It authenticates the trusted Gateway-provided user, independently enforces MVP admin authorization, starts/adopts one Sandbox per **installation + user**, bootstraps credentials, proxies DSH HTTP/WSS, tracks meaningful activity, implements suspend/resume/reset/logout, and reconciles crash/cleanup states.

It does **not** host the LLM model/provider router (that is Magda LLM Services), maintain its own database, execute generated commands, or decide Kubernetes runtime/provider specifics.

## Durable sources of truth and identity

```text
installation + user UUID -> deterministic SandboxClaim (KAS control-plane)
claim.status.sandbox.name -> Sandbox / Pod / KAS Service
claim annotations/lifecycle -> user, installation, progress, last activity, deletion deadline
Sandbox PVC -> DSH sessions / workspace / mgd and DSH profiles
Authorization DB -> installation-scoped system-managed user API key/expiry
LiteLLM -> provider routing and provider secret (outside Sandbox)
```

#3850 derives a stable installation ID from Helm namespace/release and uses `magda-agent-<installation-id>-<user-uuid>` claim names plus `agent.magda.io/installation-id` and user labels. List/adopt/reconcile only claims in this installation; never accidentally act on another Magda release. The Sandbox namespace normally resolves to `<release-namespace>-agents` with an override, and the user key reserved name is also installation-scoped.

`SandboxClaim.metadata.uid` denotes a particular incarnation, not an extra Magda logical session id. Warm adoption means Sandbox name can differ from claim name; always resolve the bound Sandbox from claim status.

## KAS control protocol and readiness

Agent Manager uses Kubernetes/KAS APIs rather than a separate controller REST endpoint. It creates a claim **before** issuing the raw managed credential so an interrupted bootstrap is discoverable. It waits for claim status and Pod readiness, uses `pods/exec` with stdin to bootstrap, verifies the required DSH process restart, then exposes the runtime to the browser. Warm Sandboxes have DSH and a dedicated PVC but **no per-user secrets** before adoption.

Initial #3850 implementation may poll for readiness; watching instead is an optimization, **not** an accepted protocol requirement. The lifecycle invariant is to verify the actual adopted Pod/DSH is usable before returning READY.

Agent Manager creates/patches/deletes its own claims, patches Sandbox `operatingMode`, and relies on KAS for Pods/Services/PVC ownership and garbage collection.

## RBAC, Sandbox identity and transport

Agent Manager's ServiceAccount has **namespace-scoped** KAS claim/sandbox read/change permissions and tightly limited `pods/exec` (`get` + `create`) to read the stock DSH token and bootstrap. `pods/log` is not needed. No cluster-wide exec.

Manager proxies same-origin DSH HTTP and native `/api/remote.mux` WebSocket. Browser and Gateway authorization is rechecked; `X-Magda-Session`, Magda/browser Cookies, Authorization and proxy credentials are filtered before DSH. The Manager pins external Host and preserves Origin/Fetch headers needed for DSH's own trust fence. The DSH launch token and signed cookie are held only server-side; per-Sandbox cache may be independently refreshed by multiple Manager replicas.

Logout/reset/deletion must close active runtime sockets promptly, without waiting for KAS GC. **NetworkPolicy enforcement** is a mandatory separate cluster property for restricting direct Sandbox access (see [network-security.md](./network-security.md)): DSH's Host fence does not replace it.

## Post-claim bootstrap and managed key

After creating/adopting the claim, Agent Manager rotates the installation's reserved user-scoped Magda API key **with an initial eight-hour expiry**, then passes it through `pods/exec` stdin (never Pod args/env/labels/logs). The helper writes restrictive PVC-backed `mgd` and DSH managed-provider configuration. The same key allows ordinary external Magda `/api` requests and authenticated LLM facade calls; provider secrets stay inside the LLM Services/LiteLLM boundary.

Suspend/resume retains the same key. Successful resume and other **meaningful activity** extend expiry and `SandboxClaim.spec.lifecycle.shutdownTime`. A new workspace/reset rotates it; logout or permanent deletion revokes it before the claim/PVC are removed. Partial bootstrap/rotation cleanup must fail closed, retaining recoverable state until revocation succeeds.

The previously accepted notion of a key with **no intrinsic TTL** has been superseded in #3850 by an expiring system-managed key with a renewable deadline. This is a consistency and security improvement; see [authentication.md](./authentication.md).

## Lifecycle states / browser API

Representative operations:

```text
GET    /api/v0/agent/session
POST   /api/v0/agent/session
POST   /api/v0/agent/session/reset
DELETE /api/v0/agent/session
GET    /api/v0/agent/session/status
```

Route names may evolve; semantics remain one workspace, visible provisioning/ready/suspended/error/deleting status, and a separate authenticated DSH runtime proxy route.

`README`/UI should state data is ephemeral to the Sandbox and reset/logout is destructive.

## Activity tracking and failure semantics

30 minutes of **meaningful** inactivity -> suspend; eight hours -> hard delete. **Open transport, polling and heartbeat do not count.** #3850 currently counts successful explicit HTTP DSH mutation RPCs plus resume; original design includes actively executing foreground tools. The >30-minute foreground-tool case is **unresolved**: decide if and how verified active work renews state without letting a permanently idle WebSocket keep Sandboxes alive (see [session-lifecycle.md](./session-lifecycle.md)).

The claim activity/deadline write and Authorization DB key-expiry extension are **two separate writes**. The current MVP's parallel call is **not atomic**. The target invariant is a monotonic durable last-activity time and expiry/deletion deadline with retries after transient failure, no regression from stale/concurrent requests, and reconciliation after a Manager restart. A failed activity write must not be irreversibly suppressed by an in-memory debounce timestamp. This is pending implementation hardening in #3850, not already established by the code.

## Concurrency, restarts and cleanup

Serialize conflicting start/reset/delete per installation+user and make operations idempotent. A second request must converge on the same deterministic claim or be explicitly retried. Reconstruct state after Manager restart from Kubernetes claims, annotations and the Authorization API rather than an app DB.

- Interrupted ALLOCATING/BOOTSTRAPPING -> revoke managed credential, then delete partial Sandbox/PVC.
- Persisted SUSPENDING/RESUMING -> finish transition or explicitly fail visibly.
- DELETING/revocation failure -> retain identifiable claim/key and retry before destroying the evidence needed for cleanup.
- Reconcile idle claims based on persisted time and KAS lifecycle deadline even if the Manager was down.
- Never process other installations' claims/managed keys, including when namespaces are shared.

## Qualification evidence

- [PR #3844](https://github.com/magda-io/magda/pull/3844): local Gateway/Agent Manager/DSH stock-cookie and WS flow.
- [PR #3852](https://github.com/magda-io/magda/pull/3852): GKE ingress/KAS/gVisor transport **with a minimal stand-in proxy, without real Magda Gateway/auth**; no proof of NetworkPolicy enforcement.
- [PR #3850](https://github.com/magda-io/magda/pull/3850): integrated Manager and lifecycle tests; activity-renewal failure cases and GKE security gating need follow-up.
