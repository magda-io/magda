#!/usr/bin/env bash
# Magda agent PoC entrypoint: prepare the persistent layout, then run the DSH
# web host in the foreground (tini is PID 1 and reaps orphans).
set -euo pipefail

mkdir -p "$DSH_HOME" /data/workspace "${XDG_CONFIG_HOME:-/data/config}"

# First-boot marker so lifecycle tests can tell a fresh volume from a reused one.
if [[ ! -f /data/.created-at ]]; then
  date -u +%Y-%m-%dT%H:%M:%SZ > /data/.created-at
fi
echo "magda-agent: volume created at $(cat /data/.created-at), boot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "magda-agent: dsh $(dsh --version), mgd $(mgd --version), uid $(id -u)"

cd /data/workspace
# DSH binds loopback only (it refuses --host 0.0.0.0 by design) and gVisor's
# loopback is unreachable from outside the sandbox (including by
# `kubectl port-forward`), so expose it on the Pod IP through a raw TCP relay.
# The relay must be fenced by NetworkPolicy to the trusted proxy only.
node /etc/magda-agent/loopback-relay.mjs &

# Extra Host authorities accepted by DSH's /api browser-trust fence, e.g. the
# address the browser uses to reach the proxy (space separated).
trusted=()
for h in ${DSH_TRUSTED_HOSTS:-}; do trusted+=(--trusted-host "$h"); done

exec dsh web --patch /etc/magda-agent/magda.cordis.patch.yml --no-open \
  --port "${DSH_WEB_PORT:-3080}" "${trusted[@]}" "$@"
