#!/usr/bin/env bash
# Deploy the #3841 agent namespace: mock LLM, Agent Manager PoC proxy, the
# SandboxTemplates/WarmPools, and the Magda test users.
#   AUTH_MODE=managed-cookie (stock DSH, default) | none (DSH --no-browser-auth)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
NS=magda-agent-poc
AUTH_MODE="${AUTH_MODE:-managed-cookie}"

kubectl apply -f "$HERE/manifests/10-namespace-mock-llm.yaml"
# The proxy verifies the gateway's X-Magda-Session JWT with Magda's jwt-secret.
kubectl -n magda get secret auth-secrets -o jsonpath='{.data.jwt-secret}' | base64 -d \
  | kubectl -n "$NS" create secret generic auth-secrets --from-file=jwt-secret=/dev/stdin \
      --dry-run=client -o yaml | kubectl apply -f -
"$HERE/scripts/render-sandbox-templates.sh"
kubectl apply -f "$HERE/manifests/20-agent-manager.yaml" -f "$HERE/manifests/30-sandbox-templates.yaml"
kubectl -n "$NS" set env deploy/agent-manager AUTH_MODE="$AUTH_MODE"
kubectl -n "$NS" rollout status deploy/agent-manager deploy/mock-llm --timeout=180s
"$HERE/scripts/05-create-test-users.sh"
