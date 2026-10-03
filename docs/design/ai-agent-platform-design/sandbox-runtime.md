# Sandbox runtime design

**Status:** Draft  
**Owner ticket:** #3822  
**Depends on:** overview architecture  
**Blocks:** Agent Manager lifecycle assumptions, DSH runtime qualification, deployment hardening  
**Evidence:** #3812 / PR #3817 plus upstream/provider documentation

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

## Agent Sandbox

One Agent Sandbox corresponds to one agent session generation.

Each Sandbox Pod contains at least:

1. **agent container**
   - DSH;
   - `mgd`;
   - Python and approved analysis tools;
   - trusted global skills;
   - DSH/Magda integration plugin;
   - session workspace/PVC mount.

2. **bridge sidecar**
   - exposes the DSH loopback listener to Agent Manager on a Pod port;
   - provides health/bootstrap coordination;
   - does not execute user/model commands;
   - holds any bridge bootstrap secret separately from the agent container.

Containers share the Pod network namespace, so the bridge can reach DSH at `127.0.0.1:3080` while Agent Manager reaches the bridge through the sandbox's headless Service.

The bridge is not a replacement security boundary for DSH. NetworkPolicy and DSH authentication remain required.

## Runtime and sandbox profiles

### Trusted local development: Agent Sandbox + runc

A local single-developer environment may use the cluster's default runtime:

```yaml
agent:
  sandbox:
    securityProfile: trusted-dev
    runtimeClassName: ""
```

The PoC showed that DSH remains usefully confined:

- bubblewrap cannot mount its private procfs in the tested runc Pod;
- DSH falls back to Landlock;
- `workspace-write` remains enforced.

This profile is faster for syscall-heavy coding workflows and avoids requiring gVisor on every developer cluster.

It is **not** an appropriate default for a shared environment that executes untrusted/model-generated code from multiple users.

### Supported deployment profiles

The initial support matrix is intentionally explicit:

| Environment | Agent Sandbox runtime | Support position |
| --- | --- | --- |
| Local development | default runtime / runc | Supported for trusted single-developer use only |
| Local security / PoC | gVisor | Supported for validating the production-style isolation path locally |
| GKE production | GKE Sandbox / gVisor | **Recommended/reference production option** |
| AKS production | AKS Pod Sandboxing / Kata Containers | Supported production target |
| EKS production | Fargate candidate | Not in the initial support commitment; future PoC #3821 |

The Agent Manager and SandboxClaim lifecycle stay identical across these profiles. Runtime selection is deployment policy.

Ordinary runc is **not** an acceptable production fallback for the Magda agent merely because a cloud does not offer one of the supported strong-isolation profiles.

### Local security / PoC: Agent Sandbox + gVisor

Local security/integration testing uses gVisor:

```yaml
agent:
  sandbox:
    securityProfile: production
    runtimeClassName: gvisor
```

The Minikube PoC verified:

- gVisor is active under Agent Sandbox;
- DSH selects bubblewrap;
- DSH `workspace-write` enforcement works;
- normal `mgd`, download and pandas workloads remain practical;
- gVisor adds approximately 55-70 MiB memory per sandbox;
- syscall-heavy workloads can be significantly slower.

This profile exists to reproduce the gVisor security/runtime behaviour locally; it does not make Minikube a production deployment target.

### GKE production: Agent Sandbox + gVisor

GKE + gVisor is the recommended/reference production deployment for the first v8 Agent Platform.

GKE provides first-class Agent Sandbox and GKE Sandbox integration. The production SandboxTemplate uses:

```yaml
runtimeClassName: gvisor
```

and must satisfy the GKE Agent Sandbox admission/security requirements.

References:

- https://docs.cloud.google.com/kubernetes-engine/docs/how-to/how-install-agent-sandbox
- https://docs.cloud.google.com/kubernetes-engine/docs/how-to/sandbox-pods

The GKE production profile is the primary environment for production qualification, documentation examples and sizing guidance.

### AKS production: Agent Sandbox + Kata

AKS production uses the upstream Agent Sandbox lifecycle abstraction with AKS Pod Sandboxing as the isolation runtime.

The SandboxTemplate uses the AKS-provided Kata RuntimeClass:

```yaml
runtimeClassName: kata-vm-isolation
```

AKS Pod Sandboxing runs each selected Pod in a lightweight VM with its own guest kernel. The Magda Agent Manager must not depend on gVisor-specific behaviour so the same SandboxClaim/session model works unchanged.

References:

- https://learn.microsoft.com/azure/aks/concepts-pod-sandboxing
- https://learn.microsoft.com/azure/aks/use-pod-sandboxing

The AKS profile requires release qualification of DSH + `mgd`, bridge routing, storage, networking and resource sizing under Kata. gVisor-specific PoC findings such as bubblewrap behaviour are not automatically assumed to apply to Kata.

### EKS production: future portability investigation

EKS is not part of the initial officially supported Magda Agent production matrix.

Do not document ordinary runc as the production fallback. A future PoC will evaluate Agent Sandbox with Fargate-backed Sandbox Pods and determine whether EKS can be added without weakening the isolation model:

- #3821 — **PoC: Validate Magda Agent Sandbox on Amazon EKS Fargate**

### Common hardening

Both profiles keep the same Pod hardening:

- non-root UID/GID;
- `allowPrivilegeEscalation: false`;
- all Linux capabilities dropped;
- no privileged containers;
- no hostPath;
- no host PID/IPC/network;
- no container runtime socket;
- `automountServiceAccountToken: false`;
- finite CPU/memory/ephemeral-storage/PVC limits;
- managed NetworkPolicy;
- RuntimeDefault seccomp unless the selected RuntimeClass requires otherwise.

### DSH inner confinement

Default agent command policy:

```text
workspace-write + ask/approval
```

Do not use DSH `read-only` as the normal mode for the current DSH version; #3812 found that every bash call requires approval in that mode.

Production health should report at least:

- Kubernetes RuntimeClass;
- DSH sandbox backend;
- DSH reported enforcement level.

A production sandbox that cannot obtain the expected DSH confinement should be reported as degraded or fail readiness according to deployment policy.

### Required runtime test matrix

The project must keep the portable Agent Sandbox control plane tested separately from provider-specific production isolation.

| Test tier | Runtime / platform | Purpose |
| --- | --- | --- |
| fast/local | runc | developer inner loop |
| local integration/security | Minikube + gVisor | reproduce gVisor confinement and catch runtime-specific regressions |
| production qualification | GKE + gVisor | recommended/reference production path |
| production qualification | AKS + Kata | supported AKS production path |
| future portability | EKS + Fargate | tracked by #3821; not a release blocker initially |

A successful runc test is not sufficient evidence for production. Likewise, passing the local gVisor suite does not prove the AKS/Kata profile. Provider-specific release/security qualification must exercise isolation, bridge/networking, lifecycle and DSH confinement for each supported production profile.

## Sandbox template

The production SandboxTemplate should request a per-sandbox headless Service:

```yaml
spec:
  service: true
```

Agent Manager should use `Sandbox.status.serviceFQDN` when available.

This is preferred over caching Pod IPs because the Service is lifecycle-bound to the Sandbox and avoids accidentally dialing a recycled Pod IP.

Other important template properties:

- one `ReadWriteOnce` PVC generated per Sandbox;
- `envVarsInjectionPolicy: Disallowed`;
- `volumeClaimTemplatesPolicy: Disallowed`;
- no per-claim environment/volume override for identity or credentials;
- `restartPolicy: OnFailure` for the long-running coding-agent workload;
- labels identifying agent-runtime version and runtime profile;
- NetworkPolicy admitting Agent Manager to the bridge port only.

`OnFailure` is intentional: Agent Sandbox lifecycle guidance recommends it for coding-agent/interactive workloads. Crashes restart, while a deliberate clean exit remains observable instead of being restarted forever. The initial long-lived-session design does not rely on `ttlSecondsAfterFinished` for normal cleanup; Agent Manager owns explicit reset/deletion.

## Warm pools

Warm pools are compatible with this design but not required for the first release.

Initial default:

```yaml
warmPool:
  replicas: 0
```

Why the architecture still preserves warm-pool compatibility:

- Agent Sandbox v1.0.4 requires a WarmPool reference for SandboxClaim;
- the PoC measured warm adoption around 0.34 s versus multi-second cold starts;
- per-claim env/volume overrides prevent adoption.

Therefore user/session identity must be applied **after adoption** through the bridge/bootstrap path rather than via claim-specific environment injection.

Agent Manager must always resolve the actual sandbox from claim status; a warm-adopted Sandbox keeps its pool-generated name.

## Resource model

PoC measurements provide a useful initial baseline:

- idle sandbox: about 0.18-0.25 GiB;
- typical turn: about 0.36 GiB peak;
- 5M-row pandas analysis: about 1.1 GiB peak;
- gVisor overhead: about 55-70 MiB/sandbox;
- syscall-heavy workloads can consume significantly more CPU under gVisor.

Initial default:

```yaml
resources:
  requests:
    cpu: 250m
    memory: 512Mi
    ephemeral-storage: 512Mi
  limits:
    cpu: "2"
    memory: 2Gi
    ephemeral-storage: 2Gi
workspace:
  size: 2Gi
```

Deployments supporting larger analysis should raise memory/workspace limits.

The PoC demonstrated that a Pod-level memory limit can OOM-kill the gVisor sentry and restart the whole sandbox. The UI/Agent Manager must surface this as a runtime restart, not as a generic chat failure.

Per-command memory/process limiting is a follow-up hardening ticket.

## Design questions owned by #3822

#3822 must turn the material above into explicit contracts, especially:

- stable vs non-stable Agent Sandbox identifiers;
- `SandboxTemplate` / `SandboxWarmPool` / `SandboxClaim` ownership;
- runtime-neutral assumptions exposed to Magda;
- provider-specific production qualification;
- whether workspace persistence belongs in the base runtime contract;
- WarmPool behaviour required by the initial release.

Do not implement cloud/runtime selection from this draft until #3822 accepts the contract.
