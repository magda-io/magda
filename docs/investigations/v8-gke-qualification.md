# GKE qualification: ingress-nginx + L4 passthrough NLB + Agent Sandbox / gVisor

Issue: [#3848](https://github.com/magda-io/magda/issues/3848) · Parent: [#3810](https://github.com/magda-io/magda/issues/3810) · Design: [#3811](https://github.com/magda-io/magda/issues/3811) / [#3822](https://github.com/magda-io/magda/issues/3822) / [#3824](https://github.com/magda-io/magda/issues/3824) · Builds on: [#3841 PoC](./v8-dsh-direct-exposure.md) ([#3844](https://github.com/magda-io/magda/pull/3844)) · Deployment guide: [#3849](https://github.com/magda-io/magda/issues/3849) · Deferred: native GCE Ingress [#3851](https://github.com/magda-io/magda/issues/3851)

> **Status: complete** (2026-10-10). Every test below ran on a real GKE Standard cluster through
> `client/Chrome → external passthrough NLB → ingress-nginx (TLS) → Agent Manager PoC → KAS Sandbox Service → DSH in a gVisor Pod`,
> with no `kubectl port-forward`.

Reproduction material: [`deploy/poc/dsh-direct-exposure/gke/`](../../deploy/poc/dsh-direct-exposure/gke/). Raw results: [`deploy/poc/dsh-direct-exposure/gke/results/`](../../deploy/poc/dsh-direct-exposure/gke/results/).

## Outcome

The **GKE + ingress-nginx (L4 NLB) + GKE Sandbox (gVisor) + Agent Sandbox v1.0.4** profile works for the v8 alpha. It needs these GKE-specific corrections:

1. **Agent sandbox Pods must set `fsGroupChangePolicy: OnRootMismatch`** ([G2](#g2--fsgroup-re-chmod-breaks-dsh-after-every-remount-on-csi-volumes)). Without it, DSH refuses to start after any suspend/resume or Pod replacement on a PD-backed PVC. This happens under runc too, so it is a GKE storage issue, not a gVisor one. **The MVP chart on `feat/3849-agent-workspace-mvp` has the same bug** (`agent-runtime/templates/runtime.yaml`).
2. **gVisor needs a dedicated GKE Sandbox node pool** ([G1](#g1--gke-sandbox-needs-its-own-node-pool)). It can't be enabled on the default pool.
3. **NetworkPolicy is not enforced unless the cluster has Dataplane V2 or Calico enforcement** ([G5](#g5--networkpolicy-is-silently-not-enforced-on-this-cluster)). On this cluster the KAS-managed policies were accepted but had no effect. This must be a documented prerequisite (and ideally a preflight check), not an assumption ([open items](#open-items-recorded-here-instead-of-separate-issues)).
4. **Sandbox Pods can get a Google access token from the GKE metadata server** when Workload Identity Federation is enabled ([G6](#g6--metadata-server-node-credentials-blocked-workload-identity-token-available)). Node credentials (`kube-env`) are blocked. Treat this as an open security item for #3824 ([open items](#open-items-recorded-here-instead-of-separate-issues)).
5. **ingress-nginx is retired upstream** (v1.15.1 is the final release), and an `nginx` IngressClass isn't necessarily kubernetes/ingress-nginx ([G7](#g7--ingress-controller-choice)). Fine for the alpha; record the risk in #3849 ([open items](#open-items-recorded-here-instead-of-separate-issues)).

The L4 load balancer path needs no Magda change: the `cloud.google.com/l4-rbs: "enabled"` annotation on ingress-nginx's own controller `Service`, set when the Service is created, is enough. WebSockets through it behave exactly as on Minikube ([G3](#g3--external-passthrough-nlb-verified-at-the-gcp-resource-level), [G4](#g4--websockets-and-timeouts)).

## What was and was not validated

| Validated on GKE (this ticket)                                                                                                                              | **Not** validated here (stand-in or out of scope)                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External **passthrough** NLB with a regional backend service (GCP forwarding rule inspected); TLS at ingress-nginx; HTTP → HTTPS redirect; Host routing     | **magda-gateway and Magda auth.** ingress-nginx routes straight to Agent Manager, and the test client mints the `X-Magda-Session` JWT the gateway would attach. The gateway's handshake Origin allowlist ([#3843](https://github.com/magda-io/magda/pull/3843)) is therefore not in the chain |
| HTTPS + `wss` upgrade to DSH's native `/api/remote.mux` in a gVisor Pod, from Node and from real Chrome (DSH UI boots, one socket, streaming turn)          | Magda session lifetime, logout → Sandbox deletion → socket close (#3849/#3850)                                                                                                                                                                                                                |
| Idle/long-lived WebSocket behaviour vs nginx's default and raised timeouts, GCP connection tracking, and nginx reloads                                      | LiteLLM / Magda LLM Services and model credentials; a mock LLM was used                                                                                                                                                                                                                       |
| Agent Manager PoC: user → SandboxClaim → KAS Service, managed DSH cookie (launch token via `pods/exec`), DSH Host/Origin fence                              | Warm pools > 0, multi-user authorization, HA/multi-zone, node upgrades with live sessions, real certificates (cert-manager)                                                                                                                                                                   |
| KAS v1.0.4 on GKE: SandboxClaim → Sandbox → Pod → headless Service → PVC, all Ready; `runtimeClassName: gvisor` on a GKE Sandbox node, gVisor kernel inside | **NetworkPolicy enforcement**: this cluster can't enforce it (G5). The policy objects and expected matrix are unchanged from #3841, which verified them on Minikube                                                                                                                           |
| DNS, in-cluster and public egress (private nodes via Cloud NAT), metadata reachability                                                                      | Native GCE Ingress / L7 load balancers: unsupported for the alpha, [#3851](https://github.com/magda-io/magda/issues/3851)                                                                                                                                                                     |
| PD-CSI PVC provision/mount under gVisor, suspend/resume, Pod replacement, reclaim down to GCE disk deletion                                                 | The full Magda MVP ([#3850](https://github.com/magda-io/magda/pull/3850))                                                                                                                                                                                                                     |

## Environment

From [`results/environment.txt`](../../deploy/poc/dsh-direct-exposure/gke/results/environment.txt):

| Item               | Value                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cluster            | GKE **Standard**, zonal `australia-southeast1-a`, control plane `1.35.6-gke.1250000`, no release channel, private nodes (public control-plane endpoint), VPC-native, IPv4, `LEGACY_DATAPATH`, NetworkPolicy enforcement **off**, Workload Identity on |
| Existing node pool | `default-pool`: `e2-standard-8`, COS containerd, `1.34.9-gke.1655001`; hosts the live test site, untouched                                                                                                                                            |
| Added node pool    | `kas-gvisor-3848`: 1 × `e2-standard-2` **Spot**, COS containerd, `1.35.6-gke.1250000`, `sandboxConfig: GVISOR`, `GKE_METADATA`; kernel `6.12.85+`, containerd `2.1.7`                                                                                 |
| RuntimeClass       | `gvisor` (handler `gvisor`) already existed, created and reconciled by GKE; its `scheduling` adds `nodeSelector sandbox.gke.io/runtime=gvisor` and the matching `NoSchedule` toleration                                                               |
| Agent Sandbox      | v1.0.4 `sandbox-with-extensions.yaml` (controller `--extensions`, no webhooks). v1.0.6 is current; see [G8](#g8--other-notes)                                                                                                                         |
| ingress-nginx      | chart `4.15.1`, controller `v1.15.1` (the final upstream release; see [G7](#g7--ingress-controller-choice))                                                                                                                                           |
| Storage            | default StorageClass `standard-rwo` (`pd.csi.storage.gke.io`, pd-balanced, `WaitForFirstConsumer`, `Delete`)                                                                                                                                          |
| DSH / images       | `@deepseek-ai/dsh` `0.2.1-alpha.1` stock image from #3841, built for `linux/amd64` and pushed to a temporary Artifact Registry repo                                                                                                                   |

Isolation from the live site: everything ran in two new namespaces (`magda-gke-3848`, `ingress-nginx-3848`) plus `agent-sandbox-system`. ingress-nginx used its own IngressClass `nginx-3848`, `--watch-namespace` for the PoC namespace, and **no** admission webhook (its `ValidatingWebhookConfiguration` would match every Ingress in the cluster). The LB firewall admitted only the tester's IP (`loadBalancerSourceRanges`).

## Results

| Test                                                                                                    | Result                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`lb-l4-check.sh`](../../deploy/poc/dsh-direct-exposure/gke/results/lb-l4-check.txt)                    | 7/7: regional `EXTERNAL` `TCP` forwarding rule → backend service (`TCP`, `CONNECTION`), no URL map / proxy                                  |
| [`external-chain.mjs`](../../deploy/poc/dsh-direct-exposure/gke/results/external-chain-gvisor.json)     | 14/14                                                                                                                                       |
| [`browser-e2e.mjs`](../../deploy/poc/dsh-direct-exposure/gke/results/browser-e2e-gvisor.json) (Chrome)  | 6/6                                                                                                                                         |
| [`platform-checks.sh`](../../deploy/poc/dsh-direct-exposure/gke/results/platform-checks-gvisor.txt)     | 10 pass, 1 finding (G6), 3 expected gaps (G5)                                                                                               |
| [`pvc-lifecycle.sh`](../../deploy/poc/dsh-direct-exposure/gke/results/pvc-lifecycle-gvisor.txt)         | 13/13 with `OnRootMismatch`; [3 failures without it](../../deploy/poc/dsh-direct-exposure/gke/results/pvc-lifecycle-before-fsgroup-fix.txt) |
| `ws-longlived.mjs` ([`results/ws-longlived-*.json`](../../deploy/poc/dsh-direct-exposure/gke/results/)) | see [G4](#g4--websockets-and-timeouts)                                                                                                      |

## Findings

### G1 — GKE Sandbox needs its own node pool

- The cluster's control-plane and node versions support GKE Sandbox. But in Standard mode it can only be enabled **per node pool**, never on the default pool, and a non-sandbox pool must remain for system workloads. Creating the pool needs `--sandbox type=gvisor` and `COS_CONTAINERD`.
- GKE labels and taints the pool's nodes `sandbox.gke.io/runtime=gvisor:NoSchedule`. The GKE-managed `gvisor` RuntimeClass injects the matching nodeSelector and toleration, so a KAS template only needs `runtimeClassName: gvisor`. No existing workload was scheduled on the new node apart from GKE DaemonSets.
- Evidence inside the Pod: `uname -r` reports `4.4.0` (a runc Pod on default-pool reports the host's `6.12.94+`), and `dmesg` starts with `Starting gVisor...`. The PVC is mounted through the gVisor gofer (`9p … directfs`).
- `seccompProfile: RuntimeDefault` in the Pod's securityContext is admitted. GKE documents that seccomp/AppArmor/SELinux don't apply inside the sandbox, so it is simply ineffective under gVisor.
- `kubectl port-forward` is unsupported for gVisor Pods on GKE. Nothing in the design depends on it, and `kubectl exec` (and therefore Agent Manager's `pods/exec` token read) works.
- Cold claim → Ready took 21–47 s (PD provision + attach + first image pull of ~300 MB; ~25 s with the image cached).
- The pool used a Spot VM to save cost. Production should not run user Sandboxes on Spot nodes: a preemption deletes every Pod on the node.

### G2 — fsGroup re-chmod breaks DSH after every remount on CSI volumes

**Symptom.** After `operatingMode: Suspended → Running`, or after the Sandbox Pod was deleted and recreated, the DSH container crash-looped. KAS reported `PodFailed` and the Pod took ~7 minutes to recover:

```text
credentials-local: /data/dsh-home/.credentials.yaml is readable beyond its owner (mode 660);
run "chmod 600 /data/dsh-home/.credentials.yaml" before starting again
```

**Cause.** The template sets `fsGroup: 10001`. The GKE PD CSI driver supports volume ownership management, so with the default `fsGroupChangePolicy: Always` the kubelet re-applies fsGroup recursively on every mount (chgrp + `g+rw`, setgid on dirs). That turns DSH's `0600` credential file into `0660`, and DSH rightly refuses it. The first boot is fine because the file doesn't exist yet. Minikube's hostpath volumes skip fsGroup handling, which is why #3841 never saw it. The same failure was reproduced with a **runc** Sandbox on default-pool.

**Fix (verified).** `fsGroupChangePolicy: OnRootMismatch`: the kubelet only fixes ownership when the volume root doesn't already match. With it, suspend/resume (Ready in 24 s) and Pod replacement (17 s) keep the volume, the marker file and DSH's credentials intact. Both PoC template renderers now set it. **The #3850 chart must set it too.** `deploy/helm/internal-charts/agent-runtime/templates/runtime.yaml` on `feat/3849-agent-workspace-mvp` currently has `fsGroup: 10001` only, so it will hit this on GKE (and on any CSI block storage). Raised on #3850: FSGROUP_COMMENT_LINK.

### G3 — External passthrough NLB, verified at the GCP resource level

- ingress-nginx's controller `Service` (`type: LoadBalancer`, `externalTrafficPolicy: Local`) was created **with** `cloud.google.com/l4-rbs: "enabled"`. GKE built:
  - a **regional** forwarding rule, `loadBalancingScheme: EXTERNAL`, `IPProtocol: TCP`, ports 80/443, with `backendService` set and no `target`;
  - a regional backend service (`protocol: TCP`, `balancingMode: CONNECTION`) over a `GCE_VM_IP` NEG (one endpoint: the node running the controller Pod), with an HTTP health check on the Service's `healthCheckNodePort` `/healthz`;
  - firewall rules: the client rule restricted to `loadBalancerSourceRanges`, plus the health-check ranges.
- No URL map or target HTTP(S) proxy references it, so it is **not** a Google L7 load balancer. TLS terminated at ingress-nginx: `TLSv1.3` with the PoC certificate.
- The project's two older LoadBalancer Services, created years ago without the annotation, are legacy **target-pool** NLBs. The default for new Services varies with the GKE version, so the documented ingress-nginx install should set the annotation (or a version-appropriate `loadBalancerClass`) explicitly. Adding it to an existing Service doesn't migrate that Service.
- `externalTrafficPolicy: Local` keeps the client IP. The NLB only sends traffic to nodes running a controller Pod.

### G4 — WebSockets and timeouts

All runs used gVisor Sandboxes and went through the NLB. A run is "quiet" when DSH's heartbeat is raised so the socket carries no traffic.

| DSH heartbeat     | nginx `proxy-read/send-timeout`              | Held for | Outcome                                                                                         |
| ----------------- | -------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| 2 s (DSH default) | default (60 s)                               | 900 s    | **still open**, 450 pings                                                                       |
| 120 s             | default (60 s)                               | 180 s    | **closed at 61 s**, TCP close, no WS close                                                      |
| 1 h (quiet)       | default (60 s)                               | 180 s    | **closed at 61 s**                                                                              |
| 120 s             | 3600 s                                       | 900 s    | **still open**, 7 pings                                                                         |
| 1 h (quiet)       | 3600 s                                       | 1500 s   | **still open**, 0 frames (no end probe)                                                         |
| 1 h (quiet)       | 3600 s                                       | 720 s    | **still open**; first frame after 651 s of silence arrived; client ping → pong at 720 s (23 ms) |
| 2 s               | 3600 s, Ingress metadata-only change at 30 s | 400 s    | **still open** (controller: `Sync`, no nginx reload)                                            |
| 2 s               | 3600 s, nginx reload at 30 s                 | 400 s    | **closed 241 s after the reload**, TCP close, no WS close                                       |

- The GKE behaviour matches #3841's Minikube results. nginx's 60 s `proxy_read_timeout` closes a socket that is idle for 60 s. DSH's 2 s heartbeat already prevents that, and explicit `proxy-read-timeout`/`proxy-send-timeout` annotations (e.g. `3600`) are the belt-and-braces setting #3849 should document.
- The NLB is passthrough, so it adds no HTTP-level timeout. A completely silent socket survived more than 10 minutes of idleness through the NLB and VPC firewall connection tracking, and still carried frames in both directions afterwards. So with the timeouts raised, nothing on the GCP side cut an idle WebSocket in the probed 12-minute run, and a 25-minute run without a final probe also stayed open.
- **An nginx configuration reload ends every open WebSocket within `worker-shutdown-timeout` (default 240 s).** The old workers keep serving existing connections until then and then drop them without a WebSocket close frame. A reload follows any change to the rendered nginx config for any Ingress the controller watches (annotations, paths, hosts), not just Magda's own. Endpoint changes (Pod restarts) are applied dynamically and don't reload. Implications for #3849/#3850:
  - the DSH client must reconnect, which it does: #3841 verified reconnects after gateway/Agent Manager restarts;
  - operators who need longer drains can raise `worker-shutdown-timeout` in the controller ConfigMap, at the cost of slower reload memory release;
  - a shared ingress controller means other tenants' Ingress edits will periodically reset agent sessions' sockets.

### G5 — NetworkPolicy is silently not enforced on this cluster

- This cluster runs the legacy datapath with the NetworkPolicy add-on disabled. KAS created its `NetworkPolicy` objects (`networkPolicyManagement: Managed`) and the API accepted them, but nothing enforced them:
  - a peer the policy doesn't allow (`mock-llm`) connected to a Sandbox on `:3080`;
  - the Sandbox reached a private ClusterIP (Agent Manager) and the **control-plane private endpoint** (`172.16.0.34:443`, HTTP 200 on `/version`), even though its egress policy excludes RFC 1918.
- Enabling Calico enforcement on an existing cluster recreates **all** node pools, and Dataplane V2 is normally chosen when a cluster is created. This was not done on a cluster hosting a live site (decision recorded with the cluster owner).
- **Requirement for Magda on GKE (#3849):** NetworkPolicy enforcement is mandatory for Agent Workspace, because the Sandbox ingress rule is what keeps other Pods away from DSH ([#3841](./v8-dsh-direct-exposure.md): DSH's Host fence isn't access control). Use a Dataplane V2 cluster (default for new Autopilot, `--enable-dataplane-v2` for Standard) or enable Calico.
- **Suggested preflight:** Agent Manager or a chart hook should verify enforcement at install or start-up (e.g. a deny-all canary policy plus a connection probe) and refuse to run, or warn loudly, when it is off.
- **Follow-up:** re-run the #3841 NetworkPolicy matrix (`tests/netpol.sh`) and G6's metadata checks on a Dataplane V2 GKE cluster.

### G6 — Metadata server: node credentials blocked, Workload Identity token available

- From inside the gVisor Sandbox:
  - `…/instance/attributes/kube-env` returns **404**: the GKE metadata server hides the node's bootstrap credentials.
  - `…/instance/service-accounts/default/token` returns **200**.
- The cluster has Workload Identity Federation enabled (`GKE_METADATA` on both pools), so the metadata server issues a token for the Pod's Kubernetes service account. `automountServiceAccountToken: false` doesn't change that, because the metadata server identifies the Pod by its IP. The test recorded HTTP status codes only. Which identity the token represents, and what it can access, depends on IAM grants to Workload Identity principals in the project, and was not examined.
- **Recommendation for #3824:**
  - run Sandboxes under a dedicated KSA with no IAM bindings;
  - make sure the project grants nothing to broad `principalSet://…/namespace/<agent-ns>` or pool-wide principals;
  - block `169.254.169.254` egress where the datapath allows it (the template already excepts `169.254.0.0/16`, but G5 means that wasn't enforced here). Verify that on Dataplane V2.

### G7 — Ingress controller choice

- **ingress-nginx is retired upstream.** `controller-v1.15.1` / chart `4.15.1` (2026-03-19) is the final release; there are no further fixes, including security fixes. This qualification is valid for the alpha. #3849 should state the risk and track a successor (Gateway API implementation, F5 NGINX Ingress Controller, …) as a separate decision.
- **IngressClass names are not portable.** On this cluster the existing `nginx` IngressClass belongs to **F5 NGINX Ingress Controller** (`nginx.org/ingress-controller`), not kubernetes/ingress-nginx. Its annotations are `nginx.org/*` and it needs `nginx.org/websocket-services` for WebSockets. Magda's `ingressClass: nginx` with `nginx.ingress.kubernetes.io/*` annotations would route there with the timeouts silently ignored. #3849 should tell operators to check the class's `spec.controller` (`k8s.io/ingress-nginx`).

### G8 — Other notes

- **Images and registry:** GKE nodes are amd64, so images must be built for `linux/amd64` (the PoC builds with `docker buildx --platform linux/amd64`). Private nodes pull as the node service account, which here had no Artifact Registry role, so a repository-scoped `roles/artifactregistry.reader` was needed. Production should use the project's normal registry/pull-secret arrangement (`magda.imagePullSecrets`).
- **Storage:** a 1 Gi PVC became a 1 GB pd-balanced zonal disk. The PVC is owned by the Sandbox, so deleting the claim deleted the Sandbox, Pod, Service, PVC, PV and GCE disk. Zonal PDs pin a Sandbox to its zone; a regional cluster needs a regional or zone-aware StorageClass decision (not covered).
- **Sandbox Services are headless** (`clusterIP: None`, named after the Sandbox). DNS resolves straight to the Pod IP, so the port mapping is irrelevant and Agent Manager connects to `:3080`. KAS v1.0.6 rejects Sandbox names longer than 63 characters when `service: true`. Magda's claim/Sandbox naming must stay within a DNS label anyway.
- **Scoped controller events:** with `--watch-namespace`, ingress-nginx's namespaced RBAC can't write its own Pod events (`can't patch an event with namespace 'ingress-nginx-3848' in namespace 'magda-gke-3848'`). This is log noise only.
- **Pod CIDR:** the new pool's Pods received addresses from `10.96.0.0/…` and default-pool's from `10.104.0.0/14`. Both are inside `10.0.0.0/8`, so the template's RFC 1918 egress exception covers them.

## Acceptance criteria (#3848)

| Criterion                                                                                    | Status                                                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Small reproducible PoC on real GKE with ingress-nginx + external L4 LB + KAS/gVisor          | Done: [`gke/`](../../deploy/poc/dsh-direct-exposure/gke/) scripts 01–05, 99                            |
| External endpoint reaches a gVisor Sandbox without port-forward; LB verified L4, not L7      | Done: `external-chain`, `browser-e2e`, `lb-l4-check` (G3)                                              |
| HTTPS + WS upgrade through ingress-nginx; long-lived WS beyond the default idle timeout      | Done: G4                                                                                               |
| gVisor SandboxClaim / Sandbox / Pod / KAS Service ready and reachable; GKE-specific failures | Done: G1, G2 (fsGroup failure + fix)                                                                   |
| DNS / egress / NetworkPolicy / PVC tested or documented                                      | DNS, egress, PVC tested; NetworkPolicy **not enforceable on this cluster** (G5), metadata finding (G6) |
| Reproduction, setup/teardown, versions and evidence committed                                | Done: this document, `gke/README.md`, `gke/results/`                                                   |
| Validated GKE infrastructure separated from unvalidated MVP behaviour                        | [Table above](#what-was-and-was-not-validated)                                                         |
| Native GCE Ingress stays unsupported, deferred to #3851                                      | Not used: no `BackendConfig`/`GCPBackendPolicy`                                                        |

## Follow-ups

### For the MVP (#3850)

- **`fsGroupChangePolicy: OnRootMismatch` on the agent-runtime Sandbox template** (G2). Without it, a Sandbox on GKE fails to restart after its first suspend/resume or Pod replacement. Raised on #3850: FSGROUP_COMMENT_LINK.

### For the deployment guide (#3849)

- the `l4-rbs` annotation on ingress-nginx's controller Service, set at creation (G3);
- explicit `proxy-read-timeout`/`proxy-send-timeout`, and the reload behaviour (G4);
- NetworkPolicy enforcement as a hard prerequisite (G5);
- checking the IngressClass's controller, and the ingress-nginx retirement (G7).

### Open items recorded here instead of separate issues

By decision (2026-10-10), the NetworkPolicy, metadata and ingress-controller findings (G5–G7) get no separate follow-up issues. They are recorded here and in the #3848 PR description, to be carried by #3849 (guide), #3824 (security design) and #3850 (MVP):

| Item                                                       | What is known                                                                                                                                                         | What is still needed                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NetworkPolicy enforcement (G5)                             | Not enforced on a legacy-datapath cluster without Calico. The KAS policies are accepted and silently ineffective; Sandboxes reached private IPs and the control plane | Re-run the #3841 matrix (`tests/netpol.sh`) and `gke/tests/platform-checks.sh` on a Dataplane V2 (or Calico) GKE cluster. Document enforcement as a prerequisite. Consider an install/start-up preflight that refuses to run, or warns, when it is off |
| Metadata server / Workload Identity (G6)                   | `kube-env` is blocked (404); the WIF token endpoint answers 200 from a gVisor Sandbox                                                                                 | Decide the Sandbox KSA/IAM posture in #3824 (dedicated KSA, no principalSet grants). Check whether egress to `169.254.169.254` can be blocked by NetworkPolicy on Dataplane V2                                                                         |
| ingress-nginx retirement and IngressClass portability (G7) | v1.15.1 is the final upstream release; an `nginx` IngressClass may belong to F5 NGINX Ingress Controller, which ignores `nginx.ingress.kubernetes.io/*`               | State the risk in #3849; choose a supported controller for after the alpha                                                                                                                                                                             |

## Cleanup

`scripts/99-teardown.sh` deletes, in order:

- the SandboxClaims (their PVCs and PDs are reclaimed);
- the PoC namespace;
- the ingress-nginx release and namespace (GKE removes the forwarding rule, backend service, health check and firewall rules);
- the KAS install;
- the gVisor node pool;
- the Artifact Registry repo.

It then lists any leftovers. It ran on 2026-10-10 ([`results/teardown.txt`](../../deploy/poc/dsh-direct-exposure/gke/results/teardown.txt), [`results/teardown-verify.txt`](../../deploy/poc/dsh-direct-exposure/gke/results/teardown-verify.txt)). Afterwards:

- no PoC forwarding rule, backend service, health check, NEG, firewall rule, PD, PV, namespace, IngressClass, CRD or Artifact Registry repo remained;
- only `default-pool` was left;
- the live site's workloads were unaffected.
