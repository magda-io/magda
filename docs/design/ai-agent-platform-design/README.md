# Magda v8 AI Agent Platform Design

**Status:** Blueprint in progress  
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

- **one current sandbox per Magda user**; a user UUID is the stable ownership key;
- the deterministic `SandboxClaim` name is derived from the Magda user UUID and the claim also carries `agent.magda.io/user-id=<uuid>`;
- there is no separate Magda Agent session-id/database row; `SandboxClaim.metadata.uid` is sufficient when an incarnation/generation identifier is needed;
- Agent Manager is intentionally **stateless** for the initial scope: Kubernetes Agent Sandbox resources are the control-plane source of truth and the sandbox PVC is the source of truth for DSH/workspace state;
- Helm owns `SandboxTemplate` and `SandboxWarmPool`; Agent Manager creates/patches/deletes `SandboxClaim`; Agent Sandbox owns `Sandbox`, Pod, Service and template-created PVC lifecycle;
- Agent Manager always resolves the adopted sandbox from `SandboxClaim.status.sandbox.name`; warm-pool adoption does not rename the Sandbox;
- each Sandbox has its own PVC; an adopted warm sandbox/PVC becomes that user's sandbox and is never returned to the pool;
- production/default warm-pool target is configurable and initially **2**; lightweight/local deployments may set it to **0**;
- DSH starts in the generic warm sandbox without user credentials;
- after claim/adoption, Agent Manager bootstraps the sandbox with Kubernetes exec + stdin before exposing DSH to the browser;
- the bootstrap writes the `mgd` profile and DSH managed-provider/default-model configuration to PVC-backed paths;
- 30 minutes of configurable meaningful inactivity suspends the Sandbox; 8 hours of configurable inactivity deletes it; explicit logout deletes immediately;
- suspension preserves the PVC but not arbitrary running process memory; DSH/workspace/session data is reconstructed from disk on resume;
- starting a new agent destroys the old Sandbox/PVC and creates a fresh Sandbox; there is no attempt to sanitise/reuse an old user environment;
- each current sandbox has one system-managed Magda API key with a reserved name; it has no intrinsic expiry but is lifecycle-bound: retained across suspend/resume, rotated for a new sandbox and revoked on permanent deletion/logout;
- the same Magda API key is used by `mgd` and by DSH when calling the external Magda LLM API;
- shared LLM access is owned by a separate **Magda LLM Services** component (#3838), not Agent Manager;
- Magda LLM Services uses normal Magda authentication/authorisation and proxies authorised model calls to internal LiteLLM;
- LiteLLM starts with static configuration, no PostgreSQL and no Redis; Redis remains optional even with multiple replicas, with explicitly accepted per-process routing/rate-limit/cooldown/cache semantics;
- real provider credentials remain outside sandboxes in the LiteLLM deployment;
- sandboxes may access the public Internet by default but must be denied cluster-internal/private/link-local/cloud-metadata destinations; Magda APIs are reached through the external Magda endpoint;
- sandbox ingress is default-deny except the Agent Manager/approved proxy path needed to reach DSH;
- DSH should be customised by a Magda profile/plugin composition rather than a permanent fork where possible; generic model/provider controls are hidden/disabled and the deployment supplies the default model/reasoning effort.

## Important unresolved security contract

The current credential decision intentionally puts a real user-scoped Magda API key inside the untrusted sandbox so that `mgd` and the external LLM API work through normal Magda authentication.

That creates a remaining design conflict with #3811's requirement for **server-enforced approval of consequential Magda mutations**: unless agent-managed credentials can be distinguished/constrained by Magda authentication/authorisation, the sandbox can call mutation APIs directly with the same authority as the user.

#3825 therefore remains open until this boundary is settled. A hard-coded API-key display name is useful operationally but is not by itself an enforcement boundary.

## Design dependency graph

```text
Sandbox runtime + lifecycle (#3822 Accepted)
                |
                v
       Agent Manager (#3823 Accepted)
          |               |
          v               v
DSH integration       Credential boundary
   (#3824)               (#3825)
          |               |
          +-------+-------+
                  |
                  v
          Agent/browser experience

Magda LLM Services (#3838)
          |
          v
        LiteLLM

Credential boundary + mutation approval
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
| DSH integration / bootstrap / routing | [dsh-integration.md](./dsh-integration.md) | #3824 — **Proposed**, narrow browser-auth verification remains |
| Authentication / sandbox credential boundary | [authentication.md](./authentication.md) | #3825 — **Investigating**, mutation-approval conflict remains |
| Shared LLM services | [llm-services.md](./llm-services.md) | #3838 — **Proposed** |
| Network / security | [network-security.md](./network-security.md) | Draft |
| Mutation approval | [mutation-approval.md](./mutation-approval.md) | Draft; now directly coupled to #3825 |
| Skills | [skills.md](./skills.md) | Draft |
| Web/product integration | [web-ui.md](./web-ui.md) | Draft |
| Deployment / Helm | [deployment.md](./deployment.md) | Draft |
| Observability / audit | [observability.md](./observability.md) | Draft |
| Open questions | [open-questions.md](./open-questions.md) | Continuously maintained |

## Supported runtime profiles

| Environment | Runtime | Position |
| --- | --- | --- |
| Local development | runc/default | trusted single-developer use |
| Local security/PoC | gVisor | production-style isolation testing |
| GKE production | gVisor | recommended/reference |
| AKS production | Kata Pod Sandboxing | supported target |
| EKS | Fargate candidate | future #3821; not initial support |

Runtime choice remains deployment policy; Agent Manager does not contain gVisor/Kata-specific business logic.

## Evidence

#3812 / PR #3817 remains the baseline local Minikube + Agent Sandbox + gVisor evidence. Current upstream Agent Sandbox documentation additionally confirms that warm-pool claims retain the pool-generated Sandbox name, publish it through `status.sandbox.name`, the backing Pod shares the Sandbox name, warm-pool PVCs are dedicated to each Sandbox, and suspension removes the Pod while preserving lifecycle state/PVC.

Provider-specific release qualification is still required for GKE/gVisor and AKS/Kata.

## Remaining #3811 work

The foundation is substantially clearer, but #3811 is **not complete**. Remaining implementation-critical design includes:

- #3824 verification of the pinned DSH browser-auth/bridge contract;
- #3825 resolution of agent-managed Magda credential vs server-enforced mutation approval;
- #3838 exact LLM API/authz/Helm contract;
- network/security enforcement per supported provider;
- mutation approval;
- user/global skill persistence/trust model;
- full web/product lifecycle UX;
- deployment/Helm details and production qualification;
- observability/audit;
- migration/coexistence with the current WebGPU agent.

Implementation work may proceed for slices whose required contracts are Accepted; it must not invent answers for the remaining boundaries.
