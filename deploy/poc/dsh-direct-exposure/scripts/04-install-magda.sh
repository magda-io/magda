#!/usr/bin/env bash
# Install a minimal Magda 7.0.0 (namespace magda) with the PoC gateway image,
# served by the minikube ingress-nginx addon over TLS for magda.test.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${CERT_DIR:-$HERE/.local/tls}"   # git-ignored, self-signed

mkdir -p "$CERT_DIR"
if [[ ! -f "$CERT_DIR/tls.crt" ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=magda.test" \
    -addext "subjectAltName=DNS:magda.test" \
    -keyout "$CERT_DIR/tls.key" -out "$CERT_DIR/tls.crt" 2>/dev/null
fi
kubectl -n ingress-nginx create secret tls magda-test-tls \
  --cert="$CERT_DIR/tls.crt" --key="$CERT_DIR/tls.key" --dry-run=client -o yaml | kubectl apply -f -
# The chart Ingress uses `useDefaultCertificate: true` (no cert-manager needed).
if ! kubectl -n ingress-nginx get deploy ingress-nginx-controller -o jsonpath='{.spec.template.spec.containers[0].args}' \
  | grep -q default-ssl-certificate; then
  kubectl -n ingress-nginx patch deploy ingress-nginx-controller --type=json -p \
    '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--default-ssl-certificate=ingress-nginx/magda-test-tls"}]'
fi
kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller --timeout=180s

kubectl create namespace magda --dry-run=client -o yaml | kubectl apply -f -
helm dependency build "$HERE/manifests/magda/chart"
# No --wait: the DB migrators are post-install hooks that authorization-api needs.
helm upgrade --install magda "$HERE/manifests/magda/chart" -n magda --timeout 15m
kubectl -n magda rollout status deploy/authorization-api deploy/gateway deploy/magda-auth-internal --timeout=600s
kubectl -n magda get pods
