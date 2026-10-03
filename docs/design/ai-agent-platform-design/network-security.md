# Network and sandbox security design

**Status:** Draft  
**Owner ticket:** TBD — create when prerequisite contracts are mature  
**Depends on:** #3822 runtime; #3825 credential boundary  
**Blocks:** production network policy, egress controls, adversarial security tests  
**Evidence:** #3812 isolation evidence plus provider-specific networking documentation

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

## Network policy

### Ingress

Sandbox ingress allows only:

- Agent Manager -> bridge port;
- required health/metrics paths if separately configured.

No sandbox-to-sandbox ingress.

### Egress

Production default:

- DNS;
- Agent Manager internal service;
- approved public data access according to deployment policy.

Direct access from sandbox to internal Magda services/gateway is denied in production; authenticated Magda traffic must use Agent Manager's proxy.

Block:

- Kubernetes API;
- RFC1918/internal cluster ranges except explicitly allowed services;
- link-local/cloud metadata;
- other Sandbox Pods.

### External datasets

Agents need to download distributions hosted outside Magda.

Support deployment policy levels such as:

- `disabled`;
- `public-https` (recommended default);
- `custom`.

A later egress implementation may use Cilium FQDN policy or an explicit egress proxy. NetworkPolicy alone can enforce private/link-local denial but cannot express all domain-level policy.

The opaque Agent Manager capability has no value to arbitrary Internet hosts, reducing the impact of accidental token exfiltration.

## Security model

### Protected assets

- host node/kernel;
- other users' sandboxes/PVCs;
- Kubernetes control plane;
- Magda credentials;
- LLM/provider credentials;
- private Magda data the user is not authorised to access;
- durable user skills.

### Primary threats

- model-generated malicious command;
- prompt injection from dataset/document content;
- sandbox escape;
- cross-tenant network access;
- credential exfiltration;
- resource exhaustion;
- abuse of user/admin Magda permissions;
- malicious user skill text;
- compromised external data source.

### Controls

**Sandbox escape**

- GKE production: gVisor RuntimeClass;
- AKS production: Kata Pod Sandboxing RuntimeClass;
- common Pod hardening in every profile;
- runc restricted to trusted development/test use.

**Cross-tenant**

- one PVC per sandbox;
- managed NetworkPolicy;
- no service-account token;
- Service FQDN bound to one Sandbox.

**Credentials**

- real Magda/LLM keys outside sandbox;
- opaque internal capability only;
- short-lived rotating Magda key;
- credential-management routes denied from agent proxy.

**Consequential mutations**

- read-only initial proxy;
- later server-issued mutation grants.

**Resource exhaustion**

- Pod/PVC limits;
- per-user one-session limit;
- provider/model budgets;
- future per-command resource limits.

**Malicious user skill**

- text-only;
- user ownership;
- normal DSH execution confinement still applies.

## Provider-specific caution

The network design must preserve a portable Magda security contract while allowing provider-specific enforcement.

For example, EKS/Fargate (#3821) cannot simply inherit a Kubernetes NetworkPolicy assumption from GKE/AKS. Provider-specific enforcement belongs in deployment profiles, not in Agent Manager business logic.
