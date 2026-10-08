#!/usr/bin/env bash
# Compile magda-gateway from this checkout and build the PoC gateway image
# (gateway/Dockerfile) with the WebSocket upgrade support, then load it into
# the Minikube node. The checkout must contain #3843 (feat/gateway-websocket-proxy). Needs the repo's node_modules (yarn install) for tsc.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
PROFILE="${PROFILE:-magda-agent-poc}"
IMAGE="${IMAGE:-local/magda-gateway:ws-poc}"
# Override BIN when the checkout (e.g. a git worktree) has no node_modules of its own.
BIN="${BIN:-$(cd "$REPO_ROOT" && npm root)/.bin}"

(cd "$REPO_ROOT/magda-gateway" && "$BIN/tsc" -b)
# The transformer reports failures on some .d.ts files with the local babel
# setup; only the .js output matters here, so check the files we ship instead.
(cd "$REPO_ROOT/magda-gateway" && "$BIN/ts-module-alias-transformer" dist >/dev/null 2>&1 || true)
CTX="$(mktemp -d)"
trap 'rm -rf "$CTX"' EXIT
cp "$HERE/gateway/Dockerfile" "$CTX/"
for f in WebSocketUpgradeHandler createBaseProxy createGenericProxyRouter index; do
  cp "$REPO_ROOT/magda-gateway/dist/$f.js" "$CTX/"
done
if grep -l "magda-typescript-common/src" "$CTX"/*.js; then
  echo "module aliases were not rewritten" >&2
  exit 1
fi
docker build -t "$IMAGE" "$CTX"
minikube -p "$PROFILE" image load "$IMAGE"
