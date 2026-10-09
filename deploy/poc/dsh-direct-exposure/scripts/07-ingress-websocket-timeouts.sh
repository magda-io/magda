#!/usr/bin/env bash
# Experiment 4B: apply the recommended ingress-nginx WebSocket timeouts to the
# chart-rendered Ingress (the magda ingress chart has no annotation passthrough
# yet, so this is an out-of-band annotate for the PoC). `unset` removes them.
set -euo pipefail
if [[ "${1:-set}" == "unset" ]]; then
  kubectl -n magda annotate ingress ingress \
    nginx.ingress.kubernetes.io/proxy-read-timeout- nginx.ingress.kubernetes.io/proxy-send-timeout-
else
  kubectl -n magda annotate --overwrite ingress ingress \
    nginx.ingress.kubernetes.io/proxy-read-timeout="${TIMEOUT:-3600}" \
    nginx.ingress.kubernetes.io/proxy-send-timeout="${TIMEOUT:-3600}"
fi
kubectl -n magda get ingress ingress -o jsonpath='{.metadata.annotations}{"\n"}'
