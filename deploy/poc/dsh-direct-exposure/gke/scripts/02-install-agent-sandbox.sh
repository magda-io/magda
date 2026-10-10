#!/usr/bin/env bash
# Install the pinned Kubernetes Agent Sandbox release (core + extensions). It
# adds 4 cluster-scoped CRDs, ClusterRoles/Bindings and the controller in
# agent-sandbox-system; no admission webhooks. The controller runs on default-pool.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
source "$HERE/env.sh"
k apply --server-side -f \
  "https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${AGENT_SANDBOX_VERSION}/sandbox-with-extensions.yaml"
k -n agent-sandbox-system rollout status deploy --timeout=300s
k get crd | grep agents.x-k8s.io
