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
#    Note: the producing grep must NOT use -q -- -q suppresses its stdout, so
#    piping it into a second grep would hand that grep an empty stream and make
#    this assertion vacuously true.
if grep -A1 'name: "PGSSLMODE"' "${TMP_DIR}/cloudsql.yaml" \
    | grep -q 'value: "require"'; then
    echo "expected the cloud-sql-proxy path to resolve sslmode to disable"
    exit 1
fi
if ! grep -A1 'name: "PGSSLMODE"' "${TMP_DIR}/cloudsql.yaml" \
    | grep -q 'value: "disable"'; then
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

# 4. Case is normalised, matching the `.trim().toLowerCase()` the TypeScript
#    side (magda-typescript-common/src/createPgPool.ts) applies, so both layers
#    accept the same vocabulary.
render --set global.postgresql.client.sslmode=ReQuIrE > "${TMP_DIR}/mixedcase.yaml"
if ! grep -A1 'name: "PGSSLMODE"' "${TMP_DIR}/mixedcase.yaml" \
    | grep -q 'value: "require"'; then
    echo "expected a mixed-case sslmode to normalise to require"
    exit 1
fi

# 5. `prefer` is rejected: node-postgres cannot negotiate it consistently.
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

# --- Umbrella-chart regression check -----------------------------------------
# The checks above render `magda-core`. Users install the `magda` umbrella, which
# additionally pulls in ~12 third-party subcharts (connectors, minions, semantic
# indexers) that each VENDOR THEIR OWN older copy of the `magda-common` library
# chart. Helm merges every chart's templates into one flat, global namespace and
# the last definition of a name wins, so a template defined in `magda-common` can
# be silently shadowed by a stale vendored copy.
#
# That is exactly what happened: emitting PGSSLMODE from `magda-common`'s
# `magda.db-client-credential-env` rendered correctly under `magda-core` but was
# dropped under the umbrella, and the Node services connected in PLAINTEXT while
# appearing fine in every magda-core-based test. The env var is now emitted by
# `magda.db-client-sslmode-env`, defined in `magda-core` (never vendored).
#
# Rendering magda-core alone cannot catch a regression of this class.
UMBRELLA_DIR="${ROOT_DIR}/deploy/helm/magda"
if [ -d "${UMBRELLA_DIR}/charts" ]; then
    UMBRELLA_OUT="${TMP_DIR}/umbrella.yaml"
    helm template sslmode-umbrella "${UMBRELLA_DIR}" \
        --set global.postgresql.postgresqlUsername=magda_admin \
        > "${UMBRELLA_OUT}"

    # Every component that receives DB client credentials must also receive PGSSLMODE.
    cred_count=$(grep -cE '^\s+- name: "?PGUSER"?$' "${UMBRELLA_OUT}" || true)
    ssl_count=$(grep -cE '^\s+- name: "?PGSSLMODE"?$' "${UMBRELLA_OUT}" || true)
    if [ "${ssl_count}" -lt "${cred_count}" ]; then
        echo "umbrella chart: ${cred_count} components get PGUSER but only ${ssl_count} get PGSSLMODE."
        echo "A magda-common template is probably being shadowed by a vendored copy."
        exit 1
    fi
    if [ "${ssl_count}" -eq 0 ]; then
        echo "umbrella chart: no PGSSLMODE emitted at all"
        exit 1
    fi
    echo "umbrella chart: PGSSLMODE present on all ${ssl_count} DB-connecting components"
else
    echo "umbrella chart dependencies not built (run 'cd deploy && yarn update-all-charts'); skipping umbrella check"
fi
