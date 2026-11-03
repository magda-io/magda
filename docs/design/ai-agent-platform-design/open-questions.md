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

**#3850 configuration follow-ups merged into `next` on 21 October 2026:** `allowedModels` is a YAML array retained as a deployment-level gate; the bundled single-model LiteLLM allowlist must match its one alias, while external backends can allow multiple model aliases. Padded array entries are normalized by trimming (and blank/duplicate normalized entries are rejected). The chart defaults to `global.defaultAgentModel.reasoningEffort: medium`; operators set **`reasoningEffort: ""`** to omit the effort from both DSH and LiteLLM, rather than using a sentinel string or YAML `null`. The remaining long-term LLM design work is Registry-backed per-user authorization and quota enforcement, not more foundational model-default changes.

Still open for #3838: exact external model/protocol API surface; service-to-Authorization API trusted identity/reconciliation; durable usage ledger and concurrent/streaming quota reservations; provider usage normalization; internal LiteLLM credential lifecycle; streaming/error/usage propagation; multi-replica/no-Redis HA details.

## GKE / MVP design reconciliation (evidence, not silently settled contracts)

The GKE transport/storage PoC is [#3848 / PR #3852](https://github.com/magda-io/magda/pull/3852); the integrated MVP is [merged PR #3850](https://github.com/magda-io/magda/pull/3850). The following items remain open despite successful real-GKE L4/DSH/gVisor/PD tests:

1. **NetworkPolicy enforcement:** #3852's legacy-datapath GKE cluster admitted KAS policies but did not enforce them. Qualify a real GKE Dataplane V2/Calico environment with negative and positive peer/private/metadata probes. Decide whether a functional denial canary, cluster attestation or operator qualification is an enforceable prerequisite; mere presence of `NetworkPolicy` is not sufficient.
2. **Workload Identity / cloud metadata:** `automountServiceAccountToken: false` did not prevent metadata-token HTTP 200. Choose an explicit low-privilege Sandbox KSA, audit namespace/pool-wide `principalSet` IAM bindings, verify **effective** token permissions and validate optional metadata network denial without disrupting required GKE platform paths. The PoC did not prove privileged IAM access.
3. **GKE ingress controller maintenance:** #3852 validated **community ingress-nginx's external L4** route, but that upstream controller is retired. Check actual IngressClass controller (F5 may own `nginx`); select/qualify a maintained successor rather than assuming GCE L7 is equivalent. Native GCE L7 remains unsupported (#3851).
4. **Provider-dependent storage/HA:** zonal GCE PD CSI suspend/resume/reclaim and `fsGroupChangePolicy: OnRootMismatch` are proven; regional volumes, multi-zone/HA, rolling updates and Spot preemption guarantees are not.

**Implemented in merged #3850 (focused tests reviewed):** Long foreground DSH turns
now renew activity through verified `api-session/status` running events and
connection-scoped snapshots without counting idle WebSocket pings. Claim
activity/deadline is persisted before dispatch; managed-key extension is
retried and repaired from the durable claim after restart. This is not a
distributed atomic write or a claim of GKE infrastructure qualification.
See [session-lifecycle.md](./session-lifecycle.md).

See [network-security.md](./network-security.md), [deployment.md](./deployment.md), [session-lifecycle.md](./session-lifecycle.md) and [authentication.md](./authentication.md). GKE is **not yet production security-qualified** simply because the #3852 transport/storage tests passed.

## Skill system — accepted MVP and remaining boundaries

Merged #3850 implements all expanded skill
stages: #3854 typed Registry-backed publications/Storage-source read
boundaries/OPA, #3855 scan-based `mgd agent-skill` and non-blocking
Workspace synchronization, #3856 workflow capture and single publication
approval, #3857 Settings catalogue/confirmed Retry / Re-check, and #3858
grantable own-Workspace authorization. The complete PR merged into the `next` development branch on 21 October 2026;
this does not by itself mean the Agent Workspace is included in a released MAGDA version. Refer to [skills.md](./skills.md),
[web-ui.md](./web-ui.md) and
[local-agent-skill-sync.md](./local-agent-skill-sync.md).

Merged #3864 completed #3861 cross-user sharing, persistent recipient installations, Shared Skills UI and fork on 25 October 2026.
Generic Registry mutation hardening (#3862) is complete: generic record writes
check the current and proposed state within the mutation transaction (#3870,
#3880), and only admins and unconstrained grant holders can write skill records
and archives directly. Agent Services is the supported validated skill
lifecycle; those trusted direct writers retain the documented consistency risk.

## Recent implementation follow-ups and evidence (4 November 2026)

- **Skill sharing:** #3861 / merged #3864 provides typed source-scoped sharing, explicit recipient installations, authorized manifests and fork. Real-world two-user qualification under #3866 remains open for independent observation and regression evidence.
- **Python/data analysis:** #3895 / merged #3896 provides pinned `uv`, fallback isolated Python environments, per-user PVC-backed caches/temp files, runtime guidance with explicit installation-consent instructions, and a **10 GiB new-PVC default**. Consent is guidance, not a runtime enforcement mechanism. #3897 / merged #3898 exposes configured and cgroup resource information and cautions against reporting host CPU/RAM or Minikube node filesystem capacity as user quotas. See [sandbox-runtime.md](./sandbox-runtime.md) and [deployment.md](./deployment.md).
- **Registry authorization/migration:** #3870/#3876/#3878/#3879/#3880 delivered concrete mutation and CI improvements; #3862 is closed. Generalized upgrade of *all* bundled built-in aspect definitions remains separate [#3883](https://github.com/magda-io/magda/issues/3883), building on #3864's existing `access-group-details` migration special case.
- **Product acceptance:** #3866 requires an independent, documented rubric for changed-input skill reuse, resource-backed ML and explicit two-user sharing, including negative authorization checks. Demo footage alone does not close acceptance.

## Later design areas

- optional structured DSH approval integration for mutating `mgd` operations;
- provider-specific **functional** network policy enforcement and Cloud IAM qualification (GKE security matrix above);
- real-world two-user sharing, model-resource authorization and fresh-Workspace reuse qualification (#3866); the #3861 implementation itself is merged, with no new skill DB/bucket; 
- full web/product UX;
- remaining provider/ingress **security** qualification, including #3848 / PR #3852 (GKE transport evidence) and #3851 (future native GCE L7 study); #3846 DSH CSP and #3847 nginx WebSocket timeouts were completed in merged #3850;
- observability/audit;
- WebGPU migration/deprecation;
- AKS/Kata production qualification;
- future EKS/Fargate support (#3821).

Do not reopen accepted foundation questions merely because implementation details differ. If implementation evidence invalidates a contract, update the owning design explicitly.
