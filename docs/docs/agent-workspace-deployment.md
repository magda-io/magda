# Agent Workspace deployment and operations

This operator guide covers the opt-in Agent Workspace in draft PR #3850,
including Helm setup, migration, local deployment and **partially qualified**
GKE alpha reference configuration. Read the
[architecture](./architecture/agent-workspace.md) and
[Agent Skills design](./architecture/agent-skills.md) for component contracts.
The [E2E guide](./e2e-test-cases/agent-workspace.md) contains executable
qualification checks. The profiles in `deploy/helm/` are **deployment overlays**,
not chart defaults; the published `magda-core` chart remains independently
composable into `magda` or another parent chart.

## Helm configuration and chart hierarchy

LLM Services is independently deployable. Agent Workspace requires it:

```yaml
global:
  agentWorkspace:
    enabled: true
    # Empty derives <release-namespace>-agents with collision-safe truncation.
    sandboxNamespace: ""
  llmServices:
    enabled: true
  defaultAgentModel:
    # Stable MAGDA/DSH-facing alias; provider upgrades do not change it.
    alias: magda-agent-default
    providerModel: openai/gpt-5.6-sol
    # Set to "" to omit the setting and use the provider default.
    reasoningEffort: medium
    contextWindow: 1050000
    maxTokens: 128000

agent-services:
  warmPool:
    type: gvisor # runc, gvisor, or kata
    size: 2
  runtimeClasses:
    gvisor: gvisor
    kata: kata
  hardDeleteSeconds: 28800
  idleSuspendSeconds: 1800
  # Optional overrides inherit global.defaultAgentModel when omitted.
  llm:
    model: ""
    contextWindow: null
    maxTokens: null
  runtime:
    storage:
      size: 5Gi

llm-services:
  # An empty list inherits global.defaultAgentModel.alias.
  allowedModels: []
  litellm:
    enabled: true
    # Optional overrides; empty values inherit global.defaultAgentModel.
    model:
      alias: ""
      providerModel: ""
```

The merged `agent-services` chart owns the Manager Deployment, Service, RBAC,
control Secret, Sandbox namespace, and exactly one selected SandboxTemplate and
SandboxWarmPool. `runc` omits `runtimeClassName` and is intended only for trusted
local development. gVisor and Kata default to RuntimeClasses named `gvisor` and
`kata`, which may be overridden.

Changing `warmPool.type` while claims exist is a migration, not an in-place
runtime switch. Drain or reset active workspaces, confirm their claims and warm
Sandboxes are gone, then upgrade the release and admit new workspaces.

### Mandatory migration from the split charts

Upgrading from the earlier `agent-manager` + `agent-runtime` charts to
`agent-services` is also a **drain/reset migration**. Legacy claim names and
managed-key names were user-scoped but not installation-scoped. The new Manager
intentionally does not adopt those resources, and Helm replaces the old
unhashed Template/WarmPool. Before upgrading:

1. Ask every user to publish durable results, then reset or log out through the
   old Manager. Do not manually delete a claim first: reset/logout revokes the
   legacy `magda-agent-workspace` managed key before deleting its claim and PVC.
2. Confirm no claimed legacy workspaces remain. Unclaimed old warm Sandboxes may
   remain until Helm removes the old pool during the upgrade:

   ```sh
   kubectl -n <sandbox-namespace> get sandboxclaims,sandboxes,pvc
   kubectl get sandboxclaims -A \
     -l '!agent.magda.io/installation-id'
   ```

3. If the old Manager cannot perform cleanup, use an administrator-issued system
   JWT with the trusted Authorization API private route to revoke each user's
   key named `magda-agent-workspace`, and only then remove that user's legacy
   claim/PVC. Never carry a raw legacy credential into the new runtime.
4. Upgrade Helm. Verify that exactly one installation-hashed Template/Pool is
   present, every new claim has `agent.magda.io/installation-id`, and no legacy
   managed keys, unscoped claims, claimed Sandboxes, or user PVCs remain. Users
   can then start clean installation-scoped workspaces.

With bundled LiteLLM enabled, its service URL and retained master-key Secret are
derived automatically. To use an external backend, set
`llm-services.litellm.enabled=false` and provide all of
`llm-services.backend.url`, `masterKeySecret.name`, and `masterKeySecret.key`.
Provider credentials remain confined to LiteLLM. The bundled chart reads an
optional provider credential from `providerSecret.name`/`providerSecret.key`
through the fixed internal environment name `LITELLM_PROVIDER_API_KEY`; leave
both Secret fields empty for a workload-identity or credential-free provider.
The bundled LiteLLM configuration exposes exactly one model, so its effective
allowlist must contain exactly one matching alias. An external
LiteLLM-compatible backend may expose multiple aliases:

```yaml
llm-services:
  allowedModels:
    - magda-agent-default
    - another-model
  litellm:
    enabled: false
  backend:
    url: https://llm.example/v1
    masterKeySecret:
      name: external-litellm-key
      key: master-key
```

MAGDA cannot inspect an external backend's model catalog. The operator is
responsible for ensuring every allowlisted alias exists there, and the Agent
Workspace model is included in the list. This deployment-wide allowlist remains
an independent restriction even when per-user OPA model authorization is added.

The stable public alias is `magda-agent-default`; changing only
`global.defaultAgentModel.providerModel` changes the bundled backend route
without changing DSH or LLM Services clients. The default explicitly selects
`medium` reasoning, with a 1,050,000-token context window and 128,000-token
maximum output. Set `global.defaultAgentModel.reasoningEffort: ""` to omit the
reasoning setting from both DSH and LiteLLM and let the provider choose its model
default. This is distinct from the explicit `off` effort. When selecting another
model, update `providerModel`, `reasoningEffort`, `contextWindow`, and `maxTokens`
to its capabilities. See the
[GPT-5.6 Sol model specification](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

Model settings are written into a workspace during provisioning. Existing
PVC-backed workspaces are intentionally not rebootstraped during a Helm upgrade;
reset development or pre-release workspaces after changing these settings so a
stale alias or reasoning effort is not retained.

## Scoped DSH Content Security Policy

The managed DSH Web app currently requires
`script-src 'self' 'unsafe-inline' 'unsafe-eval'`. **Do not relax Magda's
global CSP to accommodate DSH.** The Gateway Helm ConfigMap adds a
`helmetPerPath` policy for exactly the managed
`/api/v0/agent/runtime` mount, including descendant DSH requests, leaving
unrelated Magda routes under their existing stricter `script-src 'self'`
policy. The exception is an MVP compatibility constraint, **not** a desirable
general security setting.

When changing the Gateway mount or CSP configuration, verify the generated
policy and request-level behaviour: the DSH route works with its required
scripts, an ordinary Magda page retains the strict policy, and a near-match
or sibling prefix does not inherit the relaxed directives. See
[the E2E procedure](./e2e-test-cases/agent-workspace.md) and #3846.
Long-term removal of `unsafe-inline`/`unsafe-eval` depends on upstream DSH
compatibility improvements.

## Deployment

### Prerequisites

1. A Kubernetes cluster with an ingress controller and a working Magda release.
2. Kubernetes Agent Sandbox v1.0.4 installed cluster-wide:

   ```sh
   kubectl apply --server-side -f \
     https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v1.0.4/sandbox-with-extensions.yaml
   kubectl -n agent-sandbox-system rollout status deploy --timeout=300s
   ```

   KAS remains a cluster prerequisite, not a Magda Helm dependency. An
   `agent-services` pre-install/pre-upgrade hook checks the expected v1beta1 APIs
   and the selected gVisor/Kata RuntimeClass. The hook runs only during a real
   installation, so offline `helm lint` and `helm template` continue to work.

3. A Magda authentication plugin or another way to establish a user session,
   and a role assignment granting `agentWorkspace/access` to Workspace users
   (administrators already have it). `magda-auth-internal` is not a dependency of `magda-core`.
4. Images for Agent Manager, Agent Runtime, LLM Services, Authorization API,
   Gateway, Web Server, and Authorization DB Migrator published to a registry
   accessible by the cluster.
5. A provider API key stored outside Helm values:

   ```sh
   kubectl -n <magda-namespace> create secret generic litellm-provider \
     --from-literal=api-key="$OPENAI_API_KEY" \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

### Build local images

From the repository root, the following commands build the new services. Use
organisation-specific image names/tags for a shared registry:

```sh
(
  cd magda-agent-manager
  yarn build
  ../node_modules/.bin/create-docker-context-for-node-component \
    --build --tag localhost:5000/magda-agent-manager:latest --local
)
(
  cd magda-llm-services
  yarn build
  ../node_modules/.bin/create-docker-context-for-node-component \
    --build --tag localhost:5000/magda-llm-services:latest --local
)
(
  # prepare-docker builds the bundled mgd CLI and runs the runtime tests.
  cd magda-agent-runtime
  yarn prepare-docker
  ../node_modules/.bin/create-docker-context-for-node-component \
    --build --tag localhost:5000/magda-agent-runtime:latest --local
)
```

These commands build into the local Docker daemon without pushing. The
packages' `docker-build-local` scripts also `--push`, which fails unless a
registry is listening on `localhost:5000`.

Build the changed existing components using the repository's standard component
builder, including `magda-authorization-api`, `magda-opa`, `magda-gateway`,
`magda-storage-api`, `magda-web-server`, and
`magda-migrator-authorization-db`. The Minikube profile expects each as
`localhost:5000/<component>:latest`.

### Minikube-specific setup

The reproducible local E2E profile lives in
[`deploy/helm/agent-workspace-minikube.yml`](../../deploy/helm/agent-workspace-minikube.yml)
and targets the **`deploy/helm/local-deployment`** umbrella. The dependency
hierarchy is `local-deployment → magda → magda-core`; therefore
component overrides, including `agent-services`, `llm-services`, Gateway,
Ingress, and image overrides, belong under `magda.magda-core`. Helm `global`
settings remain at the overlay's top level. This differs from applying a values
file directly to `magda-core`. Do not interchange those profiles.

The `local-deployment` chart also includes the local authentication-plugin
dependency, so the standard E2E path does **not** install
`magda-auth-internal` a second time. Ensure the internal plugin is enabled and
Gateway discovers it as part of the rendered umbrella deployment.

The profile sets `tags.all: false` and allowlists the components it needs.
Helm enables a chart when **any** of its tags is true, so `all: true` cannot be
narrowed by setting individual component tags to `false`. The allowlist keeps
the core services, dataset search (used by the `mgd` read checks) and the
internal auth plugin, and leaves connectors, minions, URL processors,
semantic indexers and the other auth plugins disabled.

When converting an existing pre-release development cluster to this profile:

- `helm uninstall` any separately installed `magda-auth-internal` release
  first; the umbrella now owns that workload.
- Reset an Authorization DB that applied the earlier unreleased
  `V2_4__agent_skills.sql`/`V2_5__agent_workspace_access.sql` migrations.
  They are replaced by `V2_4__agent_workspace_and_skills.sql`, and Flyway
  rejects the changed `2.4` checksum. Pre-release state is not migrated.

The supplied values expect local `localhost:5000/*:latest` images loaded into
Minikube. For each required local image:

```sh
minikube -p <profile> image load localhost:5000/<image>:latest
```

Create the Sandbox namespace and trust the local ingress certificate:

```sh
kubectl create namespace magda-agent --dry-run=client -o yaml | kubectl apply -f -
INGRESS_IP=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.spec.clusterIP}')
kubectl -n ingress-nginx get secret magda-test-tls \
  -o jsonpath='{.data.tls\.crt}' | base64 --decode >/tmp/magda-agent-ca.crt
kubectl -n magda-agent create secret generic magda-agent-trusted-ca \
  --from-file=ca.crt=/tmp/magda-agent-ca.crt \
  --dry-run=client -o yaml | kubectl apply -f -
```

If the Ingress uses its controller's default TLS certificate, ensure it serves
this same certificate before proceeding; otherwise explicitly configure the
Ingress TLS Secret in the Magda release namespace. A copied certificate is not
trustworthy when the controller still serves its generated fake certificate.

Generate the cluster-specific override using the **umbrella nesting**. Do not
commit the ephemeral Service IP:

```sh
cat >/tmp/agent-workspace-ingress-values.yaml <<EOF
magda:
  magda-core:
    agent-services:
      runtime:
        hostAliases:
          - ip: ${INGRESS_IP}
            hostnames: [magda.test]
        externalPrivateCidrs: [${INGRESS_IP}/32]
        externalPrivatePorts: [443]
EOF
```

Refresh all vendored local chart dependencies, including the internal charts'
own dependencies, from the repository root, then deploy the local umbrella.
Running only `helm dependency update` on `magda-core`, `magda` and
`local-deployment` is not sufficient on a fresh checkout:

```sh
helm repo add magda-io https://charts.magda.io
yarn update-all-charts
helm upgrade --install magda deploy/helm/local-deployment \
  --namespace magda --create-namespace \
  -f deploy/helm/agent-workspace-minikube.yml \
  -f /tmp/agent-workspace-ingress-values.yaml \
  --timeout 15m --wait
```

Use the browser at `https://magda.test:18443` after configuring your local
ingress port mapping and hosts entry. Verify `/auth/plugins` lists the internal
plugin as part of the same release. Do not install it separately over the
umbrella-owned workload. See the [E2E test procedure](./e2e-test-cases/agent-workspace.md)
for browser, runc/gVisor, lifecycle, skills, TLS and access-control checks.

For a standalone `magda-core` deployment or a custom parent chart, use values
with the corresponding chart hierarchy instead; this Minikube overlay is not
automatically portable to those charts.

### Production deployment

Use the same values through the normal Magda umbrella or deployment repository,
with these differences:

- publish versioned images and configure the standard global image registry and
  pull secrets;
- use a real external hostname and trusted TLS certificate;
- omit local `hostAliases` when cluster DNS resolves the external name, while
  retaining the required NetworkPolicy destination;
- provision `litellm-provider` through the platform secret manager;
- select a qualified gVisor or Kata RuntimeClass and size the one selected warm
  pool and its PVCs (`runc` is trusted local-development only);
- set permanent-delete and idle-suspension inactivity values for the
  organisation's policy;
- include the Authorization DB migration before starting the updated
  Authorization API; and
- retain `global.agentWorkspace.enabled=false` until all dependencies, secrets,
  and security qualification checks are ready.

### GKE alpha reference profile

The GKE work in [PR #3852](https://github.com/magda-io/magda/pull/3852)
provides real interoperability evidence for GKE Standard, a dedicated GKE
Sandbox/gVisor node pool, KAS v1.0.4, a regional L4 passthrough NLB terminating
TLS at community ingress-nginx, HTTPS/WSS, and PD CSI provision/remount/reclaim.
It also found the CSI ownership issue addressed by
`fsGroupChangePolicy: OnRootMismatch`.

It did **not** qualify the integrated Magda Gateway/auth/logout path, real
LiteLLM/provider access, effective GKE NetworkPolicy enforcement, Workload
Identity isolation, warm pools greater than zero, multiple users, HA,
multi-zone operation, node upgrades, cert-manager, or native GCE L7/Gateway API.
The supplied [`deploy/helm/agent-workspace-gke-magda-core.yml`](../../deploy/helm/agent-workspace-gke-magda-core.yml) is therefore an **alpha reference
profile**, not a qualified production profile. Do not claim GKE production or
security qualification until the functional gates below pass.

#### Cluster and gVisor prerequisites

Use GKE Standard with NetworkPolicy enforcement provided by **GKE Dataplane V2**
(preferably selected at cluster creation with `--enable-dataplane-v2`) or a
separately qualified Calico configuration. Create a dedicated, non-default
COS_CONTAINERD node pool with `--sandbox type=gvisor`; production Sandbox nodes
must not be Spot/preemptible. Keep ordinary system workloads on a non-Sandbox
pool. Verify the GKE-managed `gvisor` RuntimeClass and its
`sandbox.gke.io/runtime=gvisor` scheduling requirements:

```sh
gcloud container clusters describe "$CLUSTER" --location "$LOCATION" \
  --format='yaml(datapathProvider,networkPolicy,workloadIdentityConfig)'
gcloud container node-pools list --cluster "$CLUSTER" --location "$LOCATION"
kubectl get runtimeclass gvisor -o yaml
kubectl get apiservice | grep agents.x-k8s.io
```

KAS v1.0.4 remains an external prerequisite. `pods/exec` must work because Agent
Manager uses it for the one-time launch-token/bootstrap hand-off. GKE gVisor does
not support `kubectl port-forward`, but this architecture does not depend on it.
Published runtime images must include amd64 and be pullable from Artifact
Registry by the nodes or configured image pull secrets.

#### NetworkPolicy is a hard functional prerequisite

Creating or listing NetworkPolicy objects does **not** demonstrate enforcement.
The #3852 cluster accepted KAS-managed policies while an unauthorized Pod could
reach DSH and the Sandbox could reach private services and the control-plane
endpoint. The Helm KAS preflight intentionally checks APIs and RuntimeClass only;
it cannot prove dataplane behavior.

Before enabling Agent Workspace for untrusted workloads, run a disposable traffic
matrix and retain the evidence:

1. confirm Agent Manager can reach the claimed Sandbox Service on TCP 3080;
2. confirm ordinary probe Pods in both the Magda and Sandbox namespaces, without
   the allowed labels, time out when connecting to Sandbox TCP 3080;
3. from the Sandbox, confirm kube-dns, the configured external Magda HTTPS
   endpoint, and an approved public HTTPS endpoint work;
4. from the Sandbox, confirm direct Agent Manager, Registry, Authorization,
   PostgreSQL and other Sandbox ClusterIPs, every private or public
   Kubernetes/control-plane endpoint, and `169.254.169.254` time out; public
   control-plane addresses must be added as exact `/32` entries in
   `agent-services.runtime.deniedCidrs`;
5. repeat after suspend/resume and Sandbox Pod replacement.

Any forbidden successful connection fails qualification. If enforcement cannot be
verified, leave Agent Workspace disabled. The authoritative intended matrix is in
`agent-services/templates/runtime.yaml`; the executable procedure is in the
Agent Workspace end-to-end test document.

#### Sandbox Kubernetes and Google Cloud identity

Every Sandbox Pod uses a dedicated installation-scoped Kubernetes ServiceAccount
in the Sandbox namespace. It has no RoleBinding or ClusterRoleBinding, no Google
IAM binding, and `automountServiceAccountToken: false`. Agent Manager has a
separate KSA and Kubernetes RBAC; never reuse that identity for a Sandbox.

On GKE, `automountServiceAccountToken: false` prevents a projected Kubernetes
credential but does **not** make the GKE metadata server inaccessible. PR #3852
received HTTP 200 from the Workload Identity token endpoint; obtaining a token
alone does not prove that the identity has useful IAM permissions. Operators must:

- inspect the Pod `serviceAccountName` and KSA annotations and confirm Kubernetes
  API authorization is denied;
- audit direct IAM bindings for the Sandbox KSA and broader Workload Identity
  Federation grants to namespace or pool-wide `principalSet` principals;
- grant neither `roles/iam.workloadIdentityUser` nor Google resource roles to the
  Sandbox identity by default; and
- identify the metadata identity, audit its effective permissions, and verify
  access to unrelated Google Cloud resources is denied.

Metadata-server blocking through NetworkPolicy remains unverified until tested on
an enforcing GKE dataplane. If the identity has unintended permissions or the
required isolation cannot be established, do not enable Agent Workspace.

#### ingress-nginx, IngressClass and external NLB

Install the controller separately with a unique class and verify ownership:

```yaml
controller:
  ingressClass: magda-agent-nginx
  ingressClassResource:
    name: magda-agent-nginx
    controllerValue: k8s.io/ingress-nginx
  service:
    type: LoadBalancer
    externalTrafficPolicy: Local
    annotations:
      cloud.google.com/l4-rbs: "enabled"
    loadBalancerSourceRanges: ["<approved-cidr>"]
```

```sh
kubectl get ingressclass magda-agent-nginx \
  -o jsonpath='{.spec.controller}{"\n"}'
```

The result must be `k8s.io/ingress-nginx`. Do not assume a class named `nginx` is
community ingress-nginx: the #3852 cluster's class with that name belonged to the
F5 controller (`nginx.org/ingress-controller`), which does not consume community
annotations. Set `cloud.google.com/l4-rbs: enabled` when creating the controller
Service; adding it later does not migrate a legacy target-pool load balancer.

Verify in GCP that the external forwarding rule is regional EXTERNAL TCP on ports
80/443, targets a regional TCP backend service using GCE_VM_IP NEGs, and has no
URL map or target HTTP(S) proxy. TLS terminates in ingress-nginx. Native GCE L7
Ingress/BackendConfig and Gateway API remain outside this alpha profile.

Set `ingress.proxyReadTimeout` and `proxySendTimeout` to 3600. The NLB has no HTTP
timeout, but nginx defaults close quiet sockets after about 60 seconds. Test a
quiet socket beyond 60 seconds and the selected operational window, streaming,
and browser reconnect after Gateway/Manager restart. A controller config reload
can close existing sockets at `worker-shutdown-timeout` (240 seconds by default)
without a WebSocket close frame; DSH must reconnect. Shared-controller changes
can therefore interrupt sessions.

> **Controller lifecycle warning:** community ingress-nginx v1.15.1/chart 4.15.1
> was its final release in March 2026 and receives no future fixes. Its GKE PoC
> evidence remains useful only as a frozen alpha path. New production adoption
> requires explicit risk acceptance and a time-bound migration plan. Any
> successor controller requires fresh WSS, timeout, reload, and NetworkPolicy
> qualification; F5 NGINX is not a drop-in replacement.

#### Persistent storage

The tested GKE profile explicitly selects `standard-rwo`: PD CSI
(`pd.csi.storage.gke.io`), ReadWriteOnce, `WaitForFirstConsumer`, and reclaim
policy `Delete`. Zonal PD pins the Sandbox to one zone; regional/multi-zone
storage, capacity, performance, and backup policy remain operator decisions and
are not qualified. Workspaces remain temporary.

Verify a marker file, DSH session, and credential mode before and after
suspend/resume and Pod deletion. The same PVC must survive and the credential
must remain mode 0600. Deleting the claim must remove Sandbox, Pod, Service, PVC,
PV, and GCE disk. A StorageClass with reclaim policy `Retain` requires explicit
operator cleanup and does not satisfy the automatic deletion claim.

### Basic smoke verification

After deployment:

```sh
kubectl -n magda rollout status deploy/agent-manager
kubectl -n magda rollout status deploy/llm-services
kubectl -n magda rollout status deploy/litellm
kubectl -n magda-agent get sandboxclaims,sandboxes,pods
```

Log in as an administrator or a user with **Agent Workspace Users**, open
**Settings → Agent Workspace**, start the
workspace, and wait for `READY`. Verify the managed DSH UI, a real model/tool
response through `/api/v0/llm/v1/responses`, `mgd auth status`, a Registry read,
and destructive cleanup of the claim and managed key.

This smoke test is not a GKE security qualification. The full lifecycle test and
mandatory GKE qualification gate—including gVisor, positive/negative networking,
KSA/IAM/metadata, NLB shape, WSS reload/reconnect, CSI lifecycle/reclaim and
cleanup evidence—is in `docs/docs/e2e-test-cases/agent-workspace.md`.

## Operational notes

- Agent Runtime is a versioned workspace package. The normal Docker CI publishes
  both amd64 and arm64 manifests and the release retag/push path copies
  `magda-agent-runtime` alongside other Magda images. DSH remains pinned to the
  qualified runtime version in the Dockerfile.
- A same-tag local runtime image does not replace existing warm Sandboxes. Delete
  only the unclaimed warm Sandbox and wait for its replacement before resetting a
  test workspace onto a rebuilt image.
- LiteLLM configuration changes require a Pod restart unless the deployment
  template checksum changes.
- A `runAsNonRoot` image must declare a numeric UID. Agent Manager and LLM
  Services use UID 1000; Agent Runtime uses UID/GID 10001. Its Pod security
  context sets `fsGroupChangePolicy: OnRootMismatch`; this is required on GKE PD
  CSI and similar volumes so remounts do not broaden DSH's mode-0600 credential
  file and break resume or Pod replacement.
- Local GPT-5.6 Sol use required a 1 GiB LiteLLM memory limit during qualification.
- Reset and logout are destructive by design. Publish important outputs to Magda
  or another durable store first.
