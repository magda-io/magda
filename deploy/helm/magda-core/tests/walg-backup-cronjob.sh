#!/usr/bin/env bash

# Regression test for the wal-g backup CronJob (magda-postgres).
#
# Bug guarded: the inline backup script captured `$?` *after* a
# `RETAIN_BACKUP_NUM=...` assignment, so a failed `wal-g backup-push` was read as
# success -- the Job exited 0 AND `wal-g delete ... retain FULL` still pruned the
# existing backup chain. This test renders the real CronJob, extracts its command
# script, and runs it with `wal-g`/`envdir`/`adduser.sh` shimmed on PATH:
#
#   Case A (push fails): the script MUST exit non-zero and MUST NOT call
#                        `wal-g delete` (no pruning after a failed backup).
#   Case B (push ok):    the script MUST exit 0 and MUST call `wal-g delete` once.
#
# No real PostgreSQL/wal-g is needed. PyYAML is not assumed (see postgres-sslmode.sh).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"
CHART_DIR="${ROOT_DIR}/deploy/helm/magda-core"

if ! command -v helm >/dev/null 2>&1; then
    echo "helm is required for this test"; exit 1
fi
if [ ! -d "${CHART_DIR}/charts" ]; then
    echo "dependencies not built (run 'cd deploy && yarn update-all-charts'); skipping"
    exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 1. Render the combined-db CronJob with backup enabled.
RENDERED="${TMP_DIR}/rendered.yaml"
helm template walg-backup-test "${CHART_DIR}" \
    --set global.useCombinedDb=true \
    --set 'combined-db.magda-postgres.backupRestore.backup.enabled=true' \
    > "${RENDERED}"

# 2. Extract the CronJob's bash command (the `- |` block, 3rd command item) with
#    python3 stdlib only -- no PyYAML.
SCRIPT_RAW="${TMP_DIR}/backup.raw.sh"
python3 - "${RENDERED}" > "${SCRIPT_RAW}" <<'PY'
import sys
docs = open(sys.argv[1]).read().split("\n---\n")
cron = next((d for d in docs
             if "kind: CronJob" in d and "-backup-jobs" in d), None)
if cron is None:
    sys.stderr.write("FAIL: no backup CronJob rendered (is backup.enabled wired?)\n")
    sys.exit(1)
lines = cron.splitlines()
# Find the `- |` (or `- |-`) block scalar under command:; capture the more-indented body.
start = None
marker_indent = None
for i, ln in enumerate(lines):
    s = ln.strip()
    if s in ("- |", "- |-"):
        start = i + 1
        marker_indent = len(ln) - len(ln.lstrip())
        break
if start is None:
    sys.stderr.write("FAIL: could not locate the command block scalar\n")
    sys.exit(1)
body = []
for ln in lines[start:]:
    if ln.strip() == "":
        body.append("")
        continue
    indent = len(ln) - len(ln.lstrip())
    if indent <= marker_indent:
        break
    body.append(ln)
# Dedent by the smallest indent among non-blank lines.
non_blank = [l for l in body if l.strip()]
common = min((len(l) - len(l.lstrip()) for l in non_blank), default=0)
sys.stdout.write("\n".join(l[common:] if l.strip() else "" for l in body) + "\n")
PY

# 3. Rewrite absolute binary paths to bare names so PATH shims apply.
SCRIPT="${TMP_DIR}/backup.sh"
sed -e 's#/usr/local/bin/wal-g#wal-g#g' \
    -e 's#/usr/bin/envdir#envdir#g' \
    -e 's#/usr/local/bin/adduser.sh#adduser.sh#g' \
    "${SCRIPT_RAW}" > "${SCRIPT}"

# 4. Shims.
BIN_DIR="${TMP_DIR}/bin"
mkdir -p "${BIN_DIR}"

cat > "${BIN_DIR}/adduser.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat > "${BIN_DIR}/envdir" <<'EOF'
#!/usr/bin/env bash
# envdir DIR command args...  -> drop DIR, exec the rest.
shift
exec "$@"
EOF

# wal-g shim: backup-push honours WALG_PUSH_RC; delete records that it ran.
cat > "${BIN_DIR}/wal-g" <<EOF
#!/usr/bin/env bash
sub="\$1"
if [[ "\$sub" == "backup-push" ]]; then
    exit "\${WALG_PUSH_RC:-0}"
fi
if [[ "\$sub" == "delete" ]]; then
    touch "${TMP_DIR}/delete_called"
    echo "deleted"
    exit 0
fi
exit 0
EOF
chmod +x "${BIN_DIR}/adduser.sh" "${BIN_DIR}/envdir" "${BIN_DIR}/wal-g"

run_case () {
    local push_rc="$1"
    rm -f "${TMP_DIR}/delete_called"
    set +e
    PATH="${BIN_DIR}:${PATH}" WALG_PUSH_RC="${push_rc}" \
        bash "${SCRIPT}" > "${TMP_DIR}/case.log" 2>&1
    local rc=$?
    set -e
    echo "${rc}"
}

# Case A: backup-push fails.
RC_A="$(run_case 1)"
if [[ "${RC_A}" == "0" ]]; then
    echo "FAIL (case A): script exited 0 despite backup-push failing"
    cat "${TMP_DIR}/case.log"; exit 1
fi
if [[ -f "${TMP_DIR}/delete_called" ]]; then
    echo "FAIL (case A): 'wal-g delete' pruned backups after a failed backup-push"
    cat "${TMP_DIR}/case.log"; exit 1
fi
echo "case A passed (failed backup-push -> Job fails, no pruning)"

# Case B: backup-push succeeds.
RC_B="$(run_case 0)"
if [[ "${RC_B}" != "0" ]]; then
    echo "FAIL (case B): script exited ${RC_B} despite backup-push succeeding"
    cat "${TMP_DIR}/case.log"; exit 1
fi
if [[ ! -f "${TMP_DIR}/delete_called" ]]; then
    echo "FAIL (case B): retention 'wal-g delete' was not run after a successful backup"
    cat "${TMP_DIR}/case.log"; exit 1
fi
echo "case B passed (successful backup-push -> Job succeeds, retention runs)"

echo "wal-g backup CronJob checks passed"
