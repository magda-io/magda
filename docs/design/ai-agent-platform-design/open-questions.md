# Open questions and evolving design queue

**Status:** Continuously maintained under #3811

## Foundation now settled

#3822, #3823, #3824 and #3825 are Accepted:

- one user -> one deterministic SandboxClaim -> one current Sandbox;
- no Agent Manager database or separate session id;
- claim status resolves warm-adopted Sandbox;
- dedicated PVC per Sandbox;
- configurable WarmPool (0 local/lightweight, 2 recommended production start);
- post-claim Kubernetes-exec bootstrap;
- 30m meaningful-idle suspend / 8h **activity-relative** hard delete defaults;
- logout/new-agent permanent cleanup;
- DSH/workspace disk persistence but no process-memory persistence;
- one **installation-scoped, renewable-expiring** system-managed user-scoped Magda API key is placed in the Sandbox;
- the agent acts on behalf of the user under normal Magda auth/OPA;
- mutation confirmation is an agent/DSH UX contract rather than a separate server-side delegated-authority boundary;
- provider credentials remain outside the Sandbox.

## Remaining dependency-critical questions

#3824 is now Accepted based on #3841. Its settled contract includes direct DSH `0.0.0.0:3080` exposure with no bridge, HTTP + WebSocket proxying, stock server-held DSH auth for MVP, `X-Magda-Session` termination at Agent Manager, and `workspace-write` + `ask` defaults with persistent Full Access hidden in the managed UI.

### #3838 — Magda LLM Services

The architecture is settled around a separate reusable Magda LLM Services + internal LiteLLM component. Remaining detail includes:

- exact external model APIs;
- generic-authorisation resource/action shape;
- model aliases/config;
- internal LiteLLM credential lifecycle;
- streaming/error/usage behavior;
- HA documentation with Redis disabled.

## GKE / MVP design reconciliation (evidence, not silently settled contracts)

The GKE transport/storage PoC is [#3848 / PR #3852](https://github.com/magda-io/magda/pull/3852); the integrated MVP is [draft PR #3850](https://github.com/magda-io/magda/pull/3850). The following items remain open despite successful real-GKE L4/DSH/gVisor/PD tests:

1. **NetworkPolicy enforcement:** #3852's legacy-datapath GKE cluster admitted KAS policies but did not enforce them. Qualify a real GKE Dataplane V2/Calico environment with negative and positive peer/private/metadata probes. Decide whether a functional denial canary, cluster attestation or operator qualification is an enforceable prerequisite; mere presence of `NetworkPolicy` is not sufficient.
2. **Workload Identity / cloud metadata:** `automountServiceAccountToken: false` did not prevent metadata-token HTTP 200. Choose an explicit low-privilege Sandbox KSA, audit namespace/pool-wide `principalSet` IAM bindings, verify **effective** token permissions and validate optional metadata network denial without disrupting required GKE platform paths. The PoC did not prove privileged IAM access.
3. **Active foreground work vs idle interactions:** #3822 said executing a foreground tool/turn counts as activity, but #3850 currently renews only on successful explicit HTTP mutation RPCs/resume. Resolve and test a >30-minute foreground operation while rejecting idle heartbeat/Remote stream as false activity.
4. **Activity/deadline/key-expiry consistency:** #3850 updates claim deadline and Authorization DB expiry separately and debounces before write success; define monotonic idempotent retries, partial-failure recovery and time-based tests.
5. **GKE ingress controller maintenance:** #3852 validated **community ingress-nginx's external L4** route, but that upstream controller is retired. Check actual IngressClass controller (F5 may own `nginx`); select/qualify a maintained successor rather than assuming GCE L7 is equivalent. Native GCE L7 remains unsupported (#3851).
6. **Provider-dependent storage/HA:** zonal GCE PD CSI suspend/resume/reclaim and `fsGroupChangePolicy: OnRootMismatch` are proven; regional volumes, multi-zone/HA, rolling updates and Spot preemption guarantees are not.

See [network-security.md](./network-security.md), [deployment.md](./deployment.md), [session-lifecycle.md](./session-lifecycle.md) and [authentication.md](./authentication.md). GKE is **not yet production security-qualified** simply because the #3852 transport/storage tests passed.

## Skill system — agreed decisions and implementation checks

The storage/auth/skill trust model is specified in [skills.md](./skills.md): existing default storage bucket accessed via the trusted Agent Services MinIO client; one ZIP object per current published skill under `agent-services/skills/`; runtime-bundled/system/user categories; admin-owned shared system publication; Markdown-only user bundles; all execution as current user; explicit `mgd agent-skill` draft/review/publish and manual sync after claim/bootstrap. No new bucket, separate Registry index, Agent Manager skill database or mandatory application-level versions. These are **design decisions for implementation**, not shipped by draft MVP #3850.

Remaining implementation-level verification: MinIO gateway/default-bucket compatibility, ETag/overwrite conflicts, ZIP decompression validation, strict server-derived ownership and skill-name collision handling; safe sync of unpublished local changes; DSH skill discovery in the pinned runtime; readable current-PVC session history for `capture-workflow`; and no inadvertent publication of local system-skill modifications. The separate Storage API owner-metadata mismatch is tracked in [#3853](https://github.com/magda-io/magda/issues/3853).

## Later design areas

- optional structured DSH approval integration for mutating `mgd` operations;
- provider-specific **functional** network policy enforcement and Cloud IAM qualification (GKE security matrix above);
- implement and qualify the **agreed** [three-category skill storage, permissions, CLI and capture workflow](./skills.md); no separate Agent Manager DB, Registry index or mandatory skill version history is required;
- full web/product UX;
- remaining provider/ingress **security** qualification, including #3846 (DSH CSP), #3847 (nginx WebSocket timeouts), #3848 / PR #3852 (GKE transport evidence) and #3851 (future native GCE L7 study);
- observability/audit;
- WebGPU migration/deprecation;
- AKS/Kata production qualification;
- future EKS/Fargate support (#3821).

Do not reopen accepted foundation questions merely because implementation details differ. If implementation evidence invalidates a contract, update the owning design explicitly.
