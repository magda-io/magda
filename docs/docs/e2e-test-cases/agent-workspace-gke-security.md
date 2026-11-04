# Agent Workspace GKE security qualification E2E

**Status:** Required qualification, **not** a claim of production readiness. [#3848](https://github.com/magda-io/magda/issues/3848) remains open. The merged Agent Workspace MVP supplies templates, but the original GKE PoC did not demonstrate enforcement of NetworkPolicy or effective metadata/IAM denial.

Use the [integrated Agent Workspace E2E](./agent-workspace.md) first to verify lifecycle, browser/DSH and model functionality on the deployed build; this extension is **provider-specific**. Read [security architecture](../architecture/agent-workspace-security.md) and the [GKE operator profile](../agent-workspace-deployment.md#gke-alpha-reference-profile).

## GKE alpha qualification procedure

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

## Sign-off decision

**Do not approve untrusted production GKE use merely because gVisor, SandboxClaims and NetworkPolicy CRDs exist.** Require actual allowed/denied network probes, proof of least-privilege KSA/Workload Identity and IAM behaviour, authenticated request/response evidence, tested ingress and CSI cleanup. A test unable to reach a metadata endpoint is different from an endpoint that returns a token with **zero usable privilege**; record which was verified.

Document cluster version, CNI/enforcement mode, provider IAM posture, runtime image digest, chart values, test actor namespace, sanitised probe results, exceptions and failed assertions. If any mandatory negative probe is not observed, mark **not qualified** and track follow-up under #3848. Redact credentials, tokens and private hostnames before attaching evidence.
