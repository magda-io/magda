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

# A Service whose selector matches no pod renders cleanly, passes `helm lint`, and
# produces a database that is simply unreachable. That is exactly what happened across
# the bitnami postgresql 10 -> 16 bump: the subchart stopped emitting `role: primary` in
# chart 12 and started emitting `app.kubernetes.io/component: primary`, while Magda's
# `magda.postgres-svc-mapping` kept selecting the old label.
#
# The assertion compares rendered output against rendered output and hardcodes no label
# names, so it keeps working across future subchart bumps and across the instance rename.
assert_selectors_match_pods () {
    local label="$1"; shift
    helm template selcheck "${CHART_DIR}" "$@" > "${TMP_DIR}/render.yaml"
    python3 - "${TMP_DIR}/render.yaml" "${label}" <<'PY'
import re, sys

path, label = sys.argv[1], sys.argv[2]
docs = open(path).read().split("\n---\n")

DB_SERVICES = {"authorization-db", "content-db", "registry-db", "session-db", "tenant-db"}

def block(doc, header, indent):
    """Collect `key: value` pairs from the mapping that follows `header`.

    A document can contain more than one line matching `header` (e.g. a
    StatefulSet has both `metadata.labels` and `spec.template.metadata.labels`).
    Try each occurrence in turn and return the first one whose following
    lines actually parse as a mapping at the requested indent, rather than
    assuming the first occurrence is the right one.
    """
    pad = " " * indent
    lines = doc.splitlines()
    for i, line in enumerate(lines):
        if line.strip() != header:
            continue
        out = {}
        for line2 in lines[i + 1:]:
            m = re.match(r'^%s([\w./-]+):\s*"?([^"\n]*?)"?\s*$' % pad, line2)
            if m:
                out[m.group(1)] = m.group(2)
            elif line2.strip() and not line2.startswith(pad):
                break
        if out:
            return out
    return {}

pod_label_sets, services, seen_services = [], {}, set()
for d in docs:
    km = re.search(r'^kind:\s*(\S+)', d, re.M)
    nm = re.search(r'^\s{0,2}name:\s*"?([\w.-]+)"?', d, re.M)
    if not km or not nm:
        continue
    kind, name = km.group(1), nm.group(1)
    if kind == "StatefulSet":
        # pod template labels live under spec.template.metadata.labels (6-space indent)
        labels = block(d, "labels:", 8)
        if labels:
            pod_label_sets.append((name, labels))
    elif kind == "Service" and name in DB_SERVICES:
        # Track that this Service was rendered at all, separately from whether
        # its selector parsed. A Service that rendered but whose selector block
        # failed to parse (e.g. a future indent change) must not just silently
        # drop out of the comparison below - that would shrink the checked set
        # instead of failing loudly, which is the exact silent-failure shape
        # this test exists to catch.
        seen_services.add(name)
        sel = block(d, "selector:", 4)
        if sel:
            services[name] = sel

if not pod_label_sets:
    print("%s: FAIL - rendered no PostgreSQL StatefulSet at all" % label); sys.exit(1)
if not services:
    print("%s: FAIL - rendered no *-db Services with a selector" % label); sys.exit(1)

unparsed = sorted(seen_services - set(services))
if unparsed:
    print("%s: FAIL - %d *-db Service(s) rendered but their selector block could not be parsed:"
          % (label, len(unparsed)))
    for svc in unparsed:
        print("    Service/%s rendered but `selector:` did not parse as a 4-space-indent mapping" % svc)
    sys.exit(1)

bad = []
for svc, sel in sorted(services.items()):
    hits = [n for n, labels in pod_label_sets
            if all(labels.get(k) == v for k, v in sel.items())]
    if len(hits) != 1:
        bad.append((svc, sel, hits))

if bad:
    print("%s: FAIL - %d Service selector(s) do not match exactly one pod template:"
          % (label, len(bad)))
    for svc, sel, hits in bad:
        print("    Service/%s selector %s matched %d pod template(s): %s"
              % (svc, sel, len(hits), hits or "none"))
    print("  Rendered pod templates:")
    for n, labels in pod_label_sets:
        print("    StatefulSet/%s %s" % (n, labels))
    print("  If this broke after a subchart bump, the subchart's pod labels changed and")
    print("  `magda.postgres-svc-mapping` in magda-core/templates/_helpers.tpl must follow.")
    sys.exit(1)

print("%s: all %d *-db Service selectors match exactly one pod template"
      % (label, len(services)))
PY
}

# Default: one combined-db instance, all five per-service Services pointed at it.
assert_selectors_match_pods "combined-db (default)"

# Per-service instances: `magda-postgres` is conditional on
# global.useInK8sDbInstance.<name>, so this is the only way the else-branch of
# magda.postgres-svc-mapping gets exercised at all. All five useInK8sDbInstance
# flags plus enableMultiTenants (which gates the tenant-db chart's inclusion at
# all) must be set together, or the DBs left on the combined/default path would
# render Services with selectors expecting a per-service pod that never renders.
assert_selectors_match_pods "per-service (all five DBs)" \
    --set global.useCombinedDb=false \
    --set global.useInK8sDbInstance.authorization-db=true \
    --set global.useInK8sDbInstance.content-db=true \
    --set global.useInK8sDbInstance.registry-db=true \
    --set global.useInK8sDbInstance.session-db=true \
    --set global.useInK8sDbInstance.tenant-db=true \
    --set global.enableMultiTenants=true

echo "postgres Service selector / pod label agreement checks passed"
