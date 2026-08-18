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

# wal-g shim, parameterised by env:
#   backup-push honours WALG_PUSH_RC.
#   backup-list honours WALG_LIST_RC and emits WALG_BACKUP_COUNT `base_` rows the
#     way the real fork does (INFO on stderr, a header + one row per backup on
#     stdout) so the script's own count/awk logic is exercised for real.
#   delete records that it ran and honours WALG_DELETE_RC.
cat > "${BIN_DIR}/wal-g" <<EOF
#!/usr/bin/env bash
sub="\$1"
if [[ "\$sub" == "backup-push" ]]; then
    exit "\${WALG_PUSH_RC:-0}"
fi
if [[ "\$sub" == "backup-list" ]]; then
    echo "INFO: List backups from storages: [default]" >&2
    if [[ "\${WALG_LIST_RC:-0}" != "0" ]]; then
        echo "ERROR: simulated backup-list failure" >&2
        exit "\${WALG_LIST_RC}"
    fi
    n="\${WALG_BACKUP_COUNT:-0}"
    if [[ "\$n" -gt 0 ]]; then
        echo "backup_name                   modified             wal_file_name            storage_name"
        i=2
        while [[ "\$i" -lt \$((n + 2)) ]]; do
            printf 'base_0000000100000000000000%02d 2026-08-17T00:00:00Z 0000000100000000000000%02d default\n' "\$i" "\$i"
            i=\$((i + 1))
        done
    else
        echo "INFO: No backups found" >&2
    fi
    exit 0
fi
if [[ "\$sub" == "delete" ]]; then
    touch "${TMP_DIR}/delete_called"
    exit "\${WALG_DELETE_RC:-0}"
fi
exit 0
EOF
chmod +x "${BIN_DIR}/adduser.sh" "${BIN_DIR}/envdir" "${BIN_DIR}/wal-g"

# run_case PUSH_RC [BACKUP_COUNT] [LIST_RC] [DELETE_RC] -> prints the script exit code.
# The default retention (numberOfBackupToRetain) is 7.
run_case () {
    local push_rc="$1" count="${2:-0}" list_rc="${3:-0}" delete_rc="${4:-0}"
    rm -f "${TMP_DIR}/delete_called"
    set +e
    PATH="${BIN_DIR}:${PATH}" WALG_PUSH_RC="${push_rc}" WALG_BACKUP_COUNT="${count}" \
        WALG_LIST_RC="${list_rc}" WALG_DELETE_RC="${delete_rc}" \
        bash "${SCRIPT}" > "${TMP_DIR}/case.log" 2>&1
    local rc=$?
    set -e
    echo "${rc}"
}

deleted ()     { [[ -f "${TMP_DIR}/delete_called" ]]; }
log_has ()     { grep -qF "$1" "${TMP_DIR}/case.log"; }
fail ()        { echo "FAIL ($1): $2"; cat "${TMP_DIR}/case.log"; exit 1; }

# Case A: backup-push fails -> Job fails, no listing/pruning.
RC_A="$(run_case 1)"
[[ "${RC_A}" != "0" ]]  || fail "case A" "script exited 0 despite backup-push failing"
! deleted               || fail "case A" "'wal-g delete' pruned backups after a failed backup-push"
echo "case A passed (failed backup-push -> Job fails, no pruning)"

# Case B: backup-push ok, MORE backups than retained (9 > 7) -> trim runs, Job ok.
RC_B="$(run_case 0 9)"
[[ "${RC_B}" == "0" ]]  || fail "case B" "script exited ${RC_B} despite a successful backup"
deleted                 || fail "case B" "retention 'wal-g delete' did not run when count (9) exceeds retention (7)"
log_has "Trimming old backups Completed!" || fail "case B" "did not report a successful trim"
echo "case B passed (count > retention -> trim runs, Job succeeds)"

# Case C: backup-push ok, FEWER backups than retained (3 <= 7) -> no trim, benign, Job ok.
#   The whole point of #3763: this must be classified from the COUNT, never from
#   wal-g's output wording.
RC_C="$(run_case 0 3)"
[[ "${RC_C}" == "0" ]]  || fail "case C" "script exited ${RC_C} with fewer backups than the retention count"
! deleted               || fail "case C" "'wal-g delete' ran when count (3) is at/below retention (7)"
log_has "Nothing needs to be deleted!" || fail "case C" "did not report the benign no-trim outcome"
echo "case C passed (count <= retention -> no trim, benign, no prose match)"

# Case D: count > retention but the trim itself FAILS -> reported as an error,
#   delete was attempted, Job still exits 0 (a trim failure must not fail the backup).
RC_D="$(run_case 0 9 0 1)"
[[ "${RC_D}" == "0" ]]  || fail "case D" "a trim failure must not fail the backup Job (got ${RC_D})"
deleted                 || fail "case D" "'wal-g delete' was not attempted"
log_has "Error: failed to trim the old backups." || fail "case D" "a real trim failure was not reported as an error"
echo "case D passed (real trim failure -> error reported, Job still succeeds)"

# Case E: backup-push ok but backup-LIST fails -> reported as an error, NO trim on
#   an unknown count, Job still exits 0.
RC_E="$(run_case 0 0 1)"
[[ "${RC_E}" == "0" ]]  || fail "case E" "a backup-list failure must not fail the backup Job (got ${RC_E})"
! deleted               || fail "case E" "'wal-g delete' ran despite being unable to count backups"
log_has "could not list backups to evaluate retention" || fail "case E" "a backup-list failure was not reported"
echo "case E passed (backup-list failure -> error reported, no blind pruning)"

echo "wal-g backup CronJob checks passed"
