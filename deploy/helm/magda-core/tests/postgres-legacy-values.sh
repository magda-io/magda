#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"
CHART_DIR="${ROOT_DIR}/deploy/helm/magda-core"

if ! command -v helm >/dev/null 2>&1; then
    echo "helm is required for this test"
    exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# The v6 -> v7 rename of these three globals is a SILENT misconfiguration if it is not
# rejected: the chart renders cleanly, ignores the operator's privileged username and
# secret name, and brings the database up as `postgres` against a secret nobody wrote.
# Each removed key must fail the render and name its replacement.
while IFS='|' read -r old new; do
    if helm template legacy "${CHART_DIR}" --set "global.postgresql.${old}=whatever" \
        > /dev/null 2> "${TMP_DIR}/err"; then
        echo "FAIL: expected render to fail for removed key global.postgresql.${old}"
        exit 1
    fi
    if ! grep -q "${new}" "${TMP_DIR}/err"; then
        echo "FAIL: the global.postgresql.${old} failure must name its replacement ${new}"
        cat "${TMP_DIR}/err"
        exit 1
    fi
done <<'EOF'
postgresqlUsername|global.postgresql.auth.username
postgresqlDatabase|global.postgresql.auth.database
existingSecret|global.postgresql.auth.existingSecret
EOF

# The guard must be unconditional. Turning off every DB-connecting component must not
# turn the guard off with it -- that is the difference between a guard and a formality.
if helm template legacy "${CHART_DIR}" --set tags.all=false \
    --set "global.postgresql.postgresqlUsername=whatever" > /dev/null 2>&1; then
    echo "FAIL: the legacy-key guard did not fire with tags.all=false"
    exit 1
fi

# extraEnvVarsCM is the one name the subchart no longer derives, so a drift between the
# wrapper chart's literal and fullnameOverride must fail loudly rather than produce an
# invalid ConfigMap reference at install time.
if helm template legacy "${CHART_DIR}" \
    --set "combined-db.magda-postgres.postgresql.primary.extraEnvVarsCM=wrong-name" \
    > /dev/null 2> "${TMP_DIR}/err2"; then
    echo "FAIL: expected render to fail for a mismatched extraEnvVarsCM"
    exit 1
fi
if ! grep -q "extraEnvVarsCM" "${TMP_DIR}/err2"; then
    echo "FAIL: the extraEnvVarsCM failure must name the offending setting"
    cat "${TMP_DIR}/err2"
    exit 1
fi

echo "postgres legacy-value and name-consistency guards passed"
