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

The architecture is settled around reusable LLM Services + private LiteLLM. The **future authorization and quota direction is now agreed** and documented in [llm-access-profiles.md](./llm-access-profiles.md): typed `llm-access-profile` records, LLM Services-managed Registry/Auth API resource lifecycle, per-profile dynamic invoke operations, dedicated `llm/access/*/access` wildcard, any-one-profile OR access, optional per-user token quotas, one deployment-wide calendar timezone and LLM Services-generated usage snapshots for OPA. Hard quota correctness requires atomic accounting outside OPA. **This is design only, not implemented in #3850.**

**#3850 configuration follow-ups implemented in its draft branch (not yet merged):** `allowedModels` is a YAML array retained as a deployment-level gate; the bundled single-model LiteLLM allowlist must match its one alias, while external backends can allow multiple model aliases. Padded array entries are normalized by trimming (and blank/duplicate normalized entries are rejected). The chart defaults to `global.defaultAgentModel.reasoningEffort: medium`; operators set **`reasoningEffort: ""`** to omit the effort from both DSH and LiteLLM, rather than using a sentinel string or YAML `null`. The remaining long-term LLM design work is Registry-backed per-user authorization and quota enforcement, not more foundational model-default changes.

Still open for #3838: exact external model/protocol API surface; service-to-Authorization API trusted identity/reconciliation; durable usage ledger and concurrent/streaming quota reservations; provider usage normalization; internal LiteLLM credential lifecycle; streaming/error/usage propagation; multi-replica/no-Redis HA details.

## GKE / MVP design reconciliation (evidence, not silently settled contracts)

The GKE transport/storage PoC is [#3848 / PR #3852](https://github.com/magda-io/magda/pull/3852); the integrated MVP is [draft PR #3850](https://github.com/magda-io/magda/pull/3850). The following items remain open despite successful real-GKE L4/DSH/gVisor/PD tests:

1. **NetworkPolicy enforcement:** #3852's legacy-datapath GKE cluster admitted KAS policies but did not enforce them. Qualify a real GKE Dataplane V2/Calico environment with negative and positive peer/private/metadata probes. Decide whether a functional denial canary, cluster attestation or operator qualification is an enforceable prerequisite; mere presence of `NetworkPolicy` is not sufficient.
2. **Workload Identity / cloud metadata:** `automountServiceAccountToken: false` did not prevent metadata-token HTTP 200. Choose an explicit low-privilege Sandbox KSA, audit namespace/pool-wide `principalSet` IAM bindings, verify **effective** token permissions and validate optional metadata network denial without disrupting required GKE platform paths. The PoC did not prove privileged IAM access.
3. **GKE ingress controller maintenance:** #3852 validated **community ingress-nginx's external L4** route, but that upstream controller is retired. Check actual IngressClass controller (F5 may own `nginx`); select/qualify a maintained successor rather than assuming GCE L7 is equivalent. Native GCE L7 remains unsupported (#3851).
4. **Provider-dependent storage/HA:** zonal GCE PD CSI suspend/resume/reclaim and `fsGroupChangePolicy: OnRootMismatch` are proven; regional volumes, multi-zone/HA, rolling updates and Spot preemption guarantees are not.

**Resolved by draft #3850 (focused tests reviewed):** Long foreground DSH turns
now renew activity through verified `api-session/status` running events and
connection-scoped snapshots without counting idle WebSocket pings. Claim
activity/deadline is persisted before dispatch; managed-key extension is
retried and repaired from the durable claim after restart. This is not a
distributed atomic write or a claim of GKE infrastructure qualification.
See [session-lifecycle.md](./session-lifecycle.md).

See [network-security.md](./network-security.md), [deployment.md](./deployment.md), [session-lifecycle.md](./session-lifecycle.md) and [authentication.md](./authentication.md). GKE is **not yet production security-qualified** simply because the #3852 transport/storage tests passed.

## Skill system — accepted MVP and remaining boundaries

Draft #3850 has implemented and passed focused review for all expanded skill
stages: #3854 typed Registry-backed publications/Storage-source read
boundaries/OPA, #3855 scan-based `mgd agent-skill` and non-blocking
Workspace synchronization, #3856 workflow capture and single publication
approval, #3857 Settings catalogue/confirmed Retry / Re-check, and #3858
grantable own-Workspace authorization. The complete PR remains draft pending
integrated documentation, Helm/migration and test hygiene; none is shipped
until merge/release. Refer to [skills.md](./skills.md),
[web-ui.md](./web-ui.md) and
[local-agent-skill-sync.md](./local-agent-skill-sync.md).

Future #3861 owns cross-user sharing and persistent recipient installations.
Generic Registry mutation hardening remains #3862/draft #3863, not part of the
MVP. Agent Services is the supported validated skill lifecycle; generic
Registry/Storage writes retain their deliberately documented consistency risk.

## Later design areas

- optional structured DSH approval integration for mutating `mgd` operations;
- provider-specific **functional** network policy enforcement and Cloud IAM qualification (GKE security matrix above);
- cross-user sharing/recipient installation records, system-skill access management and future sharing UX (#3861), without a new skill DB/bucket or mandatory application version history; 
- full web/product UX;
- remaining provider/ingress **security** qualification, including #3846 (DSH CSP), #3847 (nginx WebSocket timeouts), #3848 / PR #3852 (GKE transport evidence) and #3851 (future native GCE L7 study);
- observability/audit;
- WebGPU migration/deprecation;
- AKS/Kata production qualification;
- future EKS/Fargate support (#3821).

Do not reopen accepted foundation questions merely because implementation details differ. If implementation evidence invalidates a contract, update the owning design explicitly.
