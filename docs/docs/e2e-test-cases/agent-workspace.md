# Agent Workspace End-to-End Test

## Purpose

Verify the integrated Agent Workspace path through a real Minikube deployment,
then apply the separate GKE alpha security-qualification extension where relevant:

```text
browser -> ingress -> gateway -> Agent Manager -> Agent Sandbox -> DSH Web
DSH / mgd -> external gateway -> Magda APIs / Magda LLM Services -> LiteLLM
```

This case covers the user-visible lifecycle, the trusted-header boundary, stock
DSH launch-token hand-off, persistent workspace behavior and both local runtime
profiles. See [Agent Workspace architecture and deployment](../architecture/agent-workspace.md)
for implementation details, key decisions, configuration, and deployment steps.

## Prerequisites

- Minikube with the `ingress` addon and enough memory for Magda plus a DSH
  sandbox.
- Kubernetes Agent Sandbox **v1.0.4** (the qualified version):

  ```sh
  kubectl apply --server-side -f \
    https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v1.0.4/sandbox-with-extensions.yaml
  kubectl -n agent-sandbox-system rollout status deploy --timeout=300s
  ```

- The local Agent Manager, LLM Services and Agent Runtime images built and
  loaded into Minikube. Reset any workspace created by an earlier development
  image before qualification: bootstrap configuration is PVC-backed and an
  existing claim is not reprovisioned by a Helm upgrade.
- `global.agentWorkspace.enabled=true` in the Magda Helm values. For a local
  self-signed ingress, route the in-Sandbox API URL through the ingress service
  and copy its CA into the Sandbox namespace before installing:

  ```sh
  INGRESS_IP=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
    -o jsonpath='{.spec.clusterIP}')
  kubectl create namespace magda-agent --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n ingress-nginx get secret magda-test-tls \
    -o jsonpath='{.data.tls\.crt}' | base64 --decode >/tmp/magda-agent-ca.crt
  kubectl -n magda-agent create secret generic magda-agent-trusted-ca \
    --from-file=ca.crt=/tmp/magda-agent-ca.crt --dry-run=client -o yaml | kubectl apply -f -
  ```

  The certificate copied into the Sandbox must also be the certificate served
  by the ingress Service. When the local Ingress omits `tls.secretName`, make
  `magda-test-tls` the ingress-nginx default certificate (add the argument only
  once), then wait for the controller rollout:

  ```sh
  kubectl -n ingress-nginx get deploy ingress-nginx-controller \
    -o jsonpath='{.spec.template.spec.containers[0].args}' | \
    grep -- '--default-ssl-certificate=ingress-nginx/magda-test-tls' || \
    kubectl -n ingress-nginx patch deploy ingress-nginx-controller --type=json \
      -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--default-ssl-certificate=ingress-nginx/magda-test-tls"}]'
  kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller
  ```

  Alternatively, set the Ingress `tls.secretName`, with the TLS Secret in the
  same namespace as the Ingress. Do not trust a copied certificate while the
  controller is still serving its generated fake certificate.

  Generate the cluster-specific Helm override (do not commit the ephemeral
  Service IP) and pass it after `agent-workspace-minikube-values.yaml`:

  ```sh
  cat >/tmp/agent-workspace-ingress-values.yaml <<EOF
  agent-services:
    runtime:
      hostAliases:
        - ip: ${INGRESS_IP}
          hostnames: [magda.test]
      externalPrivateCidrs: [${INGRESS_IP}/32]
      externalPrivatePorts: [443]
  EOF
  ```

  The committed local values set
  `agent-services.sandboxNamespace.create=false` because this procedure
  pre-creates the namespace. They also set the in-Sandbox API URLs and select
  `magda-agent-trusted-ca` with `agent-services.runtime.trustedCaSecret`.

- An admin login. `magda-auth-internal` is not a `magda-core` dependency; install
  it as a separate release or include it in an umbrella chart if password login
  is desired.
- For a real model response, create the provider secret before deployment:

  ```sh
  kubectl -n <magda-namespace> create secret generic litellm-provider \
    --from-literal=api-key="$OPENAI_API_KEY"
  ```

  Without this secret, the lifecycle and DSH paths remain testable and LLM calls
  should return a useful provider-credential error.

## Browser journey

1. Log in as an administrator and open **Settings -> Agent Workspace**.
2. Confirm the introduction states one workspace per user, user authority,
   suspend/resume behavior, temporary-file durability, and destructive
   reset/logout behavior.
3. Select **Start Agent Workspace**. Observe `ALLOCATING`, then
   `BOOTSTRAPPING`, then the embedded stock DSH UI (`READY`). Kubernetes names
   and addresses must not appear in the UI. The destructive replacement button
   must be labelled **Start New Workspace**.
4. Confirm the native DSH sidebar is visible and branded **Agent Workspace** and
   the same **M** mark appears beside the empty-chat **Agent Workspace** heading.
   New Session, the session history, Search, rename, and collapse/expand must
   work. Automation tasks, Plugins, Settings, Workspace View Options, Add
   Workspace, Delete workspace, and the redundant workspace chooser must be
   absent. Feedback, Permission, and Model composer commands,
   provider/model/plugin management, and persistent `danger-full-access` must
   remain unavailable.
5. Create Session A and complete a distinctive prompt. Create Session B and
   complete a different prompt. Switch between A and B and confirm both
   histories remain. Rename one Session, search for it using DSH's native
   Session terminology, and open the search result.
6. Confirm new sessions use `workspace-write`, sandbox mode `workspace-write`,
   and approval policy `ask`. Ask the agent to run `mgd auth status` and a
   representative read such as a dataset search. The call must go through the
   external Magda endpoint using the lifecycle-bound user API key.
7. Ask for a throwaway dataset mutation. The bundled `mgd` guidance must ask for
   explicit confirmation before executing it. Confirm, verify the result, then
   clean it up.
8. Send a tool-using prompt that produces a streamed model response. Confirm a
   reasoning model follows `/api/v0/llm/v1/responses` (Chat Completions remains
   available for compatible models), the DSH model catalog reports the Helm-set alias, `contextWindow`, and
   `maxTokens`, and no provider credential appears in the browser or Sandbox.
   Verify the default `reasoningEffort: medium` reaches both DSH and LiteLLM.
   Repeat with `reasoningEffort: ""` and verify neither configures a reasoning
   effort while the provider request still succeeds.

## Lifecycle and security checks

Run each check while watching the Settings page and Kubernetes resources:

- Record the claim, PVC, and managed-key IDs, create both Sessions, then refresh
  the browser. Confirm both histories remain available and no resource ID changes.
  From the Sandbox, confirm DSH state is under `/data/agent-home` and its default
  working tree is `/data/workspace/agent-harness/default-workspace`. A fresh PVC
  must not contain the former `dsh-home` or `deepseek-harness` paths.
- Delete the DSH Pod. Confirm DSH restarts against the same PVC, the browser
  reconnects, and both Sessions remain available.
- Patch the bound Sandbox to `spec.operatingMode: Suspended`, confirm the UI
  offers Resume, resume it, and verify both Sessions and shared files remain on
  the same PVC.
- Create another Session and confirm it does not rotate the managed API key or
  create another SandboxClaim/PVC.
- Navigate among Sessions, refresh, and collapse/expand the sidebar; all managed
  hidden controls must remain absent. Verify normal desktop and narrow browser
  widths without iframe overflow or clipping.
- Set the selected warm pool to one replica before starting a second test user.
  Confirm claim adoption uses `claim.status.sandbox.name` and the pool creates a
  fresh replacement.
- Reset the workspace. Confirm all previous DSH Sessions and files plus the old
  claim, Sandbox, Pod, Service, PVC and reserved managed API key are deleted; a
  fresh generation/key/PVC is created. Repeat with Terminate and confirm the
  workspace reaches `ABSENT` without replacement.
- Leave a DSH WebSocket open without user input for more than the configured idle
  interval. Confirm protocol ping/pong and an idle Remote stream do not renew
  activity and the workspace suspends. Keep the Settings page open: within one
  status-poll interval it must remove the stale runtime iframe and show **Resume
  Agent Workspace**, rather than allowing a prompt to fail with HTTP 409.
- Run a foreground Agent turn across the configured idle-suspension threshold.
  Confirm `api-session/status` keeps the workspace `READY` until the turn settles,
  then confirm its idle clock resumes.
- Send real mutating runtime interactions across an accelerated lifecycle window.
  Confirm each renews the persisted claim deadline and managed API-key expiry,
  allowing continued activity beyond the original eight-hour deadline.
- Inject one transient Kubernetes patch failure and one Authorization API key
  extension failure. Confirm the next interaction retries, an older/concurrent
  request cannot shorten the newer deadline, and a partial claim-first update is
  repaired without shortening either value.
- Inject an Authorization API key-revocation failure during both Terminate and
  Reset. Confirm the claim remains `DELETING` with key identity intact; restore
  the dependency and confirm reconciliation completes key, claim, and PVC
  cleanup. Terminate must finish `ABSENT`; Reset must preserve its intent and
  provision one fresh replacement workspace. Overlap two reconciliation passes
  and confirm only one replacement is created; issue Terminate during recovery
  and confirm the replacement is cancelled and the final state is `ABSENT`.
  Fail the Reset-intent annotation patch and confirm Terminate is rejected rather
  than acknowledged; after a successful retry and Manager restart, confirm no
  replacement is provisioned.
- Delay a successful `session/list` response until after closing the last DSH
  WebSocket. Also let an older running response arrive while a newer request is
  pending, then complete the newer request with an empty response; repeat with
  the older response arriving after the newer success and after
  disconnect/reconnect. Confirm none of the stale responses renews activity or
  prevents idle suspension. Fail a newer request after the older valid response
  is buffered and confirm that baseline is then accepted. While one valid socket survives, add and remove a second socket and
  confirm its churn does not discard the valid baseline.
- Restart Agent Manager after that partial update. Confirm reconciliation uses the
  persisted activity timestamp to repair key expiry. Resume a suspended workspace
  and verify the deadline renews.
- Advance inactivity beyond the accelerated hard-delete interval. Confirm the
  claim, Sandbox, Pod, Service, PVC, and managed API key are removed.
- Open a DSH WebSocket and log out. Confirm the socket closes promptly and all
  workspace resources and the managed API key are deleted before logout
  completes.
- Log in as a non-admin. Confirm the navigation item is hidden and direct Agent
  Manager and LLM requests return 403.
- In a disposable cluster without KAS, attempt an enabled Helm install and confirm
  the pre-install hook fails with the missing KAS v1beta1 API message before
  normal Agent resources are installed.
- Render/install two releases with a shared explicit Sandbox namespace. Confirm
  installation labels, claim names, selectors, warm pools, Sandbox
  ServiceAccounts, RBAC, and managed API-key names differ. Confirm each
  SandboxTemplate explicitly references its own no-RBAC/no-IAM ServiceAccount and
  that one Manager cannot list or delete the other's claims.
- For an upgrade fixture from the old split charts, reset all legacy workspaces
  before upgrade and verify the legacy unscoped claims, user PVCs, and
  `magda-agent-workspace` keys are gone. Confirm the merged chart does not adopt
  an intentionally retained unscoped test claim.
- Inspect Agent Manager RBAC: it must include `pods/exec` but not `pods/log`.
- Inspect DSH requests at the Sandbox boundary: `X-Magda-Session`, browser
  cookies, `Authorization`, proxy authorization, and Magda API-key headers must
  be absent; `Host` must be the configured external authority.
- Confirm the launch-token file is on the memory `emptyDir`, mode 0600, is read
  with `pods/exec`, and neither token nor DSH cookie reaches browser responses or
  Pod logs.

Repeat the core browser, `mgd`, LLM streaming, refresh and reset journey with:

1. `agent-services.warmPool.type=runc`; and
2. `agent-services.warmPool.type=gvisor` with the Minikube gVisor RuntimeClass
   installed.

Each render must contain exactly one SandboxTemplate and one matching
SandboxWarmPool. Kata is covered by the offline Helm render matrix; run the full
journey on a Kata-capable cluster when qualifying that production runtime.

## Agent Skill synchronization checks

Publish one system skill and one current-user skill, then:

- **Fresh Workspace:** start a Workspace with no existing claim. Agent Manager
  logs a single `mgd agent-skill sync --force --json --workspace-status` exec;
  the claim reaches READY independently and its `agent.magda.io/skill-sync-*`
  annotations record `success` with two installs. In the Sandbox, both
  `/data/agent-home/skills/<name>/` entries are real directories containing
  `.magda-skill-install.json`, and `$XDG_DATA_HOME/mgd/agent-skills/` (on
  `/data`) holds `installation-index.json` and `sources/<key>/`.
- **Existing Workspace:** edit the user skill's `SKILL.md`, restart Agent
  Manager (or reset the claim's sync status to `notAttempted`). The recovery
  sync is non-forced: status becomes `partial`, the edit survives, READY and the
  DSH iframe stay available.
- **Manual Sandbox CLI:** delete a skill directory and corrupt the other's
  marker, then run `mgd agent-skill sync --json`: the deleted skill is
  reinstalled and the marker repaired without `--force`. With an edited copy,
  ordinary sync reports `LOCAL_MODIFICATION` with the exact path and changes
  nothing; `mgd agent-skill sync --force --json` resets it. Neither manual run
  changes the claim's Manager-owned sync annotations.
- **No Python:** run `mgd agent-skill sync --json` with `PATH` containing only
  `node` and `mgd`; it succeeds.
- **Outage:** with the API unreachable, both forms report `failed` and the
  installed tree is byte-for-byte unchanged.
- **DSH discovery:** instantiate the pinned
  `@deepseek-ai/dsh-skill-filesystem` provider in the Sandbox and list skills;
  exactly the synchronized names (plus image-bundled ones) appear, with no entry
  for the marker or `.magda-skill-staging/`.
- **Status isolation:** a local-computer `mgd agent-skill sync` against the
  same user never changes any claim annotation.

## Minikube gVisor troubleshooting

If the Settings page remains at **Allocating your Agent Workspace**, inspect the
Sandbox Pod before resetting the claim or PVC:

```sh
kubectl -n magda-agent get sandboxclaims,sandboxes,pods,pvc
kubectl -n magda-agent describe pod <sandbox-pod>
```

On ARM64 Minikube, some gVisor addon versions still download the legacy
standalone `runsc` and `containerd-shim-runsc-v1` release files. gVisor now
publishes a release archive containing those binaries and their required
`gvisor-bin` sidecars. A failed legacy download can leave a small XML
`NoSuchKey` response installed as each executable. Sandbox events then repeat
`fork/exec ... containerd-shim-runsc-v1: exec format error` and the UI remains
in `ALLOCATING`.

Confirm the node architecture and installed runtime before changing workspace
resources:

```sh
PROFILE=<minikube-profile>
minikube ssh -p "$PROFILE" -- uname -m
minikube ssh -p "$PROFILE" -- 'sudo /usr/bin/runsc --version'
minikube ssh -p "$PROFILE" -- \
  "sudo grep -c 'containerd.runtimes.runsc' /etc/containerd/config.toml"
```

Recover a disposable local cluster as follows:

1. Disable the broken Minikube gVisor installer so a restart cannot overwrite
   the repair. This removes its managed `RuntimeClass`, so recreate that object
   after installing the runtime.
2. Follow the current [gVisor installation guide](https://gvisor.dev/docs/user_guide/install/)
   to download the checksum-verified release archive for the exact architecture.
   Install `runsc`, `containerd-shim-runsc-v1`, and the complete sibling
   `gvisor-bin` directory together on the Minikube node.
3. Keep exactly one `runsc` containerd runtime stanza, restart containerd and
   kubelet, then recreate `RuntimeClass/gvisor` with handler `runsc`. Repeated
   addon runs can append a duplicate TOML table and prevent containerd from
   starting.
4. Confirm the live `SandboxTemplate` uses the intended locally loaded runtime
   image and pull policy. A stale template that points at an unavailable
   registry tag produces `ImagePullBackOff` after the runtime itself is fixed:

   ```sh
   kubectl -n magda-agent get sandboxtemplate -o jsonpath=\
   '{range .items[*]}{.metadata.name}{"\t"}{.spec.podTemplate.spec.containers[0].image}{"\t"}{.spec.podTemplate.spec.containers[0].imagePullPolicy}{"\n"}{end}'
   ```

5. Recycle only unclaimed warm-pool Sandboxes so the controller copies the
   repaired template. Do not delete a bound user claim or PVC unless the test
   explicitly calls for a destructive workspace reset. Refresh the Settings
   page if an earlier allocation already timed out, then start the workspace
   again and require the claim, Sandbox, Pod, runtime proxy, and embedded DSH UI
   all to become ready.

For local lifecycle testing where gVisor itself is not under qualification, use
`agent-services.warmPool.type=runc` instead of weakening the Sandbox security
context or bypassing readiness checks.

### Model turns fail with `Connection error`

If DSH loads but every prompt retries five times and ends with **This turn
failed — Connection error**, test the model path from the bound Sandbox. The
browser and runtime proxy can be healthy while the Sandbox cannot reach or
trust the LLM gateway.

```sh
POD=$(kubectl -n magda-agent get pod \
  -l agents.x-k8s.io/claim-uid -o jsonpath='{.items[0].metadata.name}')
kubectl -n magda-agent exec "$POD" -- getent hosts magda.test
kubectl -n magda-agent exec "$POD" -- node -e \
  'fetch(process.env.MAGDA_LLM_BASE_URL + "/models").then(async r => console.log(r.status, await r.text())).catch(e => { console.error(e); process.exit(1) })'
```

Expected local results are the ingress Service IP for `magda.test` and HTTP
`401 Magda authentication required`; that response proves DNS routing and TLS
trust work before DSH adds its lifecycle-bound credential. Interpret failures as
follows:

- `127.0.0.1` or connection refused: the live Sandbox lacks the cluster-specific
  `runtime.hostAliases`, or `MAGDA_LLM_BASE_URL` incorrectly contains the
  host-only Minikube port such as `:18443`. Keep `DSH_PUBLIC_URL` browser-facing,
  but set `agent-services.llmApiUrl` to the in-cluster ingress URL on port 443.
- `self-signed certificate`: `runtime.trustedCaSecret` is absent/stale, or
  ingress-nginx is serving its generated fake certificate instead of the
  certificate copied into that Secret. Compare SHA-256 fingerprints and configure
  the controller default certificate or an Ingress `tls.secretName`.
- HTTP 401: transport is repaired. A subsequent DSH turn should authenticate;
  inspect LLM Services and LiteLLM only if it still fails.

`SandboxTemplate` changes affect newly created Sandboxes, not a running Pod.
Recycle only an unclaimed warm-pool Sandbox. For a bound local test workspace,
copy the repaired template's `spec.podTemplate` to its Sandbox and suspend/resume
that Sandbox so Kubernetes recreates the Pod while retaining the claim and PVC.
Do not delete the claim or PVC merely to apply network/TLS configuration. A
Sandbox restart also invalidates the Agent Manager's cached DSH cookie, so reload
the page; if WebSocket reconnects return HTTP 409, restart Agent Manager and
reload once more.

## GKE alpha qualification extension

The checks below are a mandatory gate in addition to the Minikube journey. They
adapt the real GKE findings from [PR #3852](https://github.com/magda-io/magda/pull/3852).
Do not mark GKE qualified if any prerequisite is unavailable or any negative
connectivity test succeeds.

### Inventory

Record cluster version/location, datapath provider and NetworkPolicy setting,
Workload Identity pool, gVisor node-pool configuration, RuntimeClass, KAS version,
ingress controller/chart, IngressClass controller string, StorageClass and CSI
driver. Confirm Sandbox Pods land on the dedicated non-Spot gVisor pool and report
the gVisor kernel/runtime evidence.

```sh
gcloud container clusters describe "$CLUSTER" --location "$LOCATION" \
  --format='yaml(currentMasterVersion,datapathProvider,networkPolicy,workloadIdentityConfig)'
gcloud container node-pools describe "$POOL" --cluster "$CLUSTER" \
  --location "$LOCATION" --format=yaml
kubectl get runtimeclass gvisor -o yaml
kubectl get ingressclass "$INGRESS_CLASS" -o jsonpath='{.spec.controller}{"\n"}'
kubectl get storageclass "$STORAGE_CLASS" -o yaml
```

The IngressClass controller must be `k8s.io/ingress-nginx` for the alpha reference
path. A class owned by `nginx.org/ingress-controller` is F5 NGINX and is not a
compatible substitute.

### L4 NLB shape

Verify that the controller Service was created with
`cloud.google.com/l4-rbs: enabled`, `externalTrafficPolicy: Local`, approved
source ranges, and ports 80/443. At the GCP level, require a regional EXTERNAL TCP
forwarding rule targeting a regional TCP backend service using GCE_VM_IP NEGs.
There must be no URL map or target HTTP(S) proxy. Discover the rule from the
controller Service address and archive the complete resource chain:

```sh
NLB_IP=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
gcloud compute forwarding-rules list \
  --filter="IPAddress=$NLB_IP" \
  --format='table(name,region.basename(),IPAddress,IPProtocol,ports,target,backendService)'
# Set these from the preceding output.
FR=<forwarding-rule>; REGION=<region>
gcloud compute forwarding-rules describe "$FR" --region "$REGION" --format=yaml
BACKEND=$(gcloud compute forwarding-rules describe "$FR" --region "$REGION" \
  --format='value(backendService.basename())')
gcloud compute backend-services describe "$BACKEND" --region "$REGION" --format=yaml
gcloud compute network-endpoint-groups list --filter="region:($REGION)" --format=yaml
gcloud compute health-checks list --filter="region:($REGION)" --format=yaml
gcloud compute firewall-rules list --format=yaml
gcloud compute url-maps list --format=yaml
gcloud compute target-http-proxies list --format=yaml
gcloud compute target-https-proxies list --format=yaml
```

The forwarding rule's `backendService` must be populated and `target` empty. The
backend must be regional, protocol TCP, balancing mode CONNECTION, with GCE_VM_IP
NEGs. Demonstrate that no listed URL map or target proxy references this address
or backend.

### Functional NetworkPolicy matrix

Use disposable probe Pods with unique labels and explicit timeouts. Record every
command and result. Resolve the claimed runtime first:

```sh
MAGDA_NS=magda
SANDBOX_NS=magda-agent
CLAIM=$(kubectl -n "$SANDBOX_NS" get sandboxclaim -o jsonpath='{.items[0].metadata.name}')
SANDBOX=$(kubectl -n "$SANDBOX_NS" get sandboxclaim "$CLAIM" -o jsonpath='{.status.sandbox.name}')
SANDBOX_FQDN="$SANDBOX.$SANDBOX_NS.svc.cluster.local"
MANAGER=$(kubectl -n "$MAGDA_NS" get pod -l app.kubernetes.io/name=magda-agent-manager -o jsonpath='{.items[0].metadata.name}')
```

The positive ingress probe uses Agent Manager's allowed identity:

```sh
kubectl -n "$MAGDA_NS" exec "$MANAGER" -- node -e '
const net=require("net");
const s=net.connect(3080,process.argv[1],()=>{console.log("connected");s.end()});
s.setTimeout(5000,()=>{console.error("timeout");process.exit(1)});
s.on("error",e=>{console.error(e.message);process.exit(1)})' "$SANDBOX_FQDN"
```

Run both unauthorized ingress probes. They must exit with `timeout`, not
`connected` or an immediate application response:

```sh
for ns in "$MAGDA_NS" "$SANDBOX_NS"; do
  kubectl -n "$ns" run "agent-deny-probe-$ns" --rm -i --restart=Never \
    --image=nicolaka/netshoot --labels=app=agent-deny-probe -- \
    sh -c "timeout 5 nc -vz $SANDBOX_FQDN 3080; test \$? -eq 124"
done
```

For egress, execute DNS and approved HTTPS checks in the claimed Sandbox, then
use a five-second `node:net` probe for every forbidden IP/FQDN and port. The
probe must time out; `connect` or an immediate protocol response fails the gate.
Include Registry, Authorization, PostgreSQL, Agent Manager, another Sandbox,
`169.254.169.254:80`, and every private **or public** Kubernetes control-plane
endpoint. Discover the latter and deny a public endpoint explicitly:

```sh
CONTROL_PLANE_IP=$(gcloud container clusters describe "$CLUSTER" \
  --location "$LOCATION" --format='value(endpoint)')
# For a public address, set before install/upgrade:
# --set "agent-services.runtime.deniedCidrs[0]=$CONTROL_PLANE_IP/32"

kubectl -n "$SANDBOX_NS" exec "$SANDBOX" -- node -e '
require("dns").lookup("kube-dns.kube-system.svc.cluster.local",e=>process.exit(e?1:0))'
kubectl -n "$SANDBOX_NS" exec "$SANDBOX" -- node -e '
fetch(process.argv[1]).then(r=>{console.log(r.status);process.exit(r.status>=500?1:0)})' \
  "https://<approved-public-endpoint>/"
kubectl -n "$SANDBOX_NS" exec "$SANDBOX" -- node -e '
const net=require("net");const s=net.connect(+process.argv[2],process.argv[1]);
let done=false;const finish=n=>{if(!done){done=true;s.destroy();process.exit(n)}};
s.on("connect",()=>finish(2));s.on("error",()=>finish(3));
setTimeout(()=>finish(0),5000)' "$CONTROL_PLANE_IP" 443
```

Build and execute the complete forbidden-target set. Replace the PostgreSQL
Service name if the deployment does not use the combined DB, and temporarily
size the warm pool to at least two so a second Sandbox exists:

```sh
AGENT_MANAGER_IP=$(kubectl -n "$MAGDA_NS" get svc agent-manager -o jsonpath='{.spec.clusterIP}')
REGISTRY_IP=$(kubectl -n "$MAGDA_NS" get svc registry-api -o jsonpath='{.spec.clusterIP}')
AUTH_IP=$(kubectl -n "$MAGDA_NS" get svc authorization-api -o jsonpath='{.spec.clusterIP}')
POSTGRES_SERVICE=combined-db-postgresql
POSTGRES_IP=$(kubectl -n "$MAGDA_NS" get svc "$POSTGRES_SERVICE" -o jsonpath='{.spec.clusterIP}')
OTHER_SANDBOX=$(kubectl -n "$SANDBOX_NS" get sandbox -o json | \
  jq -r --arg current "$SANDBOX" '.items[] | select(.metadata.name != $current) | .metadata.name' | head -1)
OTHER_SANDBOX_IP=$(kubectl -n "$SANDBOX_NS" get svc "$OTHER_SANDBOX" -o jsonpath='{.spec.clusterIP}')

for target in \
  "$AGENT_MANAGER_IP:80" "$REGISTRY_IP:80" "$AUTH_IP:80" \
  "$POSTGRES_IP:5432" "$OTHER_SANDBOX_IP:3080" \
  "169.254.169.254:80" "$CONTROL_PLANE_IP:443"; do
  host=${target%:*}; port=${target##*:}
  kubectl -n "$SANDBOX_NS" exec "$SANDBOX" -- node -e '
  const net=require("net");const s=net.connect(+process.argv[2],process.argv[1]);
  let done=false;const finish=n=>{if(!done){done=true;s.destroy();process.exit(n)}};
  s.on("connect",()=>finish(2));s.on("error",()=>finish(3));
  setTimeout(()=>finish(0),5000)' "$host" "$port" || exit 1
done

MAGDA_URL=https://<external-magda-host>
kubectl -n "$SANDBOX_NS" exec "$SANDBOX" -- node -e '
fetch(process.argv[1],{signal:AbortSignal.timeout(10000)}).then(r=>{
  console.log(r.status);process.exit(r.status>=500?1:0)
})' "$MAGDA_URL/"
```

Delete the disposable probe Pods (normally removed by `--rm`), restore the warm
pool size, then rerun this exact block after suspend/resume and after deleting the
claimed Sandbox Pod. Archive both repetitions.

| Direction                                                        | Test                     | Required result |
| ---------------------------------------------------------------- | ------------------------ | --------------- |
| Agent Manager → Sandbox Service TCP 3080                         | authorized runtime path  | connect         |
| ordinary Magda Pod → Sandbox TCP 3080                            | unauthorized ingress     | timeout         |
| ordinary Sandbox-namespace Pod → Sandbox TCP 3080                | unauthorized peer        | timeout         |
| Sandbox → kube-dns TCP/UDP 53                                    | DNS                      | connect/resolve |
| Sandbox → configured external Magda HTTPS                        | authorized API path      | connect         |
| Sandbox → approved public HTTPS                                  | authorized public egress | connect         |
| Sandbox → Agent Manager/Registry/Auth/Postgres ClusterIPs        | private services         | timeout         |
| Sandbox → every private/public Kubernetes control-plane endpoint | control plane            | timeout         |
| Sandbox → another Sandbox                                        | peer isolation           | timeout         |
| Sandbox → `169.254.169.254`                                      | metadata server          | timeout         |

Repeat the matrix after suspend/resume and Pod replacement. The presence of KAS
NetworkPolicy resources is not a pass condition; only observed traffic behavior
is. A cluster reproducing #3852's legacy-datapath result must keep Agent Workspace
disabled for untrusted workloads.

### KSA, Workload Identity and IAM

Confirm each Sandbox Pod references its installation-scoped Sandbox KSA, has
`automountServiceAccountToken: false`, and the KSA has no RoleBinding or
ClusterRoleBinding. Inspect KSA annotations and audit project/folder/resource IAM
for both direct principal bindings and broad Workload Identity Federation
`principalSet` grants covering the Sandbox namespace or workload pool. There must
be no `roles/iam.workloadIdentityUser` or Google resource role for this identity.
Use both Kubernetes authorization and Google IAM inventory rather than relying on
annotations alone:

```sh
KSA=$(kubectl -n "$SANDBOX_NS" get pod "$SANDBOX" -o jsonpath='{.spec.serviceAccountName}')
kubectl -n "$SANDBOX_NS" get sa "$KSA" -o yaml
kubectl auth can-i --list --as="system:serviceaccount:$SANDBOX_NS:$KSA"
kubectl get rolebinding,clusterrolebinding -A -o json >ksa-rbac.json

PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
POOL="$PROJECT_ID.svc.id.goog"
KSA_PRINCIPAL="principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/subject/ns/$SANDBOX_NS/sa/$KSA"
NS_SET="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/namespace/$SANDBOX_NS"
POOL_SET="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/*"
LEGACY_KSA="serviceAccount:$POOL[$SANDBOX_NS/$KSA]"

gcloud projects get-iam-policy "$PROJECT_ID" --format=json >project-iam.json
jq --arg p "$KSA_PRINCIPAL" --arg n "$NS_SET" --arg w "$POOL_SET" --arg l "$LEGACY_KSA" \
  '[.bindings[] | select(any(.members[]?; . == $p or . == $n or . == $w or . == $l))]' \
  project-iam.json
gcloud asset search-all-iam-policies --scope="projects/$PROJECT_ID" \
  --query="policy:$KSA OR policy:$SANDBOX_NS" --format=json

for folder in $(gcloud projects get-ancestors "$PROJECT_ID" \
  --filter='type=folder' --format='value(id)'); do
  gcloud resource-manager folders get-iam-policy "$folder" \
    --format=json >"folder-$folder-iam.json"
done
for organisation in $(gcloud projects get-ancestors "$PROJECT_ID" \
  --filter='type=organization' --format='value(id)'); do
  gcloud organizations get-iam-policy "$organisation" \
    --format=json >"organisation-$organisation-iam.json"
done
# Apply the same jq member filter to every saved policy, and query relevant
# Artifact Registry, Storage, Secret Manager, BigQuery and other resource IAM.
```

Every result must be reviewed; namespace-wide or pool-wide grants fail the gate
even when the dedicated KSA has no annotation. Save folder/organisation policy
queries alongside the project and resource-policy evidence.

Probe token mounting, Kubernetes API access, and the metadata token endpoint from
the Sandbox. Both network calls must time out; any HTTP response, including 401,
403 or a metadata token, fails isolation:

```sh
kubectl -n "$SANDBOX_NS" exec "$SANDBOX" -- sh -c \
  'test ! -e /var/run/secrets/kubernetes.io/serviceaccount/token'
kubectl -n "$SANDBOX_NS" exec "$SANDBOX" -- node -e '
fetch("https://kubernetes.default.svc/version",{
  signal:AbortSignal.timeout(5000)
}).then(r=>{console.error("unexpected HTTP",r.status);process.exit(2)}).catch(e=>{
  if(e.name!=="TimeoutError") { console.error(e); process.exit(3) }
})'
kubectl -n "$SANDBOX_NS" exec "$SANDBOX" -- node -e '
fetch("http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",{
  headers:{"Metadata-Flavor":"Google"},signal:AbortSignal.timeout(5000)
}).then(r=>{console.error("unexpected HTTP",r.status);process.exit(2)}).catch(e=>{
  if(e.name!=="TimeoutError") { console.error(e); process.exit(3) }
})'
```

If a diagnostic run receives a metadata token, record which identity it
represents and audit its effective permissions. A token response is not itself
proof of privilege, but it fails the metadata-isolation gate; automount being
false is not proof that metadata is inaccessible. Unrelated Google Cloud resource access must be denied,
and the profile remains unqualified until metadata access is blocked or an
explicitly qualified alternative identity-isolation policy is adopted.

### WebSocket and reload behavior

Verify rendered ingress annotations contain 3600-second read/send timeouts. Test:

1. a quiet DSH WebSocket beyond 60 seconds and beyond the chosen operational
   window;
2. a streamed model/tool turn;
3. browser reconnect after Gateway and Agent Manager restart; and
4. a controller configuration reload while a socket is open.

Community ingress-nginx can close the old worker's socket after its
`worker-shutdown-timeout` (240 seconds by default) without a WebSocket close
frame. The browser must reconnect and recover. Retain timing and reconnect
artifacts. The retired controller's alpha evidence cannot be inherited by a
successor without rerunning these tests.

### PD CSI and cleanup

With explicit `standard-rwo` (or a separately selected and qualified class),
verify its provisioner is `pd.csi.storage.gke.io`, volume binding is
`WaitForFirstConsumer`, access mode is RWO and reclaim policy is `Delete`.

Create a marker and record DSH credential mode 0600. Verify the same PVC, marker,
session and mode survive suspend/resume and Pod deletion. Then delete the claim
and require removal of Sandbox, Pod, Service, PVC, PV and GCE disk. A `Retain`
policy requires an explicit cleanup procedure and fails the automatic-reclaim
claim. Finally verify teardown leaves no test forwarding rule, backend, NEG,
health check, firewall rule, PD/PV, namespace, or temporary image repository.

Use an evidence table for sign-off:

| Command/test | Expected | Observed | Artifact | Pass/fail |
| ------------ | -------- | -------- | -------- | --------- |
| example      | timeout  |          |          |           |

## Expected result

All transitions are visible and recoverable, the same-origin DSH iframe and
`/api/remote.mux` WebSocket work through the gateway, persisted state survives
restart/suspend, destructive transitions remove credentials and storage, and
both backend services independently reject non-admin users.
