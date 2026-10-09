#!/usr/bin/env bash
# Build the #3841 agent images (stock DSH and the #8528 port) plus the
# mock-LLM / Agent Manager PoC image, and load them into the Minikube node.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
PROFILE="${PROFILE:-magda-agent-poc}"
DSH_VERSION="${DSH_VERSION:-0.2.1-alpha.1}"

# Stage packages/mgd without host build output: after `yarn install` the
# checkout has a node_modules with host-platform binaries (e.g. esbuild).
MGD_CTX="$(mktemp -d)"
trap 'rm -rf "$MGD_CTX"' EXIT
rsync -a --exclude node_modules --exclude bin "$REPO_ROOT/packages/mgd/" "$MGD_CTX/"

for target in stock nba; do
  docker build --target "$target" \
    --build-arg "DSH_VERSION=${DSH_VERSION}" \
    --build-context "mgd=${MGD_CTX}" \
    -t "magda-agent-dsh:${target}" "$HERE/image"
done
docker build -t magda-agent-poc-tools:dev -f "$HERE/agent-manager/Dockerfile" "$HERE"

for image in magda-agent-dsh:stock magda-agent-dsh:nba magda-agent-poc-tools:dev; do
  minikube -p "$PROFILE" image load "$image"
done
docker image ls | grep -E "magda-agent-(dsh|poc-tools)"
