#!/usr/bin/env bash
# (Re)create the test user's SandboxClaim from a template and wait until the
# claim, Sandbox and Pod are Ready.
#   [TEST_USER_ID=<uuid>] scripts/claim.sh <dsh-gvisor|dsh-runc|dsh-gvisor-hb120|dsh-gvisor-hb3600> [claim-name]
# Agent Manager routes a user's requests to the claim labelled with their id.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
source "$HERE/env.sh"
POOL="${1:?template / warm pool, e.g. dsh-gvisor}"
NAME="${2:-u-${TEST_USER_ID: -4}-$(date +%s)}"
k -n "$NS" delete sandboxclaim -l "magda.io/agent-user=$TEST_USER_ID" --wait=true >/dev/null
started=$(date +%s)
k -n "$NS" apply -f - >/dev/null <<YAML
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxClaim
metadata:
  name: $NAME
  namespace: $NS
  labels:
    magda.io/agent-user: "$TEST_USER_ID"
spec:
  warmPoolRef:
    name: $POOL
YAML
k -n "$NS" wait --for=condition=Ready "sandboxclaim/$NAME" --timeout=600s >/dev/null
SANDBOX="$(k -n "$NS" get sandboxclaim "$NAME" -o jsonpath='{.status.sandbox.name}')"
k -n "$NS" wait --for=condition=Ready "pod/$SANDBOX" --timeout=600s >/dev/null
echo "$NAME -> sandbox $SANDBOX ($(k -n "$NS" get sandbox "$SANDBOX" -o jsonpath='{.status.serviceFQDN}')) ready in $(( $(date +%s) - started ))s"
