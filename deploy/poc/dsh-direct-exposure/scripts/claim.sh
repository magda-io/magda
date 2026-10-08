#!/usr/bin/env bash
# Create (or replace) the agent SandboxClaim of one Magda user.
#   scripts/claim.sh <user-uuid> <template: dsh-{gvisor,runc}-{stock,nba}> [claim-name]
# The Agent Manager PoC finds the claim by the magda.io/agent-user label. Use a
# fresh claim name per session (F17 in the #3812 write-up).
set -euo pipefail
USER_ID="${1:?user uuid}"; POOL="${2:?warm pool / template name}"
NAME="${3:-u-${USER_ID: -4}-$(date +%s)}"
NS=magda-agent-poc
kubectl -n "$NS" delete sandboxclaim -l "magda.io/agent-user=$USER_ID" --wait=true >/dev/null
kubectl -n "$NS" apply -f - >/dev/null <<YAML
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxClaim
metadata:
  name: $NAME
  namespace: $NS
  labels:
    magda.io/agent-user: "$USER_ID"
spec:
  warmPoolRef:
    name: $POOL
YAML
kubectl -n "$NS" wait --for=condition=Ready "sandboxclaim/$NAME" --timeout=300s >/dev/null
SANDBOX="$(kubectl -n "$NS" get sandboxclaim "$NAME" -o jsonpath='{.status.sandbox.name}')"
kubectl -n "$NS" wait --for=condition=Ready "pod/$SANDBOX" --timeout=300s >/dev/null
echo "$NAME -> sandbox $SANDBOX ($(kubectl -n "$NS" get sandbox "$SANDBOX" -o jsonpath='{.status.serviceFQDN}'))"
