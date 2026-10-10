#!/usr/bin/env bash
# Remove everything the #3848 qualification created. Order matters: delete
# SandboxClaims first so their PVCs (and GCE PDs) are reclaimed, and the
# ingress-nginx Service before its namespace so GKE deletes the NLB, forwarding
# rule, backend service, health check and firewall rules.
#   KEEP_AGENT_SANDBOX=1  keep the KAS CRDs/controller
#   KEEP_NODE_POOL=1      keep the gVisor node pool
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
source "$HERE/env.sh"
IP="$(lb_ip)"
k -n "$NS" delete sandboxclaim --all --wait=true
k -n "$NS" delete sandbox --all --wait=true 2>/dev/null
k -n "$NS" delete sandboxwarmpool,sandboxtemplate --all --wait=true 2>/dev/null
k -n "$NS" delete pvc --all --wait=true
k delete namespace "$NS" --wait=true
helm --kube-context "$KUBE_CONTEXT" -n "$INGRESS_NS" uninstall ingress-nginx-3848 --wait
k delete namespace "$INGRESS_NS" --wait=true
if [[ -z "${KEEP_AGENT_SANDBOX:-}" ]]; then
  k delete --ignore-not-found -f \
    "https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${AGENT_SANDBOX_VERSION}/sandbox-with-extensions.yaml"
fi
if [[ -z "${KEEP_NODE_POOL:-}" ]]; then
  gc container node-pools delete "$NODE_POOL" --cluster "$CLUSTER" --zone "$ZONE" --quiet
fi
gc artifacts repositories delete "$AR_REPO" --location "$REGION" --quiet
echo "== leftovers (all should be empty)"
[[ -n "$IP" ]] && gc compute forwarding-rules list --filter="IPAddress=$IP" --format='value(name)'
gc compute firewall-rules list --filter="description~ingress-nginx-3848" --format='value(name)'
gc compute disks list --filter="description~magda-gke-3848" --format='value(name)'
k get pv -o jsonpath='{range .items[?(@.spec.claimRef.namespace=="'"$NS"'")]}{.metadata.name}{"\n"}{end}'
k get crd -o name | grep agents.x-k8s.io || true
gc container node-pools list --cluster "$CLUSTER" --zone "$ZONE" --format='value(name)'
