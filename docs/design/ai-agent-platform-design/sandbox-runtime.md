# Sandbox runtime design

**Status:** Accepted  
**Owner ticket:** #3822  
**Depends on:** overview architecture  
**Blocks:** Agent Manager implementation, DSH runtime qualification, deployment hardening  
**Evidence:** #3812 / PR #3817 plus current Agent Sandbox/provider documentation

## Resource ownership

The initial contract is:

| Resource | Owner |
| --- | --- |
| `SandboxTemplate` | Helm/deployment |
| `SandboxWarmPool` | Helm/deployment |
| `SandboxClaim` | Agent Manager |
| `Sandbox` | Agent Sandbox controller |
| backing Pod/Service | Agent Sandbox controller |
| template-created PVC | Agent Sandbox controller / StorageClass |

Agent Manager uses the Kubernetes API (directly or through an Agent Sandbox SDK/client). It does not call a separate Agent Sandbox controller REST API.

## One user, one current sandbox

A Magda user may have at most one current `SandboxClaim`.

The claim name is deterministic from the Magda user UUID, for example:

```text
magda-agent-<user-uuid>
```

and carries:

```text
agent.magda.io/user-id=<user-uuid>
```

There is no separate platform session identifier. When a unique incarnation identifier is required for audit/race diagnostics, use `SandboxClaim.metadata.uid`.

A new agent session means deletion of the current claim/sandbox/PVC followed by creation of a fresh claim with the same deterministic claim name.

## Stable and derived identifiers

Agent Manager may rely on these contracts:

- user -> deterministic claim name;
- claim -> adopted Sandbox via `SandboxClaim.status.sandbox.name`;
- the Sandbox keeps its warm-pool-generated name when adopted;
- current Agent Sandbox contract gives the backing Pod the same name as the Sandbox;
- `Sandbox.status.serviceFQDN` is the stable service address when the template requests a Service.

Agent Manager must not assume claim name == Sandbox name.

## Sandbox contents

The Sandbox Pod contains the DSH runtime environment:

- DSH web/runtime;
- `mgd`;
- Python/Node and approved analysis tools;
- Magda DSH profile/plugins;
- trusted deployment/global skills where configured;
- PVC-mounted DSH/workspace/config state.

The DSH connectivity bridge, if required by the pinned DSH build, is described in [dsh-integration.md](./dsh-integration.md).

## Persistent volume contract

A PVC is part of the initial supported design, not an optional hypothesis.

PVC-backed state includes at least:

- DSH home/session data;
- workspace and downloaded/generated files;
- DSH managed profile/configuration that must survive Pod recreation;
- `mgd` profile/configuration.

The PVC survives Pod replacement and Sandbox suspend/resume. Deleting the Sandbox/Claim destroys the PVC. Production StorageClasses used for agent workspaces must have deletion semantics appropriate to this contract (normally reclaim policy `Delete`) so deleted user state is not left as an unmanaged retained volume.

A warm-pool Sandbox already owns its dedicated PVC. Once claimed, that Sandbox/PVC belongs to the user and is never sanitised and returned to the pool. The WarmPool creates a new replacement Sandbox/PVC.

## Warm pool

WarmPool is part of the initial design.

Recommended Helm policy:

```yaml
agent:
  sandbox:
    warmPool:
      replicas: 2
```

Lightweight/local deployments may set:

```yaml
agent:
  sandbox:
    warmPool:
      replicas: 0
```

Claims must not inject per-user environment variables or per-claim volume templates because those customisations bypass warm adoption. User configuration is applied after claim/adoption by Agent Manager bootstrap.

## Runtime profiles

| Environment | Agent Sandbox runtime | Support position |
| --- | --- | --- |
| Local development | default runtime / runc | trusted single-developer use only |
| Local security / PoC | gVisor | supported for production-style local validation |
| GKE production | GKE Sandbox / gVisor | **recommended/reference production option** |
| AKS production | AKS Kata Pod Sandboxing | supported production target |
| EKS production | Fargate candidate | future #3821; not initial support |

Runtime selection is deployment policy. Agent Manager must not depend on gVisor- or Kata-specific APIs.

## Common hardening

Every profile keeps the common Pod baseline:

- non-root UID/GID;
- `allowPrivilegeEscalation: false`;
- Linux capabilities dropped;
- no privileged containers;
- no hostPath;
- no host PID/IPC/network;
- no runtime socket;
- `automountServiceAccountToken: false`;
- finite CPU/memory/ephemeral-storage/PVC limits;
- managed NetworkPolicy;
- provider/runtime-specific production qualification.

runc is a trusted-development option, not the production fallback.

## DSH process model

Suspension/recreation is filesystem-persistent, not process-memory-persistent.

A DSH process and arbitrary user-started/background processes may die when the Pod is suspended or replaced. The product guarantee is that DSH session/workspace state on disk survives and DSH can restart/recover from that durable state.

VM/process-memory snapshotting is out of scope for the initial implementation.

## Required qualification

The portable lifecycle must be tested separately from provider-specific isolation:

- local runc: developer inner loop;
- Minikube + gVisor: local integration/security;
- GKE + gVisor: reference production qualification;
- AKS + Kata: supported production qualification;
- EKS/Fargate: future #3821.

Provider-specific networking/runtime behaviour must not be inferred from another runtime.
