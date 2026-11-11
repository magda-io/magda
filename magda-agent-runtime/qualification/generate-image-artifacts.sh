#!/bin/sh
# Self-contained, remote-DIND-safe qualification. No bind mounts, app startup,
# global scanner installation or dependency resolution. Requires python3, Docker
# CLI/daemon, and HTTPS access to the pinned official Syft release download.
# Example:
#   ./generate-image-artifacts.sh --image magda-agent-runtime:source-pinned-local \
#     --platform linux/arm64 --output /tmp/magda-arm64-evidence
# Add --baseline-inventory /path/to/official-npm-image/inventory.json to compare
# physically installed Node package name/version sets with an official baseline.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$HERE/collect-image-evidence.py" --generate "$@"
