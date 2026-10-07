# Deployment and Helm design

**Status:** Draft  
**Owner ticket:** TBD  
**Depends on:** #3822, network/security design, #3838 and provider qualification

## Illustrative values

```yaml
agent:
  enabled: false

  manager:
    replicas: 2

  lifecycle:
    suspendAfter: 30m
    deleteAfter: 8h

  sandbox:
    securityProfile: production
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
      replicas: 2

    externalNetworkAccess: public

llm:
  enabled: true

  services:
    replicas: 2

  litellm:
    replicas: 2
    database:
      enabled: false
    redis:
      enabled: false
    # provider secrets come from Kubernetes Secrets, never chart values
```

Lightweight/local development may override:

```yaml
agent:
  enabled: true
  manager:
    replicas: 1
  sandbox:
    securityProfile: trusted-dev
    runtimeClassName: ""
    warmPool:
      replicas: 0

llm:
  services:
    replicas: 1
  litellm:
    replicas: 1
```

## Agent Sandbox prerequisites

Helm/deployment owns:

- Agent Sandbox controller/CRD prerequisite documentation;
- `SandboxTemplate`;
- `SandboxWarmPool`;
- runtime class/provider prerequisite;
- workspace StorageClass;
- NetworkPolicy.

Initial support:

- GKE + `gvisor` — recommended/reference;
- AKS + `kata-vm-isolation` — supported target;
- EKS — future #3821.

Production workspace storage must support the delete-on-sandbox-delete contract.

## WarmPool policy

WarmPool replica target is a Helm value.

Recommended production starting point: 2.

Local/resource-constrained deployments may use 0. User-specific configuration is post-claim bootstrap so warm adoption remains available.

## LiteLLM minimal deployment

The initial Magda deployment deliberately keeps LiteLLM minimal:

- static model config in ConfigMap;
- provider/master credentials in Kubernetes Secret;
- internal ClusterIP only;
- no PostgreSQL;
- no Redis.

Multiple replicas without Redis are allowed by Magda. Operators must understand that LiteLLM router cooldowns/rate limits/caches are process-local in that topology. Add Redis only when shared coordination is required.

Adding Redis does not require adding PostgreSQL. PostgreSQL remains optional unless LiteLLM database-backed management/tracking features are intentionally adopted.

## Security/network requirements

- sandbox direct access to LiteLLM denied;
- sandbox internal/private/link-local/cloud-metadata egress denied;
- Magda external endpoint reachable;
- Agent Manager is the only normal ingress path to sandbox DSH;
- LiteLLM provider credentials never enter sandbox;
- Agent Manager Kubernetes RBAC is namespace-scoped and includes only required Agent Sandbox lifecycle and Pod exec operations.
