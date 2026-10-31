#!/usr/bin/env bash
# Keep uv's downloads, build temporaries and subprocess caches on the user's PVC
# without changing TMPDIR/XDG_CACHE_HOME for the host DSH process. The latter
# must keep its private temporary state outside the agent-writable workspace.
set -euo pipefail

export TMPDIR="${MAGDA_PYTHON_TMPDIR:?}"
export XDG_CACHE_HOME="${MAGDA_PYTHON_CACHE_ROOT:?}"
exec /usr/local/lib/magda-agent/uv "$@"
