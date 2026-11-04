# Agent Workspace security and trust boundaries

**Scope:** Implemented boundaries on the `next` development branch, and the separate infrastructure qualification required before operating untrusted workloads. This document is a security model, not a certification of any cloud deployment.

## Trust model

A DSH agent runs code influenced by user prompts, tools, downloaded files and model outputs. Treat a Sandbox as potentially executing untrusted commands with **the current user's deliberately delegated Magda credential**. Containment must protect other users, other installations, cluster control services, unrelated internal resources and provider secrets. The Workspace does not have authority exceeding the Magda user for catalogue operations.

```text
Browser / Magda session
  -> Gateway (trusted user context)
  -> Agent Manager (whoami + agentWorkspace/access)
      -> per-installation/user Sandbox (DSH + mgd + user-scoped key)
      -> /api via external Magda endpoint -> Gateway -> Magda APIs
      -> /api/v0/llm via Gateway -> LLM Services -> internal LiteLLM
  provider credentials stay outside the Sandbox
```

See [Workspace architecture](./agent-workspace.md), [Agent Skills authorization](./agent-skills-authorization.md), [LLM Services](./llm-services.md), and [operator guide](../agent-workspace-deployment.md).

## Identity, credential and browser boundaries

- The Agent Manager derives the installation and user identity from validated `X-Magda-Session`/Gateway context and `whoami`, **not** a client-provided user ID, claim name, or Sandbox selector. The one self-only `agentWorkspace/access` permission gates the user's lifecycle, runtime HTTP/WebSocket and the Workspace model path.
- An expiring **system-managed API key for that user** is delivered to the claimed Sandbox in a one-time post-claim bootstrap over `pods/exec` stdin, persisted mode 0600 on the user's PVC and revoked at destructive cleanup. Manager-created credentials and system JWTs must not be sent to browsers, agents or logs.
- Browser-facing DSH is proxied by Manager under the same origin. Native launch-token exchange is handled server-side; session cookies and trusted Magda headers are not forwarded to DSH. Explicit Host/Origin and WebSocket-origin validation are separate from network isolation.
- `mgd` and DSH call Magda's external HTTPS API under the user's lifecycle-bound key. The Magda APIs and OPA remain the real data-access authority. A skill publication or a shared skill installation does **not** confer source dataset access.
- LLM Services authorises the caller, applies deployment model allowlists, sanitises provider errors and proxies to LiteLLM. LiteLLM's provider credentials and internal master key are Secret-backed, never given to Sandboxes.

## Kubernetes and storage isolation

One `SandboxClaim` and PVC per **installation + user** is the authoritative managed Workspace unit. The runtime is non-root without privilege escalation, host network/PID/IPC, host mounts or container socket. Selected runtimes are runc for **trusted local development** and gVisor/Kata **only after provider-specific qualification**. A container runtime choice is not a substitute for effective network policy or cloud IAM limits.

The expected Sandbox NetworkPolicy boundary is:

| Traffic | Expected policy |
| --- | --- |
| Designated Agent Manager -> owned Sandbox DSH TCP 3080 | Allow |
| Peer Sandbox, unrelated namespace/release -> DSH | Deny |
| Sandbox -> approved DNS / public HTTPS / external Magda HTTPS | Allow under deployment policy |
| Sandbox -> internal LiteLLM, unrelated Services/Pods/VPC or Kubernetes control plane | Deny unless narrowly justified |
| Sandbox -> cloud metadata and identity endpoints | Block if supported **and proven**; otherwise validate token authority is powerless |

NetworkPolicy objects **must actually be enforced** by the cluster CNI. Standard NetworkPolicy cannot by itself guarantee FQDN-aware egress restrictions or deny all possible redirected traffic. Check actual paths and DNS resolution in the target cluster.

The persistent `/data` PVC contains user DSH sessions, files, generated code, installed skills and purpose-specific Python environments/caches. It survives resume and Pod replacement, **not** reset/termination/logout. `fsGroupChangePolicy: OnRootMismatch` is important for GKE PD CSI remounts and mode-0600 DSH files. New PVC default is **10 GiB request** after merged #3896; `df /data` can show hostpath capacity and must not be described as an enforced quota.

## Cloud security qualification: not yet complete

[GKE qualification #3848](https://github.com/magda-io/magda/issues/3848) and [PoC #3852](https://github.com/magda-io/magda/pull/3852) are distinct from the merged MVP. The real GKE PoC validated gVisor/KAS transport, L4 ingress/WebSocket and CSI; its tested cluster **did not enforce** NetworkPolicy, so disallowed Pod/control-plane traffic remained reachable. A metadata-token URL also returned HTTP 200 despite `automountServiceAccountToken: false`; the token's *effective IAM privileges were not established*. These are open blockers to claiming production isolation.

Require a demonstrated **positive and negative** traffic matrix from a claimed Sandbox and disallowed peer, plus dedicated minimal KSA and actual Workload Identity/IAM permission denial checks. Record tested cluster version, CNI, deployed policies, successful and forbidden destinations, metadata behaviour, and any justified exceptions. Requalify after materially changing provider/CNI/ingress/runtime.

See the focused [GKE E2E qualification](../e2e-test-cases/agent-workspace-gke-security.md) and [#3848](https://github.com/magda-io/magda/issues/3848); a rendered Helm policy alone does not satisfy the gate.

## Security caveats in the implemented product

- **Publication consent**: DSH's Publish/Cancel card is used when approval is unclear; the shortcut `userApproved: true` represents the model's assertion of conversational approval. It is **not** independently authenticated evidence of consent. See [ADR 0008](../adrs/0008-model-mediated-agent-skill-publication-approval.md).
- **Dependency installs**: the bundled Python skill asks permission before installing packages; this is *guidance*, not a technical install-approval enforcement boundary.
- **Skill revocation**: a revoked source fails future authorised resolution. Locally downloaded copies may remain until the next successful reconciliation, and edited copies may require explicit user action.
- **Privileged generic writers**: administrators and deliberately unconstrained generic Registry/Storage grant holders retain direct object access that can bypass Agent Services' domain-level validation. These privileges must remain trusted and tightly controlled.
- **Untrusted content**: ZIP contents, model artifacts and downloaded programs require integrity and safe loading checks. A model-card claim does not substitute for tested model compatibility.

Security and acceptance follow-ups remain tracked in [#3848](https://github.com/magda-io/magda/issues/3848), [#3838](https://github.com/magda-io/magda/issues/3838) and [#3866](https://github.com/magda-io/magda/issues/3866).