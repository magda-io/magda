# Deployment and Helm design

**Status:** Draft  
**Owner ticket:** TBD — later design slice  
**Depends on:** #3822 runtime, network/security design, provider qualification  
**Blocks:** Helm/operator implementation and production support docs  
**Evidence:** #3812 plus GKE/AKS provider docs; #3821 future EKS evidence

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

## Helm/deployment configuration

Illustrative values:

```yaml
agent:
  enabled: false

  manager:
    replicas: 1

  sandbox:
    # Recommended/reference production example: GKE + gVisor.
    # AKS production uses runtimeClassName: kata-vm-isolation.
    securityProfile: production       # production | trusted-dev
    runtimeClassName: gvisor
    image: ghcr.io/magda-io/magda-agent:<version>

    resources:
      requests:
        cpu: 250m
        memory: 512Mi
      limits:
        cpu: "2"
        memory: 2Gi

    workspace:
      storageClassName: ""
      size: 2Gi

    warmPool:
      replicas: 0

    externalNetworkAccess: public-https

  model:
    allowedModels: []
    # provider secrets come from Kubernetes Secrets, never chart values

  skills:
    # trusted global skill configuration/image options
    enabled: true
```

For local development:

```yaml
agent:
  enabled: true
  sandbox:
    securityProfile: trusted-dev
    runtimeClassName: ""
```

Chart validation:

- production profile requires a non-empty RuntimeClass;
- trusted-dev profile emits a warning that runc is not a strong untrusted-code boundary;
- no profile enables privileged/host mounts.

Initial production support/documentation maps the RuntimeClass as follows:

- GKE: `gvisor` (**recommended/reference production profile**);
- AKS: `kata-vm-isolation`;
- EKS: no initial production profile; #3821 evaluates Fargate.

Agent Sandbox CRDs/controller and the configured runtime/provider prerequisites are explicit installation prerequisites. On GKE, deployments may use GKE's managed Agent Sandbox integration; on AKS, use the upstream Agent Sandbox controller with AKS Pod Sandboxing.

For local gVisor testing, gVisor must be pinned by release rather than relying on a moving "latest" installer URL; #3812 demonstrated that the Minikube addon download path can drift/break.

## Support policy

The initial production support commitment is:

- GKE + gVisor — recommended/reference production profile;
- AKS + Kata Pod Sandboxing — supported production target;
- EKS — not initially supported for production Agent workloads; #3821 investigates Fargate.

The final deployment design must distinguish portable Magda configuration from provider-specific prerequisites and tests.
