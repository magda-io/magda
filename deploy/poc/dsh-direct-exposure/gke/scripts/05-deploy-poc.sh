#!/usr/bin/env bash
# Deploy the PoC into $NS: self-signed TLS for <lb-ip>.sslip.io (CA kept in
# gke/.tls/ for the test clients), a random JWT secret for the stand-in
# X-Magda-Session, mock LLM, Agent Manager, Ingress and SandboxTemplates.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
source "$HERE/env.sh"
HOST="$(external_host)"
[[ "$HOST" != ".sslip.io" ]] || { echo "ingress-nginx LoadBalancer has no IP yet" >&2; exit 1; }
TLS="$HERE/.tls"
mkdir -p "$TLS"
if [[ ! -f "$TLS/ca.crt" ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=magda-3848-poc-ca" \
    -keyout "$TLS/ca.key" -out "$TLS/ca.crt" 2>/dev/null
fi
if [[ ! -f "$TLS/tls.crt" ]] || ! openssl x509 -in "$TLS/tls.crt" -noout -ext subjectAltName | grep -q "$HOST"; then
  openssl req -newkey rsa:2048 -nodes -subj "/CN=$HOST" -keyout "$TLS/tls.key" -out "$TLS/tls.csr" 2>/dev/null
  openssl x509 -req -in "$TLS/tls.csr" -CA "$TLS/ca.crt" -CAkey "$TLS/ca.key" -CAcreateserial -days 30 \
    -extfile <(printf "subjectAltName=DNS:%s,IP:%s\nextendedKeyUsage=serverAuth" "$HOST" "$(lb_ip)") \
    -out "$TLS/tls.crt" 2>/dev/null
fi
[[ -f "$TLS/jwt-secret" ]] || openssl rand -hex 32 | tr -d '\n' > "$TLS/jwt-secret"

k create namespace "$NS" --dry-run=client -o yaml | k apply -f -
k -n "$NS" create secret tls poc-tls --cert "$TLS/tls.crt" --key "$TLS/tls.key" --dry-run=client -o yaml | k apply -f -
k -n "$NS" create secret generic auth-secrets --from-file=jwt-secret="$TLS/jwt-secret" --dry-run=client -o yaml | k apply -f -
EXTERNAL_HOST="$HOST" "$HERE/scripts/render-manifests.sh"
k apply -f "$HERE/manifests/poc.yaml"
k -n "$NS" rollout status deploy/agent-manager deploy/mock-llm --timeout=300s
echo "Endpoint: https://$HOST/api/v0/agent/runtime/  (CA: $TLS/ca.crt)"
