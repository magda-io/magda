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

The updated [skills.md](./skills.md) specifies **Registry `agent-skill` + `access-control` record metadata**, caller-authorized **Storage API** access to one ZIP per published skill in the existing default bucket, `magda-record-id` linkage, scope-aware `object/agentSkill/create|read|update|delete` OPA policy, and `mgd agent-skill` draft/review/publish/sync. Do not add direct Agent Services MinIO access, a new bucket, a skill DB or application version history. The catalogue page provides paginated authorized skill discovery and user ZIP download/replace-only upload, not full creation/editing. The Workspace control API uses grantable `agentWorkspace/access` (own user only). Implement incrementally in draft #3850 under #3854–#3857, with foundational #3858. **These changes are agreed design, not yet shipped.**

Remaining qualification: `object/record/*` type delegation and fallback exclusion; **scope-aware early OPA checks for all Agent Services skill endpoints**, including Registry-fetched scope for existing records and safe per-record listing; verify that independently authorized generic Registry/Storage writes may cause **integrity inconsistencies**, without imposing a new reserved-prefix restriction; **#3853 generic Storage API metadata fix reused unchanged by #3854**; Registry/ZIP partial-failure recovery; MinIO gateway/default-bucket compatibility; ZIP/ETag/sync; DSH provider discovery; local PVC history; and UI/Workspace permission gates. The separate Storage API owner-metadata mismatch is tracked in [#3853](https://github.com/magda-io/magda/issues/3853).

## Later design areas

- optional structured DSH approval integration for mutating `mgd` operations;
- provider-specific **functional** network policy enforcement and Cloud IAM qualification (GKE security matrix above);
- implement and qualify [Registry-backed skills, specialized OPA, Storage API, `mgd`, capture, and catalogue UI](./skills.md) in expanded #3850 via #3854–#3857, plus `agentWorkspace/access` #3858; no extra skill DB/bucket or mandatory application version history; 
- full web/product UX;
- remaining provider/ingress **security** qualification, including #3846 (DSH CSP), #3847 (nginx WebSocket timeouts), #3848 / PR #3852 (GKE transport evidence) and #3851 (future native GCE L7 study);
- observability/audit;
- WebGPU migration/deprecation;
- AKS/Kata production qualification;
- future EKS/Fargate support (#3821).

Do not reopen accepted foundation questions merely because implementation details differ. If implementation evidence invalidates a contract, update the owning design explicitly.
