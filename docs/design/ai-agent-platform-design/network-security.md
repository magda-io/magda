# Network and sandbox security design

**Status:** Draft  
**Owner ticket:** TBD  
**Depends on:** #3822, #3825, #3838

## Sandbox ingress

Default deny.

Permit only the approved Agent Manager/DSH proxy path to the bridge/DSH service port and explicitly required health/metrics paths.

No direct external ingress and no sandbox-to-sandbox ingress.

## Sandbox egress

Initial product policy intentionally permits public external hosts so DSH can fetch datasets, packages and public resources.

Deny by default:

- Kubernetes API/control-plane access;
- Pod/Service CIDRs and unintended cluster-internal services;
- RFC1918/private/VPC ranges except explicitly required endpoints;
- link-local and cloud metadata endpoints such as `169.254.169.254`;
- other Sandbox Pods.

Allow:

- DNS required by the sandbox (normally cluster DNS);
- public Internet according to deployment policy;
- Magda APIs only through the deployment's **external Magda endpoint**.

The external Magda endpoint is used for both normal `mgd` API traffic and `/api/v0/llm/...`.

Standard Kubernetes NetworkPolicy can express IP/CIDR boundaries but not every FQDN policy. Provider-specific implementations may need Cilium/FQDN policy or an egress proxy if stronger domain restrictions are later required.

## LiteLLM network boundary

LiteLLM is internal-only:

```text
sandbox -> direct LiteLLM: denied
external client -> direct LiteLLM: denied
Magda LLM Services -> LiteLLM: allowed
```

Provider credentials remain only in the LiteLLM deployment.

## Credential threat model

Unlike the earlier opaque-capability proposal, the selected sandbox design contains a real user-scoped Magda API key.

Therefore network security must not claim to make the Magda credential unexfiltratable. Public egress means arbitrary sandbox code could read/export it.

Mitigations are lifecycle/revocation, normal user-scoped Magda authorisation, strong host/tenant isolation and the still-unresolved mutation-approval/constrained-agent-authority design in #3825.

## Protected assets

- host/kernel and other tenants;
- Kubernetes control plane;
- other users' Sandboxes/PVCs;
- internal Magda services not intended for direct sandbox access;
- provider/LiteLLM credentials;
- private resources outside the authenticated user's Magda authority;
- trusted deployment/global skills.

## Isolation baseline

- GKE production: gVisor;
- AKS production: Kata Pod Sandboxing;
- runc only for trusted local development;
- non-root, no privilege escalation/capabilities/host namespaces/hostPath/runtime socket;
- no sandbox service-account token;
- finite resource/storage limits;
- per-provider security/network qualification.

Provider-specific enforcement belongs in deployment profiles, not Agent Manager business logic.
