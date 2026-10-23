# Magda v8 AI Agent Platform Design

**Status:** Agent Workspace MVP [#3850](https://github.com/magda-io/magda/pull/3850) merged to `next` 21 October 2026 (merge `73b74bb7f`); #3849 closed. This is the continuing draft v8 design. #3861 sharing/recipient installations is next, while GKE security qualification (#3848), Registry review (#3862/#3863) and dynamic LLM profiles (#3838) remain open.
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
| Agent Skill authorization model | [agent-skill-authorization-model.md](./agent-skill-authorization-model.md) | **Revised 2026-10-23** (#3869 / #3870): OPA only authorises (no identity validation, no untranslatable residual rules); Agent Services is the only non-admin writer of Agent Skill records; unconstrained generic `object/record/*` grants apply to all records; use-case table |
| Skills | [skills.md](./skills.md) | Expanded MVP: Registry-backed metadata, Storage API archives, scoped OPA, `mgd`, workflow capture and catalogue UI; implementation #3854–#3857 |
| Local Agent Skill sync / multiple MAGDA profiles | [local-agent-skill-sync.md](./local-agent-skill-sync.md) | **Revised 2026-10-18**; scan-based independent copy installs, inline authoritative marker, no central inventory/journal/rollback, commit-first profile switch, source-account publishing, per-skill recovery, non-blocking Workspace sync (#3855/#3857/#3861) |
| Agent workflow capture / trusted skill tools / session history | [workflow-capture.md](./workflow-capture.md) | **Accepted 2026-10-19**; Stage 3 #3856, one approval via chat-model judgment or DSH Publish/Cancel UI, same system/user flow with clearer system warning, typed host-tool calling existing `mgd`, source-aware publication errors, incremental bounded history processing, selective prompts |
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

[llm-access-profiles.md](./llm-access-profiles.md) records the agreed long-term authorization model: typed Registry `llm-access-profile` + `llm-access-profile-details` records; LLM Services-owned `llm/access/create|read|update|delete` management endpoints that coordinate Registry and Authorization API operations; one dynamic `llm/access/<profile-id>/access` operation per profile; a dedicated `llm/access/*/access` OPA wildcard rule; and per-user quotas with shared deployment timezone and trusted usage data as OPA input. A request is allowed when any enabled granted profile permits the model within its limit (logical OR, no automatic quota stacking). OPA decides; LLM Services accounts/atomically enforces usage. The current self-only `agentWorkspace/access`-gated LLM facade in #3850 does **not** implement model-specific profiles or quotas.

Draft #3850 now implements the deployment-wide model allowlist as a **YAML string array** (one exact alias for its bundled single-model LiteLLM router, multiple allowed with external LiteLLM), along with `global.defaultAgentModel.reasoningEffort: medium` by default. Operators can use **`reasoningEffort: ""`** to *omit* an explicit reasoning setting and use the provider's default; no artificial sentinel or YAML-null override is needed. Whitespace-trimmed model allowlist entries are accepted for convenience, but duplicates after normalization and blank aliases are rejected. See [llm-services.md](./llm-services.md). This is implemented on the **draft** #3850 branch, not merged, and is separate from the future access-profile authorization design.

## Skill authorization and Workspace synchronization (2026-10-14 accepted decisions)

The [authoritative skill authorization, sharing and Workspace manifest design](./skills-authorization-and-workspace-manifest.md) refines the earlier `skills.md` model and stage tickets. It specifies typed system/user/install permission resources, assignable roles, OrgUnit/pre-authorised/exemption reads, Access Group sharing, distinct immutable `userId` and record ownership, deterministic per-user IDs, and best-effort Workspace skill synchronization. **Skill discovery is based on the intended user; skill access is based on authorization; skill synchronization is optional to Workspace availability.** All expanded MVP stages #3854–#3858 have passed focused review and are closed in **still-draft** #3850. The implemented #3855 CLI/Workspace sync follows the [accepted local multi-profile, multi-harness design](./local-agent-skill-sync.md); #3857 adds the confirmed Retry / Re-check flow. Sharing/install feature execution belongs to #3861 unless separately re-scoped.

## Durable skill architecture (expanded MVP, staged implementation)

The Agent Workspace is disposable and may host multiple DSH sessions; durable **skills** live outside it. [skills.md](./skills.md) specifies three categories: runtime-bundled skills shipped with the pinned runtime (including `capture-workflow`), admin-published system skills available to all users (Markdown plus arbitrary scripts/models/assets), and owner-published Markdown-only user skills. Every skill runs under the *current user's* Magda authority and ordinary DSH tool approvals.

Skills are included in expanded draft MVP #3850, delivered in reviewed stages [#3854](https://github.com/magda-io/magda/issues/3854) (Registry/Storage API + skill OPA) → [#3855](https://github.com/magda-io/magda/issues/3855) (`mgd`/runtime sync) → [#3856](https://github.com/magda-io/magda/issues/3856) (capture) → [#3857](https://github.com/magda-io/magda/issues/3857) (Settings Agent Skills catalogue), plus [#3858](https://github.com/magda-io/magda/issues/3858) (`agentWorkspace/access` permission). Published skills are **Registry `agent-skill` + `access-control` records**, backed by one ZIP each via the **existing Storage API/default bucket**, with `magda-record-id` plus original `magda-owner-id` set by Storage API. **All supported skill operations go through Agent Services**, which performs an **additional typed, scope-aware `object/agentSkill/{system,user}/{create,read,update,delete}` OPA check on every endpoint**. Existing-skill decisions use real Registry-fetched type/intended-user/owner, create is authorized before ZIP processing, and lists require scoped/per-record filtering. Registry and Storage still authorize their own calls. *Revised (#3870):* Agent Services writes Agent Skill Registry records with its internal principal after authorising the caller, and generic Registry writes of skill records are limited to admins and unconstrained generic grants; see [agent-skill-authorization-model.md](./agent-skill-authorization-model.md). No Agent Manager DB, direct MinIO credentials in Agent Services, new bucket or mandatory revision history. Only the limited catalogue download/replace UI is added; skill creation remains agent-led. The `mgd agent-skill` CLI drives local draft/review/publish/sync. Warm Sandboxes acquire user identity only **after claim adoption/bootstrap**. Essential DSH/credentials reach Workspace READY **before optional, best-effort skill synchronization**; failure to sync must not block DSH. Local-computer synchronization instead activates the current profile's own user skills in supported local harnesses, from an [account-isolated persistent library](./local-agent-skill-sync.md), with no automatically installed system skills. Local edits, even to system skills, do not update published objects. System mutations emit concise Agent Services Pod logs; operators may enable provider-side bucket versioning for archival recovery. The generic Storage API owner-metadata correction [#3853](https://github.com/magda-io/magda/issues/3853) is already merged; #3854 reuses it without adding skill-only Storage API features.

## Reviewed MVP implementation and documentation

As of 2026-10-20, [draft PR #3850](https://github.com/magda-io/magda/pull/3850)
has accepted implementations for the Workspace, DSH/LLM proxy, installation-
scoped KAS lifecycle, skill publication/CLI/synchronization/capture/catalogue
and `agentWorkspace/access` grant. The final merge-hygiene review is
restructuring operational documentation, simplifying development-only DB
migrations and Helm overlay packaging, updating bundled `mgd` Agent Skill
guidance, and rerunning deployment/security regression tests. These are **not
yet merged**. Published (post-merge) technical documentation is organized as:

- [Workspace architecture](https://github.com/magda-io/magda/blob/feat/3849-agent-workspace-mvp/docs/docs/architecture/agent-workspace.md)
- [Agent Skills architecture](https://github.com/magda-io/magda/blob/feat/3849-agent-workspace-mvp/docs/docs/architecture/agent-skills.md)
- [Workspace deployment/operations](https://github.com/magda-io/magda/blob/feat/3849-agent-workspace-mvp/docs/docs/agent-workspace-deployment.md)
- [E2E qualification](https://github.com/magda-io/magda/blob/feat/3849-agent-workspace-mvp/docs/docs/e2e-test-cases/agent-workspace.md)

## Remaining #3811 work

The foundation is substantially clearer, but #3811 is **not complete**. Remaining implementation-critical design includes:

- #3838 future per-user LLM access profiles, quotas and full model-level authorization (MVP facade and Helm packaging are already implemented);
- **verified** network/security enforcement per provider (GKE NetworkPolicy negative tests, metadata/KSA/Workload Identity IAM boundaries);
- polished/structured mutation-confirmation UX (optional DSH approval integration);
- future sharing and persistent recipient installations (#3861), and generic Registry mutation hardening (#3862/draft #3863); the reviewed #3854–#3858 MVP implementation remains unmerged in **draft #3850**;
- full web/product lifecycle UX;
- Helm/runtime implementation contract is now represented in #3850; remaining **secure GKE deployment qualification**, maintained ingress-controller choice and cluster preflight policy;
- observability/audit;
- migration/coexistence with the current WebGPU agent.

Implementation work may proceed for slices whose required contracts are Accepted; it must not invent answers for the remaining boundaries.
