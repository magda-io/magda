#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"
HELPERS_FILE="${ROOT_DIR}/deploy/helm/magda-core/templates/_helpers.tpl"

if ! command -v helm >/dev/null 2>&1; then
    echo "helm is required for this test"
    exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "${TMP_DIR}/Chart.yaml" <<'EOF'
apiVersion: v2
name: helper-validation-fixture
version: 0.1.0
EOF

mkdir -p "${TMP_DIR}/templates"
cp "${HELPERS_FILE}" "${TMP_DIR}/templates/_helpers.tpl"

cat > "${TMP_DIR}/templates/render.yaml" <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: test
data:
  env: |
{{ include "magda.postgres-superuser-env" . | indent 4 }}
EOF

PASS_OUTPUT="${TMP_DIR}/pass.yaml"
FAIL_STDERR="${TMP_DIR}/fail.stderr"

helm template pass "${TMP_DIR}" \
    --set global.postgresql.existingSecret=db-main-account-secret \
    --set global.postgresql.postgresqlUsername=magda_admin \
    --set global.useAwsRdsDb=true \
    --set global.awsRdsEndpoint=db.example.com \
    > "${PASS_OUTPUT}"

if ! grep -q 'value: "magda_admin"' "${PASS_OUTPUT}"; then
    echo "expected PGUSER to be magda_admin in rendered output"
    exit 1
fi

if helm template fail "${TMP_DIR}" \
    --set global.postgresql.existingSecret=db-main-account-secret \
    --set global.postgresql.postgresqlUsername=postgres \
    --set global.useAwsRdsDb=true \
    --set global.awsRdsEndpoint=db.example.com \
    > /dev/null 2> "${FAIL_STDERR}"; then
    echo "expected render to fail when external DB uses default postgres username"
    exit 1
fi

if ! grep -q "global.postgresql.postgresqlUsername" "${FAIL_STDERR}"; then
    echo "expected failure message to mention global.postgresql.postgresqlUsername"
    exit 1
fi

OVERRIDE_OUTPUT="${TMP_DIR}/override.yaml"
helm template override "${TMP_DIR}" \
    --set global.postgresql.existingSecret=db-main-account-secret \
    --set global.postgresql.postgresqlUsername=postgres \
    --set global.postgresql.allowDefaultExternalDbPostgresUser=true \
    --set global.useAwsRdsDb=true \
    --set global.awsRdsEndpoint=db.example.com \
    > "${OVERRIDE_OUTPUT}"

if ! grep -q 'value: "postgres"' "${OVERRIDE_OUTPUT}"; then
    echo "expected PGUSER to stay postgres when override is enabled"
    exit 1
fi

echo "postgres username validation checks passed"
