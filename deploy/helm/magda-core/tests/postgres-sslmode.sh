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

# verify-ca / verify-full are accepted now that CA delivery exists — but ONLY with a CA secret.
for mode in verify-ca verify-full; do
    if ! render --set global.postgresql.client.sslmode=$mode \
                --set global.postgresql.client.sslRootCertSecret.name=my-ca > "${TMP_DIR}/${mode}.yaml"; then
        echo "expected sslmode=$mode + CA secret to render successfully"
        exit 1
    fi
    if ! grep -q "value: \"$mode\"" "${TMP_DIR}/${mode}.yaml"; then
        echo "expected PGSSLMODE to carry $mode"
        exit 1
    fi
    # Decision 2: verify-* with NO CA secret must fail fast at render time.
    if render --set global.postgresql.client.sslmode=$mode > "${TMP_DIR}/${mode}-nosecret.yaml" 2>/dev/null; then
        echo "expected sslmode=$mode without sslRootCertSecret.name to be rejected at render time"
        exit 1
    fi
done

# An unsupported mode still fails fast.
if render --set global.postgresql.client.sslmode=bogus > "${TMP_DIR}/bogus.yaml" 2>/dev/null; then
    echo "expected sslmode=bogus to be rejected at render time"
    exit 1
fi

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

# --- CA delivery fixtures (owned by this task; Tasks 5 and 6 extend the counts) ---
# tenant-api is conditional on global.enableMultiTenants (default false) in
# magda-core's Chart.yaml, so it must be explicitly enabled here or one of the
# four Node CA mounts this task wires would be silently absent from the count.
# combined-db.magda-postgres.backupRestore.backup.enabled is likewise off by
# default (magda-postgres/values.yaml), so the backup CronJob (Task 5) must be
# switched on here too, or its CA mount goes uncounted. useCombinedDb defaults
# true, so the in-scope magda-postgres instance is combined-db's, not one of
# the per-service *-db charts' own (condition-gated, normally off) instances.
# registry-api.deployments.readOnly.enable is off by default too (registry-api
# only ships its `full` Deployment out of the box), so the read-only Deployment
# (Task 6's second registry-api mount) must be switched on here or the count
# undershoots by one.
render --set global.postgresql.client.sslmode=verify-full \
       --set global.postgresql.client.sslRootCertSecret.name=my-ca \
       --set global.enableMultiTenants=true \
       --set combined-db.magda-postgres.backupRestore.backup.enabled=true \
       --set registry-api.deployments.readOnly.enable=true \
       > "${TMP_DIR}/ca.yaml"

# Secret projection: the configured key is remapped to the constant filename root.crt.
# (secretName is rendered through `quote`, hence the literal quotes below.)
grep -q 'secretName: "my-ca"' "${TMP_DIR}/ca.yaml" || { echo "expected CA secret volume"; exit 1; }
grep -q 'path: root.crt' "${TMP_DIR}/ca.yaml" || { echo "expected CA key remapped to root.crt"; exit 1; }
grep -q 'mountPath: /etc/magda/postgresql-ca' "${TMP_DIR}/ca.yaml" || { echo "expected CA mountPath"; exit 1; }
grep -A1 'name: "PGSSLROOTCERT"' "${TMP_DIR}/ca.yaml" | grep -q '/etc/magda/postgresql-ca/root.crt' \
  || { echo "expected PGSSLROOTCERT to point at the mounted CA"; exit 1; }

# `system` is never a valid PGSSLROOTCERT value in this chart, for ANY client class:
# libpq < 16 in the migrator image cannot use it, and a Node pod would
# fs.readFileSync("system") and crash on boot. Assert its absence, don't tolerate it.
if grep -A1 'name: "PGSSLROOTCERT"' "${TMP_DIR}/ca.yaml" | grep -q 'value: "system"'; then
    echo "PGSSLROOTCERT=system must never be rendered"; exit 1
fi

# 12 in-scope workloads mount the CA; registry-api ships two Deployments (full+ro),
# so expect 13 mountPath occurrences total once Tasks 5 and 6 are done. Node subset check:
mounts=$(grep -c 'mountPath: /etc/magda/postgresql-ca' "${TMP_DIR}/ca.yaml")
[ "$mounts" -ge 4 ] || { echo "expected >=4 CA mounts after Node wiring, got $mounts"; exit 1; }

# --- No-secret render: sslmode=require, since verify-* without a secret now fails at render ---
render --set global.postgresql.client.sslmode=require > "${TMP_DIR}/noca.yaml"
if grep -q 'postgresql-ca' "${TMP_DIR}/noca.yaml"; then
    echo "expected no CA volume/mount/env without a CA secret"; exit 1
fi

# With a secret, every libpq consumer gets the mounted path.
# Total CA mounts across all 12 in-scope workloads (registry-api = 2 Deployments) == 13.
mounts=$(grep -c 'mountPath: /etc/magda/postgresql-ca' "${TMP_DIR}/ca.yaml")
[ "$mounts" -ge 11 ] || { echo "expected >=11 CA mounts after libpq wiring, got $mounts"; exit 1; }

# Decision 1 (LIBPQ_FALLBACK=secret-required): with no CA secret, NOTHING carries
# PGSSLROOTCERT — no mounted path, and no `system` fallback for any client class.
if grep -q 'name: "PGSSLROOTCERT"' "${TMP_DIR}/noca.yaml"; then
    echo "expected no PGSSLROOTCERT anywhere in the no-secret render"; exit 1
fi
# The literal `system` must never be emitted (libpq < 16 in the migrator image; Node would
# fs.readFileSync("system") and crash on boot).
if grep -A1 'name: "PGSSLROOTCERT"' "${TMP_DIR}/ca.yaml" | grep -q 'value: "system"'; then
    echo "PGSSLROOTCERT=system must never be rendered"; exit 1
fi

# registry-api carries both sslmode and sslrootcert in its JDBC URL when a CA is set.
grep -q 'sslmode=verify-full' "${TMP_DIR}/ca.yaml" || { echo "expected JDBC sslmode=verify-full"; exit 1; }
grep -q 'sslrootcert=/etc/magda/postgresql-ca/root.crt' "${TMP_DIR}/ca.yaml" \
  || { echo "expected JDBC sslrootcert param"; exit 1; }
# The two params must be joined by the SAME separator the chart actually
# renders, not an assumed literal ampersand character. `mustToRawJson`
# HTML-escapes the ampersand to its JSON unicode escape sequence, and that
# escape is itself embedded in a YAML double-quoted scalar (registry-api's
# ConfigMap wraps deploy-application.conf as a JSON-ish string), so the
# backslash introducing the escape is itself escaped once more -- the bytes
# that land in the rendered manifest double that backslash. Typesafe Config
# (HOCON) decodes what's left after YAML-unescaping back into a literal
# ampersand for pgjdbc at runtime. This assertion locks the rendered bytes so
# a future change to the escaping (e.g. switching JSON encoders) fails loudly
# here instead of only breaking registry-api's TLS in production.
grep -qF 'sslmode=verify-full\\u0026sslrootcert=/etc/magda/postgresql-ca/root.crt' "${TMP_DIR}/ca.yaml" \
  || { echo "expected registry-api's JDBC URL to join sslmode and sslrootcert with the chart's actual escaped separator (\\\\u0026)"; exit 1; }
# Without a CA secret, no sslrootcert is appended. (Reachable only for sslmode
# disable/require — verify-* without a secret is rejected at render time.)
if grep -q 'sslrootcert=' "${TMP_DIR}/noca.yaml"; then
  echo "expected no sslrootcert when no CA secret"; exit 1
fi
# registry-api ships two Deployments; total CA mounts now 13.
mounts=$(grep -c 'mountPath: /etc/magda/postgresql-ca' "${TMP_DIR}/ca.yaml")
[ "$mounts" -eq 13 ] || { echo "expected exactly 13 CA mounts, got $mounts"; exit 1; }

# --- magda-postgres major-upgrade dump/restore Jobs: deliberately CA-free -------
#
# These two Jobs are in-cluster-only major-upgrade machinery (dump/restore of the
# PREVIOUS major's local instance during an in-place PG13->17 upgrade); a
# verify-* deployment targets an EXTERNAL managed DB, where these Jobs never
# run, so wiring a client CA into them would be dead config. See
# docs/design/2026-08-10-db-ca-verification-design.md §5.
#
# The Jobs are gated behind `majorUpgrade.enabled` (off by default), so a render
# that doesn't turn that flag on would make an "absence of CA mount" assertion
# pass vacuously -- it would prove nothing, because the Jobs wouldn't be in the
# output to check in the first place. Render with the flag on AND a CA secret
# configured (the case where an accidental mount could appear), confirm the
# Jobs are actually present, and only then assert they carry none of the CA
# wiring.
render --set combined-db.magda-postgres.majorUpgrade.enabled=true \
       --set combined-db.magda-postgres.majorUpgrade.sourceHost=old-db \
       --set global.postgresql.client.sslmode=verify-full \
       --set global.postgresql.client.sslRootCertSecret.name=my-ca \
       > "${TMP_DIR}/upgrade.yaml"

# Non-vacuousness check: confirm both Jobs actually rendered under these values.
for job_name in major-upgrade-dump major-upgrade-restore; do
    if ! grep -q "name: \".*-${job_name}\"" "${TMP_DIR}/upgrade.yaml"; then
        echo "expected the ${job_name} Job to render with majorUpgrade.enabled=true (the CA-absence check below would be vacuous otherwise)"
        exit 1
    fi
done

# The two major-upgrade Jobs are in-cluster-only and deliberately carry NO CA
# mount, volume, or PGSSLROOTCERT env var. Split the render into per-resource
# documents (helm separates each rendered resource with a `---` line) and check
# only the documents whose Job name matches *-major-upgrade-(dump|restore) --
# a whole-file grep would also match CA wiring belonging to unrelated
# workloads that render later in the same manifest.
if awk -v RS='\n---\n' '
    /name: ".*-major-upgrade-(dump|restore)"/ {
      if ($0 ~ /postgresql-ca/ || $0 ~ /PGSSLROOTCERT/) { print; hit=1 }
    }
    END { exit hit ? 0 : 1 }
' "${TMP_DIR}/upgrade.yaml"; then
  echo "major-upgrade Jobs must not mount the DB client CA"; exit 1
fi

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
