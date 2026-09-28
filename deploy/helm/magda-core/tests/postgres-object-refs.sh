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

# Magda hands the postgresql subchart four object names it creates itself: the
# extended-config ConfigMap, the extra-env-vars ConfigMap, the initdb-scripts ConfigMap
# and the TLS certificate Secret. Three are resolved by the subchart through `tpl`, one
# (`primary.extraEnvVarsCM`) is not -- and which is which CHANGED between chart 10.9.1
# and 16.7.24, in both directions. Every one of those names is a string agreement between
# two files, and a mismatch renders cleanly and fails only in the cluster.
#
# So: assert that every ConfigMap/Secret the DB StatefulSet references is actually created
# by the same release. This catches an unresolved "{{ ... }}" literal, a typo, and a
# rename applied in one file but not the other. It also catches the TLS Secret named by
# the `raw-certificates` volume (`secret.secretName`) -- the highest-value check flagged
# by review as previously missing entirely.
assert_no_dangling_refs () {
    local label="$1"; shift
    helm template refcheck "${CHART_DIR}" "$@" > "${TMP_DIR}/render.yaml"
    python3 - "${TMP_DIR}/render.yaml" "${label}" <<'PY'
import re, sys

path, label = sys.argv[1], sys.argv[2]
docs = open(path).read().split("\n---\n")

created = {"ConfigMap": set(), "Secret": set()}
sts_docs = []
for d in docs:
    km = re.search(r'^kind:\s*(\S+)', d, re.M)
    nm = re.search(r'^\s{0,2}name:\s*"?([^"\n]+?)"?\s*$', d, re.M)
    if not km:
        continue
    kind = km.group(1)
    if kind in created and nm:
        created[kind].add(nm.group(1))
    elif kind == "StatefulSet":
        sts_docs.append(d)

if not sts_docs:
    print("%s: FAIL - rendered no StatefulSet at all" % label); sys.exit(1)

# References the DB StatefulSet makes, and the kind each resolves to.
PATTERNS = [
    (r'configMap:\s*\n\s*name:\s*"?([^"\n]+?)"?\s*$', "ConfigMap"),
    (r'configMapRef:\s*\n\s*name:\s*"?([^"\n]+?)"?\s*$', "ConfigMap"),
    (r'secret:\s*\n\s*secretName:\s*"?([^"\n]+?)"?\s*$', "Secret"),
    (r'secretKeyRef:\s*\n\s*name:\s*"?([^"\n]+?)"?\s*$', "Secret"),
]

missing, checked = [], 0
for d in sts_docs:
    sts = (re.search(r'^\s{0,2}name:\s*"?([\w.-]+)"?', d, re.M) or [None, "?"])[1]
    for pat, kind in PATTERNS:
        for ref in re.findall(pat, d, re.M):
            checked += 1
            if "{{" in ref or "}}" in ref:
                missing.append((sts, kind, ref, "unresolved template string"))
            elif ref not in created[kind]:
                missing.append((sts, kind, ref, "not created by this release"))

if checked == 0:
    print("%s: FAIL - found no ConfigMap/Secret references to check" % label); sys.exit(1)

if missing:
    print("%s: FAIL - %d dangling reference(s):" % (label, len(missing)))
    for sts, kind, ref, why in missing:
        print("    StatefulSet/%s -> %s/%s : %s" % (sts, kind, ref, why))
    print("  Created ConfigMaps: %s" % sorted(created["ConfigMap"]))
    print("  Created Secrets:    %s" % sorted(created["Secret"]))
    print("  An unresolved template string means the subchart stopped running that value")
    print("  through `tpl` -- set it as a plain literal (see magda-postgres values.yaml).")
    sys.exit(1)

print("%s: all %d ConfigMap/Secret references resolve to created objects"
      % (label, checked))
PY
}

assert_no_dangling_refs "combined-db (default)"

# Per-service instances: `magda-postgres` is conditional on
# global.useInK8sDbInstance.<name>, so this is the only way the else-branch of
# the per-service DB wiring gets exercised at all. All five useInK8sDbInstance flags
# plus enableMultiTenants (which gates the tenant-db chart's inclusion at all) must be
# set together, or the DBs left on the combined/default path would render no
# StatefulSet, leaving those wrapper charts' own extraEnvVarsCM/certificatesSecret/etc.
# literals completely unexercised by this render (verified: flipping only
# registry-db's flag renders just 1 of the 5 per-service StatefulSets, not a false
# failure but a false sense of coverage -- the same false-coverage trap Task 7's
# brief hit with its selector test).
assert_no_dangling_refs "per-service (all five DBs)" \
    --set global.useCombinedDb=false \
    --set global.useInK8sDbInstance.authorization-db=true \
    --set global.useInK8sDbInstance.content-db=true \
    --set global.useInK8sDbInstance.registry-db=true \
    --set global.useInK8sDbInstance.session-db=true \
    --set global.useInK8sDbInstance.tenant-db=true \
    --set global.enableMultiTenants=true

assert_no_dangling_refs "custom privileged username" \
    --set global.postgresql.auth.username=magda_admin

echo "postgres object-reference checks passed"
