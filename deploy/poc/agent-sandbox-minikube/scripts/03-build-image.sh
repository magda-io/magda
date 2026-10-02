#!/usr/bin/env bash
# Phase 4: build the Magda agent PoC image and load it into the Minikube node.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
PROFILE="${PROFILE:-magda-agent-poc}"
IMAGE="${IMAGE:-magda-agent-poc:dev}"
DSH_VERSION="${DSH_VERSION:-0.2.0-rc.2}"

# `mgd` named context = packages/mgd of this checkout (built inside the image).
docker build \
  --build-arg "DSH_VERSION=${DSH_VERSION}" \
  --build-context "mgd=${REPO_ROOT}/packages/mgd" \
  -t "$IMAGE" "$HERE/image"

docker image ls "$IMAGE"
minikube -p "$PROFILE" image load "$IMAGE"
