#!/usr/bin/env bash
# Magda agent entrypoint for #3841: DSH Web listens on 0.0.0.0:3080 directly
# (no loopback relay / bridge sidecar). tini is PID 1 and reaps orphans.
#
# Environment:
#   DSH_PUBLIC_URL     advertised browser root, e.g.
#                      https://magda.test:18443/api/v0/agent/runtime/
#   DSH_TRUSTED_HOSTS  extra Host authorities for the DSH fence (space separated)
#   DSH_BROWSER_AUTH   "false" adds --no-browser-auth (only the `nba` image has it)
#   DSH_WS_HEARTBEAT_MS  override the /api/remote.mux WebSocket ping interval
#                      (default 2000); used only by the ingress-timeout counterfactual
set -euo pipefail

mkdir -p "$DSH_HOME" /data/workspace "${XDG_CONFIG_HOME:-/data/config}"
if [[ ! -f /data/.created-at ]]; then
  date -u +%Y-%m-%dT%H:%M:%SZ > /data/.created-at
fi
echo "magda-agent: volume created at $(cat /data/.created-at), boot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "magda-agent: dsh $(dsh --version), mgd $(mgd --version), uid $(id -u)"

cd /data/workspace

# Launcher flags (--patch) must precede the web app's own flags.
launcher=(--patch /etc/magda-agent/magda.cordis.patch.yml)
if [[ -n "${DSH_WS_HEARTBEAT_MS:-}" ]]; then
  printf -- '- id: typert-gateway\n  config:\n    websocketHeartbeatIntervalMs: %d\n' \
    "$DSH_WS_HEARTBEAT_MS" > /tmp/magda-heartbeat.patch.yml
  launcher+=(--patch /tmp/magda-heartbeat.patch.yml)
fi
args=(--no-open)
if [[ -n "${DSH_PUBLIC_URL:-}" ]]; then args+=(--public-url "$DSH_PUBLIC_URL"); fi
for h in ${DSH_TRUSTED_HOSTS:-}; do args+=(--trusted-host "$h"); done
if [[ "${DSH_BROWSER_AUTH:-true}" == "false" ]]; then args+=(--no-browser-auth); fi

exec dsh web "${launcher[@]}" "${args[@]}" "$@"
