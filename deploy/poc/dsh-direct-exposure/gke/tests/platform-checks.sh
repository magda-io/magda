#!/usr/bin/env bash
# #3848 GKE platform checks for a running gVisor Sandbox (the test user's claim):
#   1. GKE Sandbox: RuntimeClass, node pool sandboxConfig, node label/taint,
#      and gVisor evidence from inside the Pod vs a runc Pod on default-pool.
#   2. DNS and minimal egress (cluster DNS, in-cluster mock LLM, public HTTPS via Cloud NAT).
#   3. Metadata server reachability from the sandbox.
#   4. NetworkPolicy: is the KAS-managed policy *enforced* on this cluster?
# Prints PASS/FAIL/INFO lines; "EXPECTED-GAP" marks a documented limitation of
# this particular cluster rather than a test failure.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
source "$HERE/env.sh"
SANDBOX="$(k -n "$NS" get sandboxclaim -l "magda.io/agent-user=$TEST_USER_ID" -o jsonpath='{.items[0].status.sandbox.name}')"
[[ -n "$SANDBOX" ]] || { echo "no SandboxClaim for $TEST_USER_ID" >&2; exit 1; }
FQDN="$(k -n "$NS" get sandbox "$SANDBOX" -o jsonpath='{.status.serviceFQDN}')"
in_sbx() { k -n "$NS" exec "$SANDBOX" -c agent -- sh -c "$1" 2>&1; }
in_runc() { k -n "$NS" exec deploy/mock-llm -c mock-llm -- sh -c "$1" 2>&1; }
fails=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
info() { echo "INFO $*"; }
gap() { echo "EXPECTED-GAP $*"; }

echo "== 1. GKE Sandbox (gVisor) — sandbox $SANDBOX"
NODE="$(k -n "$NS" get pod "$SANDBOX" -o jsonpath='{.spec.nodeName}')"
RC="$(k -n "$NS" get pod "$SANDBOX" -o jsonpath='{.spec.runtimeClassName}')"
[[ "$RC" == gvisor ]] && pass "Pod runtimeClassName=gvisor" || fail "Pod runtimeClassName='$RC'"
info "RuntimeClass gvisor: handler=$(k get runtimeclass gvisor -o jsonpath='{.handler}') scheduling.nodeSelector=$(k get runtimeclass gvisor -o jsonpath='{.scheduling.nodeSelector}')"
info "Pod tolerations (injected by the RuntimeClass): $(k -n "$NS" get pod "$SANDBOX" -o jsonpath='{.spec.tolerations[?(@.key=="sandbox.gke.io/runtime")]}')"
LBL="$(k get node "$NODE" -o jsonpath='{.metadata.labels.sandbox\.gke\.io/runtime}')"
[[ "$LBL" == gvisor ]] && pass "scheduled on GKE Sandbox node $NODE (sandbox.gke.io/runtime=gvisor)" || fail "node $NODE label sandbox.gke.io/runtime='$LBL'"
info "node taints: $(k get node "$NODE" -o jsonpath='{.spec.taints}')"
info "node: $(k get node "$NODE" -o jsonpath='{.status.nodeInfo.kubeletVersion} {.status.nodeInfo.osImage} {.status.nodeInfo.containerRuntimeVersion} kernel {.status.nodeInfo.kernelVersion}')"
POOL="$(k get node "$NODE" -o jsonpath='{.metadata.labels.cloud\.google\.com/gke-nodepool}')"
info "node pool $POOL sandboxConfig: $(gc container node-pools describe "$POOL" --cluster "$CLUSTER" --zone "$ZONE" --format='value(config.sandboxConfig)')"
SBX_KERNEL="$(in_sbx 'uname -r')"; RUNC_KERNEL="$(in_runc 'uname -r')"
info "uname -r: gVisor Pod '$SBX_KERNEL' vs runc Pod '$RUNC_KERNEL' (node kernel $(k get node "$NODE" -o jsonpath='{.status.nodeInfo.kernelVersion}'))"
DMESG="$(in_sbx 'dmesg 2>/dev/null | head -3')"
if grep -qi gvisor <<<"$DMESG"; then pass "dmesg inside the Pod is gVisor's: $(head -1 <<<"$DMESG")"; else fail "dmesg does not look like gVisor: $DMESG"; fi
info "seccompProfile RuntimeDefault requested in the Pod: $(k -n "$NS" get pod "$SANDBOX" -o jsonpath='{.spec.securityContext.seccompProfile.type}') (GKE Sandbox does not apply node seccomp/AppArmor inside gVisor; the Pod was admitted)"

echo "== 2. DNS and egress from the sandbox"
for name in "mock-llm.$NS.svc.cluster.local" kubernetes.default.svc.cluster.local registry.npmjs.org; do
  out="$(in_sbx "getent hosts $name")"
  [[ -n "$out" && "$out" != *rror* ]] && pass "DNS resolves $name -> $(awk '{print $1}' <<<"$out" | head -1)" || fail "DNS $name: $out"
done
code="$(in_sbx "curl -s -o /dev/null -m 10 -w '%{http_code}' http://mock-llm.$NS.svc.cluster.local/v1/models")"
[[ "$code" =~ ^[2-4][0-9][0-9]$ ]] && pass "in-cluster mock LLM reachable (HTTP $code)" || fail "mock LLM: $code"
code="$(in_sbx "curl -s -o /dev/null -m 15 -w '%{http_code}' https://registry.npmjs.org/")"
[[ "$code" == 200 ]] && pass "public HTTPS egress (private nodes via Cloud NAT) HTTP $code" || fail "public egress: $code"

echo "== 3. Metadata server from the sandbox"
md() { in_sbx "curl -s -m 5 -o /dev/null -w '%{http_code}' -H 'Metadata-Flavor: Google' 'http://169.254.169.254/computeMetadata/v1/$1'"; }
info "metadata /instance/attributes/kube-env -> HTTP $(md instance/attributes/kube-env) (node credentials; must not be 200)"
info "metadata /instance/service-accounts/default/email -> HTTP $(md instance/service-accounts/default/email)"
info "metadata /instance/service-accounts/default/token -> HTTP $(md instance/service-accounts/default/token)"
[[ "$(md instance/attributes/kube-env)" != 200 ]] && pass "node kube-env (bootstrap credentials) is not readable from the sandbox" || fail "kube-env readable from the sandbox"
TOK="$(md instance/service-accounts/default/token)"
[[ "$TOK" != 200 ]] && pass "no Google access token from the sandbox (KSA not bound to a GSA; automountServiceAccountToken=false)" || fail "the sandbox obtained a Google access token (HTTP 200)"

echo "== 4. NetworkPolicy enforcement"
NP_ENABLED="$(gc container clusters describe "$CLUSTER" --zone "$ZONE" --format='value(networkPolicy.enabled,addonsConfig.networkPolicyConfig.disabled,networkConfig.datapathProvider)')"
info "cluster networkPolicy.enabled / addonsConfig.networkPolicyConfig.disabled / datapathProvider: '$NP_ENABLED'"
info "KAS-managed policies: $(k -n "$NS" get networkpolicy -o name | tr '\n' ' ')"
# Ingress: the template only admits Agent Manager on :3080.
probe() { # <exec-target> <container> <host> <port>
  k -n "$NS" exec "$1" -c "$2" -- node -e "
    const s=require('net').connect($4,'$3');s.setTimeout(4000);
    s.on('connect',()=>{console.log('CONNECTED');s.destroy()});
    s.on('timeout',()=>{console.log('BLOCKED(timeout)');s.destroy()});
    s.on('error',e=>console.log('BLOCKED('+e.code+')'))" 2>&1
}
r="$(probe deploy/agent-manager agent-manager "$FQDN" 3080)"
[[ "$r" == CONNECTED ]] && pass "allowed peer (Agent Manager) -> sandbox :3080 $r" || fail "Agent Manager -> sandbox: $r"
r="$(probe deploy/mock-llm mock-llm "$FQDN" 3080)"
[[ "$r" == CONNECTED ]] && gap "non-allowed peer (mock-llm) -> sandbox :3080 $r: NetworkPolicy NOT enforced on this cluster" || pass "non-allowed peer blocked: $r"
# Egress: the template allows DNS, mock LLM and public IPs only (RFC1918/link-local excepted).
AM_IP="$(k -n "$NS" get svc agent-manager -o jsonpath='{.spec.clusterIP}')"
code="$(in_sbx "curl -s -o /dev/null -m 5 -w '%{http_code}' http://$AM_IP/healthz")"
[[ "$code" == 200 ]] && gap "sandbox -> private ClusterIP $AM_IP (not allowed by its egress policy) HTTP $code: NetworkPolicy NOT enforced" || pass "private egress blocked ($code)"
API="$(gc container clusters describe "$CLUSTER" --zone "$ZONE" --format='value(privateClusterConfig.privateEndpoint)')"
code="$(in_sbx "curl -sk -o /dev/null -m 5 -w '%{http_code}' https://$API/version")"
[[ "$code" =~ ^[0-9]{3}$ && "$code" != 000 ]] && gap "sandbox -> control-plane private endpoint $API HTTP $code (reachable; policy not enforced)" || info "control-plane private endpoint $API: $code"
echo "== $fails failure(s)"
exit $fails
