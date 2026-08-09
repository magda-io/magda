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
#    (auth.username is overridden here to route around the unrelated
#    external-DB privileged-username validation, which requires a non-default
#    username whenever useCloudSql/useAwsRdsDb is enabled.)
render --set global.useCombinedDb=false --set global.useCloudSql=true \
    --set global.postgresql.auth.username=magda_admin \
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
    --set global.postgresql.auth.username=magda_admin \
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

# --- Per-container PGSSLMODE coverage across the real deployment charts --------
#
# The checks above render `magda-core`. That is not enough on its own: users
# install `magda` (or `local-deployment`), which additionally pull in ~12
# third-party subcharts that each VENDOR THEIR OWN older copy of the
# `magda-common` library chart. Helm merges every chart's templates into one
# flat, global namespace and the LAST definition of a name wins, so a template
# defined in `magda-common` can be silently shadowed by a stale vendored copy.
#
# That is not hypothetical. Emitting PGSSLMODE from `magda-common`'s
# `magda.db-client-credential-env` rendered correctly under `magda-core` but was
# dropped under the umbrella, and the Node services connected in PLAINTEXT while
# every magda-core-based test still passed.
#
# The assertion is per-container, not an aggregate count: a container that gets
# DB credentials must also get PGSSLMODE. Aggregate totals hide the case where
# one component loses it while another gains one.
assert_sslmode_coverage () {
    local chart_dir="$1" label="$2" allow="$3"
    [ -d "${chart_dir}/charts" ] || {
        echo "${label}: dependencies not built (run 'cd deploy && yarn update-all-charts'); skipping"
        return 0
    }
    local out="${TMP_DIR}/$(basename "${chart_dir}")-cov.yaml"
    helm template cov "${chart_dir}" --set global.postgresql.auth.username=magda_admin > "${out}"
    ALLOW="${allow}" python3 - "${out}" "${label}" <<'PY'
import os, sys, re
path, label = sys.argv[1], sys.argv[2]
allow = {a for a in os.environ.get("ALLOW", "").split(",") if a}
# Per-workload attribution. A real YAML parse would let us go per-container, but
# PyYAML is not guaranteed in the CI image; per-document is the robust
# alternative and still catches the case aggregate counts miss, where one
# component loses PGSSLMODE while another gains one. The residual blind spot is
# a multi-container pod where a sidecar carries the env var and the app does
# not, which does not occur in this chart.
bad, checked = [], 0
for d in open(path).read().split("\n---\n"):
    km = re.search(r'^kind:\s*(\S+)', d, re.M)
    if not km:
        continue
    nm = re.search(r'^\s{0,2}name:\s*"?([\w.-]+)"?', d, re.M)
    kind, name = km.group(1), (nm.group(1) if nm else "?")
    # Only DB *clients* are checked. The PostgreSQL server itself is a
    # StatefulSet whose POSTGRES_USER is its own bootstrap configuration - the
    # account it creates - not a connection to somewhere else, so it neither
    # has nor needs PGSSLMODE. Every DB client in these charts is a Deployment,
    # Job or CronJob.
    if kind not in ("Deployment", "Job", "CronJob"):
        continue
    envs = set(re.findall(r'-\s+name:\s*"?(PGUSER|POSTGRES_USER|PGSSLMODE)"?\s*$', d, re.M))
    if not (envs & {"PGUSER", "POSTGRES_USER"}):
        continue
    checked += 1
    if "PGSSLMODE" not in envs:
        key = "%s/%s" % (kind, name)
        if key not in allow:
            bad.append(key)
if checked == 0:
    print("%s: FAIL - found no DB-credential workloads at all" % label); sys.exit(1)
if bad:
    print("%s: FAIL - %d workload(s) receive DB credentials but no PGSSLMODE:" % (label, len(set(bad))))
    for b in sorted(set(bad)):
        print("    " + b)
    print("  A magda-common template is probably being shadowed by a vendored copy.")
    sys.exit(1)
print("%s: PGSSLMODE present on all %d DB-credential workloads%s"
      % (label, checked, (" (%d known-gap exemption(s))" % len(allow)) if allow else ""))
PY
}

assert_sslmode_coverage "${ROOT_DIR}/deploy/helm/magda" "umbrella (magda)" ""

# `local-deployment` additionally pulls in the authentication plugins. Those call
# `magda.db-client-credential-env` from their own vendored `magda-common` and do
# NOT yet emit PGSSLMODE, so they connect to the session DB in plaintext. That is
# pre-existing (nothing set PGSSLMODE before this change) and is tracked
# separately; the plugins need both a chart release and an SDK bump. They are
# exempted by name here rather than by weakening the check, so that any NEW
# regression still fails and this list doubles as the outstanding work.
AUTH_PLUGIN_EXEMPTIONS="Deployment/magda-auth-google,Deployment/magda-auth-internal,Deployment/magda-auth-oidc,Deployment/magda-auth-arcgis,Deployment/magda-auth-facebook"
assert_sslmode_coverage "${ROOT_DIR}/deploy/helm/local-deployment" "local-deployment" "${AUTH_PLUGIN_EXEMPTIONS}"
