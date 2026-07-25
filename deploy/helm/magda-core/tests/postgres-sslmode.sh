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

render () {
    helm template sslmode-test "${CHART_DIR}" "$@"
}

# 1. Default (in-cluster) resolves to `require`.
render > "${TMP_DIR}/default.yaml"
if ! grep -q 'value: "require"' "${TMP_DIR}/default.yaml"; then
    echo "expected the default in-cluster render to resolve sslmode to require"
    exit 1
fi

# 2. The Cloud SQL proxy path resolves to `disable`: cloud_sql_proxy presents a
#    plaintext listener and performs TLS to Cloud SQL itself.
#    (postgresqlUsername is overridden here to route around the unrelated
#    external-DB privileged-username validation, which requires a non-default
#    username whenever useCloudSql/useAwsRdsDb is enabled.)
render --set global.useCombinedDb=false --set global.useCloudSql=true \
    --set global.postgresql.postgresqlUsername=magda_admin \
    > "${TMP_DIR}/cloudsql.yaml"
if grep -q 'name: "PGSSLMODE"' -A 1 "${TMP_DIR}/cloudsql.yaml" \
    | grep -q 'value: "require"'; then
    echo "expected the cloud-sql-proxy path to resolve sslmode to disable"
    exit 1
fi
if ! grep -q 'value: "disable"' "${TMP_DIR}/cloudsql.yaml"; then
    echo "expected the cloud-sql-proxy path to emit sslmode disable"
    exit 1
fi

# 3. An explicit value always wins, even on the Cloud SQL path.
render --set global.useCombinedDb=false --set global.useCloudSql=true \
    --set global.postgresql.postgresqlUsername=magda_admin \
    --set global.postgresql.client.sslmode=require > "${TMP_DIR}/explicit.yaml"
if ! grep -q 'value: "require"' "${TMP_DIR}/explicit.yaml"; then
    echo "expected an explicit sslmode to override the cloud-sql default"
    exit 1
fi

# 4. `prefer` is rejected: node-postgres cannot negotiate it consistently.
for bad in prefer allow verify-ca verify-full banana; do
    if render --set global.postgresql.client.sslmode="${bad}" \
        > /dev/null 2> "${TMP_DIR}/fail.stderr"; then
        echo "expected render to fail for unsupported sslmode '${bad}'"
        exit 1
    fi
    if ! grep -q "global.postgresql.client.sslmode" "${TMP_DIR}/fail.stderr"; then
        echo "expected the '${bad}' failure message to name the offending setting"
        exit 1
    fi
done

echo "postgres sslmode resolution checks passed"
