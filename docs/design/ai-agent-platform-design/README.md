# Magda v8 AI Agent Platform Design

**Status:** Blueprint in progress — MVP/GKE evidence reconciled, security acceptance still open  
**Umbrella design issue:** #3811  
**Working PR:** #3819  
**Parent implementation epic:** #3810

This folder is the evolving implementation blueprint for the Magda v8 AI Agent Platform. See [design-process.md](./design-process.md) for the working model.

## Current architectural direction

```text
Browser
  |
  v
Magda Gateway
  |
  +------------------------------+
  |                              |
  v                              v
Agent Manager                Magda LLM Services
  |                              |
  | SandboxClaim/lifecycle       | Magda authz + proxy
  v                              v
Kubernetes Agent Sandbox      LiteLLM
  |                              |
  | runc / gVisor / Kata         +--> OpenAI
  v                              +--> Anthropic
DSH + mgd + tools                +--> AWS Bedrock
  |                              +--> Azure
  |                              +--> local OpenAI-compatible models
  |
  +--> Magda external endpoint (same system-managed Magda API key)
  +--> /api/v0/llm/... through Magda external endpoint
  +--> approved public Internet
```

## Settled foundation decisions

The following contracts are now the baseline for the initial v8 design:

- **one current sandbox per Magda user per installation**, with **multiple DSH sessions/conversations permitted** inside that sandbox; a user UUID plus installation ID is the stable ownership key;
- the deterministic `SandboxClaim` name is derived from the **Magda installation ID + user UUID** (`magda-agent-<installation-id>-<user-uuid>` in #3850), with both installation and user labels; this prevents cross-release adoption/cleanup;
- there is no separate Magda Agent session-id/database row; `SandboxClaim.metadata.uid` is sufficient when an incarnation/generation identifier is needed;
- Agent Manager is intentionally **stateless** for the initial scope: Kubernetes Agent Sandbox resources are the control-plane source of truth and the sandbox PVC is the source of truth for DSH/workspace state;
- Helm owns `SandboxTemplate` and `SandboxWarmPool`; Agent Manager creates/patches/deletes `SandboxClaim`; Agent Sandbox owns `Sandbox`, Pod, Service and template-created PVC lifecycle;
- Agent Manager always resolves the adopted sandbox from `SandboxClaim.status.sandbox.name`; warm-pool adoption does not rename the Sandbox;
- each Sandbox has its own PVC; an adopted warm sandbox/PVC becomes that user's sandbox and is never returned to the pool;
- the selected `agent-services.warmPool.type` (`runc`, `gvisor`, `kata`) renders **one** template/pool, with configurable size (production starting recommendation **2**, lightweight/local **0**);
- DSH starts in the generic warm sandbox without user credentials;
- after claim/adoption, Agent Manager bootstraps the sandbox with Kubernetes exec + stdin before exposing DSH to the browser;
- the bootstrap writes the `mgd` profile and DSH managed-provider/default-model configuration to PVC-backed paths;
- 30 minutes of configurable meaningful inactivity suspends the Sandbox; 8 hours of configurable inactivity deletes it; explicit logout deletes immediately;
- suspension preserves the PVC but not arbitrary running process memory; DSH/workspace/session data is reconstructed from disk on resume;
- starting a new agent destroys the old Sandbox/PVC and creates a fresh Sandbox; there is no attempt to sanitise/reuse an old user environment;
- each current sandbox has an **installation-scoped, user-scoped, system-managed Magda API key**, expiring with the renewable eight-hour inactivity deadline in #3850; retained and expiry-renewed on resume, rotated for a new sandbox, and revoked on permanent deletion/logout;
- the same Magda API key is used by `mgd` and by DSH when calling the external Magda LLM API;
- shared LLM access is owned by a separate **Magda LLM Services** component (#3838), not Agent Manager;
- Magda LLM Services uses normal Magda authentication/authorisation and proxies authorised model calls to internal LiteLLM;
- LiteLLM starts with static configuration, no PostgreSQL and no Redis; Redis remains optional even with multiple replicas, with explicitly accepted per-process routing/rate-limit/cooldown/cache semantics;
- real provider credentials remain outside sandboxes in the LiteLLM deployment;
- sandboxes may access the public Internet by default but must be denied cluster-internal/private/link-local/cloud-metadata destinations; Magda APIs are reached through the external Magda endpoint;
- sandbox ingress is default-deny except the Agent Manager/approved proxy path needed to reach DSH;
- DSH should be customised by a Magda profile/plugin composition rather than a permanent fork where possible; generic model/provider controls are hidden/disabled and the deployment supplies the default model/reasoning effort;
- #3841 verified direct DSH exposure through the Sandbox Service under runc/gVisor: DSH binds `0.0.0.0:3080` through the Magda profile and the earlier bridge sidecar is removed;
- DSH keeps its native HTTP + `/api/remote.mux` WebSocket transport; Magda Gateway's reusable WebSocket route support is #3843/#3845;
- stock DSH launch-token/cookie auth is retained for MVP, with token hand-off through a redacted `0600` memory-backed file + Agent Manager `pods/exec`; DSH token/cookie never reaches the browser;
- `X-Magda-Session` terminates at Agent Manager and never enters the Sandbox;
- new DSH sessions default to `workspace-write` + `ask`, and the managed UI hides the persistent `danger-full-access` selection.

## Credential / confirmation trust model

The current Sandbox intentionally contains a lifecycle-bound user-scoped Magda API key because the managed agent acts on behalf of the authenticated user.

Magda auth/OPA remains authoritative for what the user/agent may do. Consequential-action confirmation is an agent/DSH product-safety responsibility: the bundled `mgd` skill requires explicit confirmation before mutation/publishing operations, and a later DSH integration may use the generic approval seam for a structured one-shot approval experience.

DSH `workspace-write` itself is a filesystem-effect policy and does not infer or block outbound Magda API mutations.

The initial v8 threat model explicitly accepts that a compromised/prompt-injected agent possessing the user's credential could technically exercise the user's existing Magda authority directly. Stronger constrained delegation/server-side mutation grants are future hardening, not an initial-v8 requirement.

## Design dependency graph

```text
Sandbox runtime + lifecycle (#3822 Accepted)
                |
                v
       Agent Manager (#3823 Accepted)
          |               |
          v               v
DSH integration       Credential boundary
 (#3824 Accepted)    (#3825 Accepted)
          |               |
          +-------+-------+
                  |
                  v
          Agent/browser experience

Magda LLM Services (#3838)
          |
          v
        LiteLLM

Agent / mgd confirmation UX
                  |
                  v
       Consequential operations

Runtime + credentials + network
                  |
                  v
          Deployment/hardening
```

## Design documents

| Area | File | Current design ticket / status |
| --- | --- | --- |
| Design working model | [design-process.md](./design-process.md) | Guidance |
| Sandbox runtime | [sandbox-runtime.md](./sandbox-runtime.md) | #3822 — **Accepted** |
| Session lifecycle | [session-lifecycle.md](./session-lifecycle.md) | #3822 — **Accepted** |
| Agent Manager | [agent-manager.md](./agent-manager.md) | #3823 — **Accepted** |
| DSH integration / bootstrap / routing | [dsh-integration.md](./dsh-integration.md) | #3824 — **Accepted** |
| Authentication / sandbox credential boundary | [authentication.md](./authentication.md) | #3825 — **Accepted** |
| Shared LLM services | [llm-services.md](./llm-services.md) | #3838 — **Proposed** |
| Future LLM access profiles, dynamic permissions and quotas | [llm-access-profiles.md](./llm-access-profiles.md) | #3838 — **Agreed design direction; not MVP implementation** |
| Network / security | [network-security.md](./network-security.md) | Draft |
| Mutation confirmation | [mutation-approval.md](./mutation-approval.md) | Proposed product/DSH UX contract |
| Skills | [skills.md](./skills.md) | Expanded MVP: Registry-backed metadata, Storage API archives, scoped OPA, `mgd`, workflow capture and catalogue UI; implementation #3854–#3857 |
| Web/product integration | [web-ui.md](./web-ui.md) | Draft |
| Deployment / Helm | [deployment.md](./deployment.md) | Draft |
| Observability / audit | [observability.md](./observability.md) | Draft |
| Open questions | [open-questions.md](./open-questions.md) | Continuously maintained |

## Supported runtime profiles

| Environment | Runtime | Position |
| --- | --- | --- |
| Local development | runc/default | trusted single-developer use |
| Local security/PoC | gVisor | production-style isolation testing |
| GKE | gVisor | **L4 ingress, KAS/gVisor and zonal PD validated** in #3852; NetworkPolicy enforcement and Cloud IAM isolation **not yet security-qualified** |
| AKS production | Kata Pod Sandboxing | supported target |
| EKS | Fargate candidate | future #3821; not initial support |

Runtime choice remains deployment policy; Agent Manager does not contain gVisor/Kata-specific business logic.

## Evidence

#3812 / PR #3817 remains the baseline local Minikube + Agent Sandbox + gVisor evidence. Current upstream Agent Sandbox documentation additionally confirms that warm-pool claims retain the pool-generated Sandbox name, publish it through `status.sandbox.name`, the backing Pod shares the Sandbox name, warm-pool PVCs are dedicated to each Sandbox, and suspension removes the Pod while preserving lifecycle state/PVC.

#3841 / draft PR #3844 is the local Minikube evidence base for direct DSH exposure, WebSocket proxying, stock/#8528 auth comparison, WarmPool adoption, launch-token hand-off and runc/gVisor lifecycle behavior.

#3848 / [draft PR #3852](https://github.com/magda-io/magda/pull/3852), stacked on #3844, verified the real-GKE **regional external L4 passthrough NLB -> community ingress-nginx -> minimal Agent Manager proxy -> KAS/gVisor -> DSH** path, long-lived WebSocket behaviour and zonal PD CSI suspension/remount/deletion. It also proved that a GKE cluster can accept KAS NetworkPolicy objects **without enforcing them**: unapproved Sandbox ingress and private/control-plane egress worked on its legacy datapath. A GKE metadata token endpoint returned 200, but token IAM permissions were not tested. **This is transport/storage qualification, not production network/IAM security qualification.**

Current integrated implementation [draft PR #3850](https://github.com/magda-io/magda/pull/3850) consolidated the Helm charts into **one agent-services chart** (separate Manager/Runtime images), independently gated LLM Services with optional bundled LiteLLM, an installation-scoped claim/key namespace, renewable managed-key expiry and inactivity-based deletion, and the verified `fsGroupChangePolicy: OnRootMismatch` CSI fix. #3850's pre-install hook checks KAS API and RuntimeClass **but not effective NetworkPolicy enforcement**.

The v8 alpha target uses GKE/gVisor and the experimentally qualified L4 ingress route; **native GCE L7 Ingress is deferred to #3851**. Community ingress-nginx is retired and is **not endorsed here as a long-term maintained production controller**; the IngressClass's actual `spec.controller` must be verified (the #3852 cluster had an F5-owned `nginx` class). The full network/IAM security matrix, maintained ingress-controller choice, multi-zone storage/HA and >30-minute foreground-tool inactivity behaviour are still open. See [deployment.md](./deployment.md), [network-security.md](./network-security.md) and [session-lifecycle.md](./session-lifecycle.md).

Long-lived ingress configuration is tracked by #3847 and path-scoped DSH CSP by #3846.


## LLM access profiles (future design; not yet in #3850)

[llm-access-profiles.md](./llm-access-profiles.md) records the agreed long-term authorization model: typed Registry `llm-access-profile` + `llm-access-profile-details` records; LLM Services-owned `llm/access/create|read|update|delete` management endpoints that coordinate Registry and Authorization API operations; one dynamic `llm/access/<profile-id>/access` operation per profile; a dedicated `llm/access/*/access` OPA wildcard rule; and per-user quotas with shared deployment timezone and trusted usage data as OPA input. A request is allowed when any enabled granted profile permits the model within its limit (logical OR, no automatic quota stacking). OPA decides; LLM Services accounts/atomically enforces usage. The current admin-only LLM facade in #3850 does **not** implement this model.

For #3850's immediate configuration follow-up, retain a deployment-wide model allowlist as a **YAML string array** (exactly the one bundled LiteLLM alias for the one-model router), and prefer explicit `global.defaultAgentModel.reasoningEffort: medium` with a supported `provider-default` opt-out sentinel, as described in [llm-services.md](./llm-services.md).

## Durable skill architecture (expanded MVP, staged implementation)

The Agent Workspace is disposable and may host multiple DSH sessions; durable **skills** live outside it. [skills.md](./skills.md) specifies three categories: runtime-bundled skills shipped with the pinned runtime (including `capture-workflow`), admin-published system skills available to all users (Markdown plus arbitrary scripts/models/assets), and owner-published Markdown-only user skills. Every skill runs under the *current user's* Magda authority and ordinary DSH tool approvals.

Skills are included in expanded draft MVP #3850, delivered in reviewed stages [#3854](https://github.com/magda-io/magda/issues/3854) (Registry/Storage API + skill OPA) → [#3855](https://github.com/magda-io/magda/issues/3855) (`mgd`/runtime sync) → [#3856](https://github.com/magda-io/magda/issues/3856) (capture) → [#3857](https://github.com/magda-io/magda/issues/3857) (Settings Agent Skills catalogue), plus [#3858](https://github.com/magda-io/magda/issues/3858) (`agentWorkspace/access` permission). Published skills are **Registry `agent-skill` + `access-control` records**, backed by one ZIP each via the **existing Storage API/default bucket**, with `magda-record-id` plus original `magda-owner-id` set by Storage API. **All supported skill operations go through Agent Services**, which performs an **additional scope-aware `object/agentSkill/create|read|update|delete` OPA check on every endpoint**. Existing-skill decisions use real Registry-fetched scope/owner, create is authorized before ZIP processing, and lists require scoped/per-record filtering. Registry and Storage still authorize their own calls under the forwarded user session. **Generic Registry/Storage APIs remain directly available to properly authorized callers**, with potential skill metadata/content integrity mismatches rather than a new reserved-prefix restriction. No Agent Manager DB, direct MinIO credentials in Agent Services, new bucket or mandatory revision history. Only the limited catalogue download/replace UI is added; skill creation remains agent-led. The `mgd agent-skill` CLI drives local draft/review/publish/sync. Skills are fetched **after warm-Sandbox claim and user bootstrap**, before READY, with manual sync later. Local edits, even to system skills, do not update published objects. System mutations emit concise Agent Services Pod logs; operators may enable provider-side bucket versioning for archival recovery. Storage API's separate owner-metadata mismatch is tracked by [#3853](https://github.com/magda-io/magda/issues/3853): once fixed, #3854 should **reuse the generic Storage API metadata behavior without adding more Storage API functionality**.

## Remaining #3811 work

The foundation is substantially clearer, but #3811 is **not complete**. Remaining implementation-critical design includes:

- #3838 exact LLM API/authz/Helm contract;
- **verified** network/security enforcement per provider (GKE NetworkPolicy negative tests, metadata/KSA/Workload Identity IAM boundaries);
- polished/structured mutation-confirmation UX (optional DSH approval integration);
- staged delivery of the **updated** [Registry-backed runtime-bundled/system/user skill design](./skills.md) in expanded **draft #3850** under #3854–#3857, plus `agentWorkspace/access` authorization #3858 (implementation pending);
- full web/product lifecycle UX;
- Helm/runtime implementation contract is now represented in #3850; remaining **secure GKE deployment qualification**, maintained ingress-controller choice and cluster preflight policy;
- observability/audit;
- migration/coexistence with the current WebGPU agent.

Implementation work may proceed for slices whose required contracts are Accepted; it must not invent answers for the remaining boundaries.
