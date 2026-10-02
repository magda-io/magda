#!/usr/bin/env bash
# Phase 5: open the DSH web UI of one claimed sandbox in a local browser.
#
#   browser -> kubectl port-forward -> access Pod (runc) -> sandbox Pod IP:8080
#           -> in-sandbox loopback relay -> DSH 127.0.0.1:3080
#
# The access Pod stands in for the future Agent Manager proxy: it is the only
# ingress source the SandboxTemplate NetworkPolicy admits, and it runs under
# runc because `kubectl port-forward` cannot reach into a gVisor netstack.
#
# Usage: scripts/04-open-ui.sh <claim-name> [local-port]
set -euo pipefail
CLAIM="${1:?usage: $0 <claim-name> [local-port]}"
LOCAL_PORT="${2:-13080}"
NS="${NS:-magda-agent-poc}"
IMAGE="${IMAGE:-magda-agent-poc:dev}"

kubectl -n "$NS" wait --for=condition=Ready "sandboxclaim/$CLAIM" --timeout=300s >/dev/null
SANDBOX="$(kubectl -n "$NS" get sandboxclaim "$CLAIM" -o jsonpath='{.status.sandbox.name}')"
kubectl -n "$NS" wait --for=condition=Ready "pod/$SANDBOX" --timeout=300s >/dev/null
POD_IP="$(kubectl -n "$NS" get pod "$SANDBOX" -o jsonpath='{.status.podIP}')"

# Recreate the access Pod so it always targets the sandbox's current Pod IP.
kubectl -n "$NS" delete pod "access-$CLAIM" --ignore-not-found --wait=true >/dev/null
kubectl -n "$NS" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: access-$CLAIM
  labels:
    app.kubernetes.io/name: magda-agent-access
    magda.io/agent-claim: $CLAIM
spec:
  automountServiceAccountToken: false
  enableServiceLinks: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    seccompProfile: {type: RuntimeDefault}
  containers:
    - name: relay
      image: $IMAGE
      imagePullPolicy: Never
      command: ["/usr/bin/tini", "--", "node", "/etc/magda-agent/loopback-relay.mjs"]
      env:
        - {name: RELAY_PORT, value: "8080"}
        - {name: TARGET_HOST, value: "$POD_IP"}
        - {name: TARGET_PORT, value: "8080"}
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: {drop: ["ALL"]}
      resources:
        requests: {cpu: 10m, memory: 32Mi}
        limits: {cpu: 200m, memory: 128Mi}
EOF
kubectl -n "$NS" wait --for=condition=Ready "pod/access-$CLAIM" --timeout=120s >/dev/null

# DSH prints a one-time token URL on startup; the token is exchanged for a
# signed cookie on first load. (An Agent Manager would capture this itself.)
TOKEN="$(kubectl -n "$NS" logs "$SANDBOX" -c agent | sed -n 's/^dsh web: .*token=\(.*\)$/\1/p' | tail -1)"
echo "sandbox: $SANDBOX ($POD_IP)"
echo "open:    http://localhost:${LOCAL_PORT}/?token=${TOKEN}"
exec kubectl -n "$NS" port-forward "pod/access-$CLAIM" "${LOCAL_PORT}:8080"
