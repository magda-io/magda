# Deployment and Helm design

**Status:** Draft — MVP implementation alignment and GKE platform evidence incorporated; security qualification remains open  
**Owner:** #3811 / MVP #3849 and #3850; GKE investigation #3848 / PR #3852  
**Depends on:** #3822–#3825, network/security design, #3838

This describes the **current #3850 MVP Helm interface** as implementation evidence, not a promise that all environments are production-qualified. Refer to [network-security.md](./network-security.md) for mandatory isolation preconditions and to [the GKE investigation](../../investigations/v8-gke-qualification.md) on the #3852 branch for experimental results.

## Chart and responsibility boundaries

- \`magda-core\` gates the independent \`agent-services\` chart with \`global.agentWorkspace.enabled\` and the \`llm-services\` chart with \`global.llmServices.enabled\`. **LLM Services may run without Agent Workspace; the current Agent Workspace requires LLM Services.**
- **One \`agent-services\` chart**, but **two separate images/processes**: \`magda-agent-manager\` for the control plane and \`magda-agent-runtime\` for sandbox Pods. It creates one selected \`SandboxTemplate\` and one \`SandboxWarmPool\`, not templates for every runtime.
- \`llm-services\` owns an **optional** bundled \`litellm\` subchart. With bundled LiteLLM, the facade derives its internal backend URL and master-key Secret from that child chart. With it disabled, operators must explicitly supply the external backend URL and key Secret.
- Kubernetes Agent Sandbox (**KAS**) CRDs/controllers are installed **separately**; Magda must not silently install cluster-wide KAS as a chart dependency. The MVP live-install/pre-upgrade Job checks KAS v1beta1 APIs and the selected RuntimeClass without breaking offline \`helm template\`. **It does not establish that NetworkPolicy is enforced.**
- Magda Gateway handles Magda authentication and routes same-origin DSH HTTP and WebSocket to Agent Manager. The Sandbox never receives browser sessions or provider credentials.

## MVP Helm values (illustrative, aligned with #3850)

\`\`\`yaml
global:
  agentWorkspace:
    enabled: true
    # "" => derived, length-safe <release-namespace>-agents
    sandboxNamespace: ""
  llmServices:
    enabled: true

agent-services:
  warmPool:
    type: gvisor # runc (trusted local only), gvisor, kata
    size: 2     # 0 for resource-constrained local development
  runtimeClasses:
    gvisor: gvisor
    kata: kata
  manager:
    replicas: 1
  runtime:
    image:
      name: magda-agent-runtime
    storage:
      size: 5Gi
      # Set a qualified StorageClass appropriate to the cluster.
      storageClassName: ""
  idleSuspendSeconds: 1800
  hardDeleteSeconds: 28800

llm-services:
  allowedModels: magda-agent-default
  litellm:
    enabled: true
  # If litellm.enabled=false, configure backend.url and
  # backend.masterKeySecret.{name,key} for an existing backend.

ingress:
  ingressClass: nginx # Verify this class belongs to the intended controller.
  proxyReadTimeout: 3600
  proxySendTimeout: 3600
\`\`\`

The bundled LiteLLM uses static configuration and Kubernetes Secrets; neither PostgreSQL nor Redis is mandatory. Multiple replicas without Redis have per-process router/rate-limit/cooldown/cache state. Provider credentials must stay outside the Sandbox.

### Installation-scoped ownership and migrations

The MVP calculates a stable installation ID from **release name + release namespace** and uses it for claim names, labels/selectors, warm-pool names, RBAC resources and the reserved system-managed key name. The default Sandbox namespace is \`<release-namespace>-agents\` (length-safe with a hash); an explicit override is available. An override allowing releases to share a Sandbox namespace does **not** grant authority to read/adopt/delete the other release's claims.

Changing \`warmPool.type\` or upgrading a prior split \`agent-manager\` + \`agent-runtime\` installation is a **drain/reset migration**. Clean up active legacy claims/sandboxes/PVCs and managed keys before migrating. The Helm chart does not migrate existing user workspaces transparently. Always communicate the data-loss implications.

The warm-pool replica target is the number of **unclaimed** warm Sandboxes; a claimed Sandbox and PVC become user-owned and are never returned to the pool. Use size 0 for lightweight tests, and treat size 2 as a **starting capacity recommendation**, not a fixed requirement.

## GKE Agent Workspace target — evidence and prerequisites

**PoC-validated on real GKE (#3852):** a zonal GKE Standard cluster with a dedicated gVisor node pool, KAS v1.0.4, an **external L4 passthrough NLB -> community ingress-nginx -> minimal Agent Manager proxy -> KAS Sandbox Service -> stock DSH**, native HTTPS/WSS, and zonal GCE PD CSI persistence/remount/deletion.

**Not security-qualified on that cluster:** its legacy datapath had NetworkPolicy enforcement disabled. Non-allowed Pod ingress and Sandbox egress to private services/control plane succeeded despite policies. The GKE metadata server also returned a Workload Identity token response; its effective IAM permissions were **not tested**. Therefore, **#3852 is transport/storage/runtime proof, not sign-off for a secure production deployment**. It omitted full Magda Gateway authentication, real LiteLLM, HA, production TLS and multi-zone operation.

A GKE Agent Workspace installation **requires** before enablement:

1. A GKE Sandbox-enabled **non-default node pool** with gVisor, plus a non-sandbox pool for system workloads; the GKE-managed \`gvisor\` RuntimeClass selects/tolerates the sandbox pool.
2. Separately installed and qualified KAS CRDs/controller; the live chart hook checks API discovery and RuntimeClass, but not the cluster's enforcement behaviour.
3. **Functioning NetworkPolicy enforcement**, e.g. GKE Dataplane V2 or qualified Calico, proven by the **negative and positive** test matrix in [network-security.md](./network-security.md). A successfully created NetworkPolicy object is not proof.
4. Explicit Sandbox Kubernetes ServiceAccount / Google IAM posture with **no unintended grants**, including namespace- or pool-wide Workload Identity principal grants; verify metadata reachability and effective token permissions. \`automountServiceAccountToken: false\` alone does not block GKE metadata-server tokens.
5. A StorageClass with appropriate provisioning, ownership, zone placement and delete/reclaim behaviour. The runtime Pod must use \`fsGroupChangePolicy: OnRootMismatch\` so CSI remount does not broaden the DSH \`0600\` credentials file to \`0660\` and break DSH startup.
6. External Magda HTTPS hostname reachability from the Sandbox, DNS/public egress per policy, and no unintended Kubernetes private/metadata access. Verify necessary platform-specific metadata/DNS allowances rather than assuming raw CIDR exceptions are sufficient.
7. A controlled ingress installation whose **IngressClass ownership**, HTTPS/WSS behaviour and actual LB topology have been verified.

**Unqualified:** GKE Dataplane V2 enforcement matrix, Workload Identity IAM boundary, multi-zone/regional persistent disks, HA/upgrades with connected browsers and AKS/Kata. Do not declare these supported solely because the GKE PoC ran on a legacy-datapath zonal cluster.

## GKE external L4 ingress setup and verification

The L4 load balancer is created by the **ingress controller's Kubernetes Service**, **not** by Magda's \`Ingress\` resource or nginx Deployment.

For the specific **community ingress-nginx PoC controller** (chart 4.15.1 / controller 1.15.1), the relevant Helm values were:

\`\`\`yaml
controller:
  service:
    type: LoadBalancer
    annotations:
      cloud.google.com/l4-rbs: "enabled"
    externalTrafficPolicy: Local
\`\`\`

The \`l4-rbs\` selector must be present when the Service is **first created** on applicable GKE versions. Use a version-supported L4 \`loadBalancerClass\` approach instead where appropriate. \`externalTrafficPolicy: Local\` preserves client IP and depends on correct health checks/controller Pod placement; it is a PoC choice, not universal Magda policy.

In Magda, select the **matching actual controller** with the \`ingress.ingressClass\` Helm value, set TLS and nginx timeouts, and leave the GCE-L7-specific \`ingress.ipName\` unset. Verify controller ownership:

\`\`\`sh
kubectl get ingressclass -o custom-columns=NAME:.metadata.name,CONTROLLER:.spec.controller
kubectl -n ingress-nginx get svc -o wide
kubectl -n <magda-namespace> get ingress -o yaml
gcloud compute forwarding-rules list --filter="IPAddress=<external-lb-ip>" \
  --format="table(name,region,IPAddress,IPProtocol,loadBalancingScheme,target,backendService)"
\`\`\`

The PoC showed a **regional EXTERNAL TCP forwarding rule -> backend service**, with **no HTTP(S) URL map/proxy**, confirming L4 passthrough. Browser TLS terminates at the ingress controller. On the PoC, nginx's default 60-second \`proxy_read_timeout\` closed quiet sockets after ~61 seconds, while \`proxy-read-timeout\`/\`proxy-send-timeout\` 3600 preserved quiet connections. A real nginx config reload closed a previously open WebSocket ~241 seconds later: **clients must reconnect**. DSH's normal heartbeat helps with idle timeouts but is not a substitute for documented proxy/reload behaviour.

**Ingress controller support boundary:** \`IngressClass\` name \`nginx\` is ambiguous. In #3852's cluster it belonged to **F5 NGINX Ingress Controller**, which uses different annotation semantics; \`nginx.ingress.kubernetes.io/*\` settings would not apply there. Explicitly check \`spec.controller\`. Moreover, upstream **community \`kubernetes/ingress-nginx\` retired in March 2026**; its successful PoC is valid evidence but does **not** make that unmaintained controller a recommended long-term externally exposed production default. Select/qualify a maintained successor separately. **Native GCE L7 Ingress is not part of the current v8 alpha-supported path**; qualification is deferred to #3851. Do not add \`BackendConfig\`/\`GCPBackendPolicy\` to this L4 path.

## Security and operations

- Only Agent Manager may reach the DSH Sandbox port; Sandbox-to-Sandbox access and direct Sandbox-to-LiteLLM access are denied **by enforced** policies. Allow external Magda API/LLM routes while protecting internal/private/network metadata targets.
- \`pods/exec\` is necessary for post-claim bootstrap/token hand-off; \`pods/log\` is not. Agent Manager RBAC is namespace-scoped and install-scoped where resources permit.
- Production must retain runtime image pinning, API-key expiry/deletion reconciliation, destructive reset/logout warnings, PV reclaim verification and audit.
- Browser-origin filtering, path-scoped CSP (#3846) and ingress WebSocket timeouts (#3847) are separate from L4/NLB selection.

## Qualification / sources

- Local Minikube DSH/WSS and security PoC: #3841 / [draft PR #3844](https://github.com/magda-io/magda/pull/3844).
- Real GKE experiment, reproducible scripts/results: #3848 / [draft PR #3852](https://github.com/magda-io/magda/pull/3852), \`docs/investigations/v8-gke-qualification.md\` on its stacked branch.
- Integrated, not-yet-merged MVP chart/Agent Manager: [draft PR #3850](https://github.com/magda-io/magda/pull/3850), head reviewed at \`24984ae05\`.
- Full GKE security qualification must **repeat the deny/allow and metadata/IAM matrix on an enforcing cluster** before the GKE profile is labelled secure/production-ready.
