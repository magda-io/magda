#!/usr/bin/env bash
# Install ingress-nginx (own namespace / IngressClass, scoped to $NS) behind an
# external passthrough Network Load Balancer, then show what GCP really built.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
source "$HERE/env.sh"
SRC="${LB_SOURCE_RANGES:-$(curl -fsS https://ifconfig.me)/32}"

k create namespace "$NS" --dry-run=client -o yaml | k apply -f -
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo update ingress-nginx >/dev/null
helm --kube-context "$KUBE_CONTEXT" upgrade --install ingress-nginx-3848 ingress-nginx/ingress-nginx \
  --version "$INGRESS_NGINX_CHART_VERSION" --namespace "$INGRESS_NS" --create-namespace \
  -f "$HERE/ingress-nginx-values.yaml" \
  --set controller.scope.namespace="$NS" \
  --set "controller.service.loadBalancerSourceRanges={${SRC}}" \
  --wait --timeout 10m

for _ in $(seq 60); do [[ -n "$(lb_ip)" ]] && break; sleep 5; done
IP="$(lb_ip)"
echo "LoadBalancer IP: $IP  -> https://$(external_host)/"
k -n "$INGRESS_NS" get svc ingress-nginx-3848-controller -o wide
"$HERE/tests/lb-l4-check.sh"
