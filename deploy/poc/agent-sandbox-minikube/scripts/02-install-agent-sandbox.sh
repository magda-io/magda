#!/usr/bin/env bash
# Phase 2: install a pinned Kubernetes Agent Sandbox release (core + extensions).
set -euo pipefail
AGENT_SANDBOX_VERSION="${AGENT_SANDBOX_VERSION:-v1.0.4}"
kubectl apply --server-side -f \
  "https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${AGENT_SANDBOX_VERSION}/sandbox-with-extensions.yaml"
kubectl -n agent-sandbox-system rollout status deploy --timeout=300s
kubectl get crd | grep agents.x-k8s.io
