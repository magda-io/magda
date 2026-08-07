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

# ---------------------------------------------------------------------------
# 1. Off by default, on both render paths. A one-shot migration that renders
#    on every install would dump and restore on deployments that have nothing
#    to migrate. This is checked on BOTH the combined-db path and the
#    per-service path (all five DBs on their own instances), because
#    `majorUpgrade` is a per-`magda-postgres`-instance value: proving it is
#    off under combined-db says nothing about the five other instantiations
#    of the same subchart.
# ---------------------------------------------------------------------------
helm template mu "${CHART_DIR}" > "${TMP_DIR}/off-combined.yaml"
if grep -q "major-upgrade" "${TMP_DIR}/off-combined.yaml"; then
    echo "FAIL: majorUpgrade resources rendered without being enabled (combined-db, default)"
    exit 1
fi

helm template mu "${CHART_DIR}" \
    --set global.useCombinedDb=false \
    --set global.useInK8sDbInstance.authorization-db=true \
    --set global.useInK8sDbInstance.content-db=true \
    --set global.useInK8sDbInstance.registry-db=true \
    --set global.useInK8sDbInstance.session-db=true \
    --set global.useInK8sDbInstance.tenant-db=true \
    --set global.enableMultiTenants=true \
    > "${TMP_DIR}/off-per-service.yaml"
if grep -q "major-upgrade" "${TMP_DIR}/off-per-service.yaml"; then
    echo "FAIL: majorUpgrade resources rendered without being enabled (per-service, all five DBs)"
    exit 1
fi
echo "majorUpgrade gating: renders nothing on either render path when disabled"

# ---------------------------------------------------------------------------
# 2. sourceHost is required when enabled -- an unset source means the dump
#    Job would fail in-cluster, after the upgrade has already started.
# ---------------------------------------------------------------------------
if helm template mu "${CHART_DIR}" \
    --set combined-db.magda-postgres.majorUpgrade.enabled=true \
    --set combined-db.magda-postgres.majorUpgrade.sourceHost="" \
    > /dev/null 2> "${TMP_DIR}/sourcehost.err"; then
    echo "FAIL: expected render to fail when majorUpgrade.sourceHost is empty"
    exit 1
fi
if ! grep -q "sourceHost" "${TMP_DIR}/sourcehost.err"; then
    echo "FAIL: the empty-sourceHost failure must name the setting"
    cat "${TMP_DIR}/sourcehost.err"
    exit 1
fi
echo "majorUpgrade.sourceHost: required, and the render failure names it"

# ---------------------------------------------------------------------------
# 3. Enabled: exactly three objects per instance, in the right hook phases
#    and weights, PVC/claimName agreement computed (not hardcoded) from the
#    rendered YAML, pod/container securityContext present on both Jobs, and
#    both Jobs' embedded shell scripts are syntactically valid. Run once on
#    the combined-db path (one instance) and once on the per-service path
#    (five instances), so the per-instance grouping logic is exercised for
#    real on more than a single, possibly-coincidental match.
# ---------------------------------------------------------------------------
assert_majorupgrade_render () {
    local label="$1" expected_instances="$2"; shift 2
    helm template mu "${CHART_DIR}" "$@" > "${TMP_DIR}/on.yaml"

    # Every image must come from the Magda mirror, never bitnami's.
    if grep -E 'image: "?docker\.io/bitnami|image: "?bitnami/' "${TMP_DIR}/on.yaml"; then
        echo "${label}: FAIL - a bitnami image escaped the Magda mirror"
        exit 1
    fi

    python3 - "${TMP_DIR}/on.yaml" "${label}" "${expected_instances}" <<'PY'
import re
import subprocess
import sys
import tempfile

path, label, expected_instances = sys.argv[1], sys.argv[2], int(sys.argv[3])
text = open(path).read()
docs = text.split("\n---\n")

def top(doc, key):
    """The single top-level (metadata) value for `key`, or None.

    Matches at 0-2 leading spaces only, so it cannot pick up a same-named key
    nested deeper in the document (e.g. a container's own `name:`).
    """
    m = re.search(r'^\s{0,2}%s:\s*"?([^"\n]+?)"?\s*$' % re.escape(key), doc, re.M)
    return m.group(1) if m else None

def hook_annotations(doc):
    """(hook, weight) from the QUOTED `"helm.sh/hook[-weight]"` annotation keys.

    The rendered YAML quotes the annotation KEY, not (for `hook`) its value:
        "helm.sh/hook": pre-upgrade
        "helm.sh/hook-weight": "-10"
    A grep/regex for the unquoted form `helm.sh/hook:` would silently match
    nothing and let every assertion built on it pass vacuously.
    """
    hook_m = re.findall(r'^\s*"helm\.sh/hook":\s*([^\n]+?)\s*$', doc, re.M)
    weight_m = re.findall(r'^\s*"helm\.sh/hook-weight":\s*"?(-?\d+)"?\s*$', doc, re.M)
    if len(hook_m) != 1 or len(weight_m) != 1:
        return None, None
    return hook_m[0], int(weight_m[0])

def delete_policies(doc):
    """The set of policies in the single `"helm.sh/hook-delete-policy"` annotation.

    Returns None if the annotation is absent or appears more than once, which
    callers must treat as a hard failure rather than "nothing to check".
    """
    m = re.findall(r'^\s*"helm\.sh/hook-delete-policy":\s*"?([^"\n]+?)"?\s*$', doc, re.M)
    if len(m) != 1:
        return None
    return set(p.strip() for p in m[0].split(","))

def raw_blocks(doc, header):
    """Raw text of every mapping that immediately follows a line matching
    `header` exactly (after stripping), bounded by the header's own indent
    (i.e. everything more-indented than the header, stopping at the first
    line back at or above the header's indent). Returns one entry per
    occurrence of `header` in the document, in document order.
    """
    lines = doc.splitlines()
    out = []
    for i, line in enumerate(lines):
        if line.strip() != header:
            continue
        indent = len(line) - len(line.lstrip(" "))
        block = []
        for line2 in lines[i + 1:]:
            if line2.strip() == "":
                block.append(line2)
                continue
            indent2 = len(line2) - len(line2.lstrip(" "))
            if indent2 <= indent:
                break
            block.append(line2)
        out.append("\n".join(block))
    return out

def extract_script(doc):
    """The literal block-scalar script body under `command:`'s `- |` entry.

    Returns None if there is not exactly one `- |` marker in the document --
    callers must treat that as a hard failure, not as "nothing to check".
    """
    lines = doc.splitlines()
    hits = [i for i, l in enumerate(lines) if l.strip() == "- |"]
    if len(hits) != 1:
        return None
    i = hits[0]
    marker_indent = len(lines[i]) - len(lines[i].lstrip(" "))
    content_indent = None
    out = []
    for line in lines[i + 1:]:
        if line.strip() == "":
            out.append("")
            continue
        indent = len(line) - len(line.lstrip(" "))
        if content_indent is None:
            if indent <= marker_indent:
                break
            content_indent = indent
        if indent < content_indent:
            break
        out.append(line[content_indent:])
    return "\n".join(out)

pvcs, dumps, restores, migrators = {}, {}, {}, []
for d in docs:
    kind = top(d, "kind")
    name = top(d, "name")
    if not kind or not name:
        continue
    if kind == "PersistentVolumeClaim" and name.endswith("-major-upgrade"):
        prefix = name[: -len("-major-upgrade")]
        pvcs[prefix] = (name, d)
    elif kind == "Job" and name.endswith("-major-upgrade-dump"):
        prefix = name[: -len("-major-upgrade-dump")]
        dumps[prefix] = (name, d)
    elif kind == "Job" and name.endswith("-major-upgrade-restore"):
        prefix = name[: -len("-major-upgrade-restore")]
        restores[prefix] = (name, d)
    elif kind == "Job" and name.endswith("-migrator"):
        hook, weight = hook_annotations(d)
        migrators.append((name, weight))

errs = []

prefixes = sorted(set(pvcs) | set(dumps) | set(restores))
if not prefixes:
    errs.append("rendered no majorUpgrade PVC/Job at all -- expected %d instance(s)" % expected_instances)
if len(prefixes) != expected_instances:
    errs.append("expected %d majorUpgrade instance(s), found %d: %s"
                 % (expected_instances, len(prefixes), prefixes))

if not migrators:
    errs.append("rendered no DB migrator Jobs -- cannot verify the restore runs before them")
if any(w is None for _, w in migrators):
    errs.append("a DB migrator Job's hook-weight annotation did not parse: %s"
                 % [n for n, w in migrators if w is None])

script_checks = 0
for prefix in prefixes:
    missing = [k for k, d in (("PVC", pvcs), ("dump Job", dumps), ("restore Job", restores)) if prefix not in d]
    if missing:
        errs.append("%s: missing %s" % (prefix, ", ".join(missing)))
        continue

    pvc_name, pvc_doc = pvcs[prefix]
    dump_name, dump_doc = dumps[prefix]
    restore_name, restore_doc = restores[prefix]

    # -- hook phase / weight --
    pvc_hook, pvc_weight = hook_annotations(pvc_doc)
    dump_hook, dump_weight = hook_annotations(dump_doc)
    restore_hook, restore_weight = hook_annotations(restore_doc)

    if (pvc_hook, pvc_weight) != ("pre-upgrade", -20):
        errs.append("%s: PVC expected pre-upgrade/-20, got %s/%s" % (pvc_name, pvc_hook, pvc_weight))
    if (dump_hook, dump_weight) != ("pre-upgrade", -10):
        errs.append("%s: dump Job expected pre-upgrade/-10, got %s/%s" % (dump_name, dump_hook, dump_weight))
    if (restore_hook, restore_weight) != ("post-upgrade", -10):
        errs.append("%s: restore Job expected post-upgrade/-10, got %s/%s" % (restore_name, restore_hook, restore_weight))

    # -- restore must sort before the DB migrators (relationship, not literals) --
    if restore_weight is not None:
        for mname, mweight in migrators:
            if mweight is not None and restore_weight >= mweight:
                errs.append("%s: restore weight %s must be below migrator %s's weight %s"
                             % (restore_name, restore_weight, mname, mweight))

    # -- hook-delete-policy: this is a CORRECTNESS property, not a style choice.
    # Both Jobs mount the staging PVC, so their pods hold it open through the
    # `pvc-protection` finalizer for as long as they exist. The PVC hook is
    # `before-hook-creation` (it has to be -- a hook resource that is not deleted
    # first cannot be re-created), so the NEXT upgrade tries to delete this PVC at
    # weight -20 and blocks forever on a leftover hook pod: reproduced on a live
    # cluster as "UPGRADE FAILED: pre-upgrade hooks failed: context deadline
    # exceeded", with the PVC's uid unchanged. `hook-succeeded` on both Jobs is what
    # frees the volume in time; dropping it silently re-breaks every repeat upgrade
    # and NO other test in this repo would notice.
    pvc_pol = delete_policies(pvc_doc)
    if pvc_pol != {"before-hook-creation"}:
        errs.append("%s: PVC hook-delete-policy must be exactly {before-hook-creation}, got %s"
                     % (pvc_name, pvc_pol))
    for jname, jdoc in ((dump_name, dump_doc), (restore_name, restore_doc)):
        pol = delete_policies(jdoc)
        if pol is None:
            errs.append("%s: expected exactly one hook-delete-policy annotation" % jname)
            continue
        if "hook-succeeded" not in pol:
            errs.append("%s: hook-delete-policy must include hook-succeeded (a leftover hook "
                        "pod pins the staging PVC and hangs the next upgrade), got %s"
                         % (jname, sorted(pol)))
        if "before-hook-creation" not in pol:
            errs.append("%s: hook-delete-policy must include before-hook-creation, got %s"
                         % (jname, sorted(pol)))
        if "hook-failed" in pol:
            errs.append("%s: hook-delete-policy must NOT include hook-failed -- a failed Job's "
                        "logs are the only record of what went wrong, got %s"
                         % (jname, sorted(pol)))

    # -- the repeat-upgrade no-op must be wired to the TARGET, not the source.
    # The dump Job's early exit is the whole reason a second `helm upgrade` is safe:
    # after the first one the Service named by majorUpgrade.sourceHost is gone, so a
    # dump could only fail. It must therefore consult the NEW instance.
    dump_target = re.search(r'- name: TARGET_PGHOST\n\s*value:\s*"?([^"\n]+?)"?\s*$', dump_doc, re.M)
    restore_pghost = re.search(r'- name: PGHOST\n\s*value:\s*"?([^"\n]+?)"?\s*$', restore_doc, re.M)
    dump_pghost = re.search(r'- name: PGHOST\n\s*value:\s*"?([^"\n]+?)"?\s*$', dump_doc, re.M)
    if not dump_target:
        errs.append("%s: no TARGET_PGHOST env var -- the dump Job cannot check the target's "
                    "completed-migration marker, so a repeat upgrade would try to dump from a "
                    "source Service that no longer exists" % dump_name)
    elif not restore_pghost:
        errs.append("%s: no PGHOST env var to compare TARGET_PGHOST against" % restore_name)
    elif dump_target.group(1) != restore_pghost.group(1):
        errs.append("%s: TARGET_PGHOST=%r must equal the restore Job's PGHOST=%r (both are the "
                    "new major's instance)" % (dump_name, dump_target.group(1), restore_pghost.group(1)))
    if dump_target and dump_pghost and dump_target.group(1) == dump_pghost.group(1):
        errs.append("%s: TARGET_PGHOST and PGHOST are both %r -- the dump Job would be dumping "
                    "from the new instance" % (dump_name, dump_pghost.group(1)))

    # -- the completion marker must live in the target DB, never on the staging
    # volume: the staging PVC is delete-recreated empty on every upgrade, so a file
    # sentinel on it can never provide idempotency (it shipped that way once).
    if "/staging/restore.complete" in restore_doc:
        errs.append("%s: the completion marker must not be a file on the staging volume -- that "
                    "PVC is destroyed and recreated on every upgrade" % restore_name)
    for jname, jdoc in ((dump_name, dump_doc), (restore_name, restore_doc)):
        if "magda_major_upgrade" not in jdoc:
            errs.append("%s: does not reference the public.magda_major_upgrade completion marker"
                         % jname)

    # -- PVC name / claimName agreement, computed from the rendered YAML --
    dump_claims = re.findall(r'claimName:\s*"?([^"\n]+?)"?\s*$', dump_doc, re.M)
    restore_claims = re.findall(r'claimName:\s*"?([^"\n]+?)"?\s*$', restore_doc, re.M)
    if len(dump_claims) != 1:
        errs.append("%s: expected exactly one claimName reference, found %d" % (dump_name, len(dump_claims)))
    if len(restore_claims) != 1:
        errs.append("%s: expected exactly one claimName reference, found %d" % (restore_name, len(restore_claims)))
    if len(dump_claims) == 1 and len(restore_claims) == 1:
        names = {pvc_name, dump_claims[0], restore_claims[0]}
        if len(names) != 1:
            errs.append("%s: PVC name / claimName mismatch -- PVC=%r dump claimName=%r restore claimName=%r"
                         % (prefix, pvc_name, dump_claims[0], restore_claims[0]))

    # -- securityContext on both Jobs: pod-level fsGroup, container-level uid/gid --
    for jname, jdoc in ((dump_name, dump_doc), (restore_name, restore_doc)):
        blocks = raw_blocks(jdoc, "securityContext:")
        if len(blocks) != 2:
            errs.append("%s: expected 2 securityContext blocks (pod, container), found %d"
                         % (jname, len(blocks)))
            continue
        pod_sc, container_sc = blocks
        if not re.search(r'^\s*fsGroup:\s*1001\s*$', pod_sc, re.M):
            errs.append("%s: pod securityContext missing fsGroup: 1001" % jname)
        if not re.search(r'^\s*fsGroupChangePolicy:\s*Always\s*$', pod_sc, re.M):
            errs.append("%s: pod securityContext missing fsGroupChangePolicy: Always" % jname)
        if not re.search(r'^\s*runAsUser:\s*1001\s*$', container_sc, re.M):
            errs.append("%s: container securityContext missing runAsUser: 1001" % jname)
        if not re.search(r'^\s*runAsGroup:\s*0\s*$', container_sc, re.M):
            errs.append("%s: container securityContext missing runAsGroup: 0" % jname)
        if not re.search(r'^\s*runAsNonRoot:\s*true\s*$', container_sc, re.M):
            errs.append("%s: container securityContext missing runAsNonRoot: true" % jname)
        if not re.search(r'^\s*allowPrivilegeEscalation:\s*false\s*$', container_sc, re.M):
            errs.append("%s: container securityContext missing allowPrivilegeEscalation: false" % jname)
        if not re.search(r'^\s*type:\s*RuntimeDefault\s*$', container_sc, re.M):
            errs.append("%s: container securityContext missing seccompProfile.type: RuntimeDefault" % jname)

    # -- rendered script shell syntax --
    for jname, jdoc in ((dump_name, dump_doc), (restore_name, restore_doc)):
        script = extract_script(jdoc)
        if script is None:
            errs.append("%s: expected exactly one `- |` script block in `command:`, found something else" % jname)
            continue
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sh", delete=False) as f:
            f.write(script)
            script_path = f.name
        proc = subprocess.run(["bash", "-n", script_path], capture_output=True, text=True)
        script_checks += 1
        if proc.returncode != 0:
            errs.append("%s: rendered script fails `bash -n`:\n%s" % (jname, proc.stderr.strip()))

if script_checks != 2 * len(prefixes):
    errs.append("expected to bash-syntax-check 2 scripts per instance (%d instance(s) -> %d), checked %d"
                 % (len(prefixes), 2 * len(prefixes), script_checks))

if errs:
    print("%s: FAIL" % label)
    for e in errs:
        print("    " + e)
    sys.exit(1)

print("%s: %d instance(s), hooks/weights/delete-policies/marker-wiring/claimName/securityContext/"
      "script-syntax all OK (%d scripts checked)"
      % (label, len(prefixes), script_checks))
PY
}

assert_majorupgrade_render "combined-db (default)" 1 \
    --set combined-db.magda-postgres.majorUpgrade.enabled=true

assert_majorupgrade_render "per-service (all five DBs)" 5 \
    --set global.useCombinedDb=false \
    --set global.useInK8sDbInstance.authorization-db=true \
    --set global.useInK8sDbInstance.content-db=true \
    --set global.useInK8sDbInstance.registry-db=true \
    --set global.useInK8sDbInstance.session-db=true \
    --set global.useInK8sDbInstance.tenant-db=true \
    --set global.enableMultiTenants=true \
    --set authorization-db.magda-postgres.majorUpgrade.enabled=true \
    --set content-db.magda-postgres.majorUpgrade.enabled=true \
    --set registry-db.magda-postgres.majorUpgrade.enabled=true \
    --set session-db.magda-postgres.majorUpgrade.enabled=true \
    --set tenant-db.magda-postgres.majorUpgrade.enabled=true

echo "postgres majorUpgrade mechanism checks passed"
