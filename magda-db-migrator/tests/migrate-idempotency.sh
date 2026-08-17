#!/usr/bin/env bash

# Regression tests for migrate.sh.
#
# Case 1: a CREATE DATABASE that fails because the database already exists (every
# re-run / upgrade) must NOT abort the migrator under `set -e`; Flyway must still
# run. Guards the bug where adding `set -euo pipefail` caused the expected CREATE
# DATABASE failure to kill the script before migration.
#
# Case 2: a legacy-history probe that fails because the database cannot be reached
# (connectivity/auth/TLS, e.g. the DB pod rolling while the post-upgrade hook runs)
# MUST abort, not be silently read as "no legacy history" — that would let
# `flyway migrate -baselineOnMigrate=true` baseline at Flyway's default version 1
# and re-apply every migration onto an already-migrated schema.
#
# No real PostgreSQL/Flyway is needed: `psql` is shimmed on PATH and a `flyway`
# stub records that it was invoked.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATE_SH="${SCRIPT_DIR}/../migrate.sh"

if [[ ! -f "${MIGRATE_SH}" ]]; then
    echo "cannot find migrate.sh at ${MIGRATE_SH}"
    exit 1
fi

FLYWAY_VERSION="7.15.0"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Fake FLYWAY_HOME: a flyway install dir with a `flyway` stub, and one sql db dir
# containing a migration script so the migrate loop reaches the Flyway step.
FLYWAY_HOME="${TMP_DIR}/flyway"
FLYWAY_DIR="${FLYWAY_HOME}/flyway-${FLYWAY_VERSION}"
mkdir -p "${FLYWAY_DIR}" "${FLYWAY_HOME}/sql/testdb"
echo "-- dummy migration" > "${FLYWAY_HOME}/sql/testdb/V1__init.sql"

FLYWAY_MARKER="${TMP_DIR}/flyway_invoked"
cat > "${FLYWAY_DIR}/flyway" <<EOF
#!/usr/bin/env bash
echo "flyway stub called: \$*"
touch "${FLYWAY_MARKER}"
exit 0
EOF
chmod +x "${FLYWAY_DIR}/flyway"

# psql shim: fail CREATE DATABASE (simulate "already exists") and the
# schema_version lookup (simulate no table); succeed otherwise.
BIN_DIR="${TMP_DIR}/bin"
mkdir -p "${BIN_DIR}"
cat > "${BIN_DIR}/psql" <<'EOF'
#!/usr/bin/env bash
args="$*"
if [[ "$args" == *"CREATE DATABASE"* ]]; then
    echo "ERROR:  database already exists" >&2
    exit 1
fi
if [[ "$args" == *"SELECT script"* ]]; then
    echo "ERROR:  relation \"schema_version\" does not exist" >&2
    exit 1
fi
exit 0
EOF
chmod +x "${BIN_DIR}/psql"

set +e
PATH="${BIN_DIR}:${PATH}" \
FLYWAY_HOME="${FLYWAY_HOME}" \
FLYWAY_VERSION="${FLYWAY_VERSION}" \
DB_HOST="db.example.test" \
PGUSER="magda_admin" \
PGPASSWORD="secret" \
CLIENT_USERNAME="client" \
CLIENT_PASSWORD="client_secret" \
    bash "${MIGRATE_SH}" > "${TMP_DIR}/out.log" 2>&1
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
    echo "FAIL: migrate.sh exited ${rc} despite CREATE DATABASE failing (expected 0)."
    echo "----- output -----"; cat "${TMP_DIR}/out.log"
    exit 1
fi

if [[ ! -f "${FLYWAY_MARKER}" ]]; then
    echo "FAIL: Flyway was never invoked; the failed CREATE DATABASE aborted the run."
    echo "----- output -----"; cat "${TMP_DIR}/out.log"
    exit 1
fi

echo "case 1 passed (CREATE DATABASE failure tolerated, Flyway still ran)"

# --- Case 2: an unreachable database must abort before Flyway runs -------------
# Same fixture, but the psql shim now fails the legacy-history probe the way a
# connectivity/auth/TLS failure does, rather than the way a missing table does.
FLYWAY_MARKER2="${TMP_DIR}/flyway_invoked_2"
cat > "${FLYWAY_DIR}/flyway" <<EOF
#!/usr/bin/env bash
echo "flyway stub called: \$*"
touch "${FLYWAY_MARKER2}"
exit 0
EOF
chmod +x "${FLYWAY_DIR}/flyway"

BIN_DIR2="${TMP_DIR}/bin2"
mkdir -p "${BIN_DIR2}"
cat > "${BIN_DIR2}/psql" <<'EOF'
#!/usr/bin/env bash
args="$*"
if [[ "$args" == *"CREATE DATABASE"* ]]; then
    echo "ERROR:  database already exists" >&2
    exit 1
fi
if [[ "$args" == *"to_regclass"* ]]; then
    echo "psql: error: connection to server at \"db.example.test\" failed: Connection refused" >&2
    exit 2
fi
exit 0
EOF
chmod +x "${BIN_DIR2}/psql"

set +e
PATH="${BIN_DIR2}:${PATH}" \
FLYWAY_HOME="${FLYWAY_HOME}" \
FLYWAY_VERSION="${FLYWAY_VERSION}" \
DB_HOST="db.example.test" \
PGUSER="magda_admin" \
PGPASSWORD="secret" \
CLIENT_USERNAME="client" \
CLIENT_PASSWORD="client_secret" \
    bash "${MIGRATE_SH}" > "${TMP_DIR}/out2.log" 2>&1
rc=$?
set -e

if [[ $rc -eq 0 ]]; then
    echo "FAIL: migrate.sh exited 0 despite being unable to query the database."
    echo "----- output -----"; cat "${TMP_DIR}/out2.log"
    exit 1
fi

if [[ -f "${FLYWAY_MARKER2}" ]]; then
    echo "FAIL: Flyway ran even though the legacy-history probe could not reach the database;"
    echo "      it would have baselined at version 1 and re-applied every migration."
    echo "----- output -----"; cat "${TMP_DIR}/out2.log"
    exit 1
fi

if ! grep -q "Connection refused" "${TMP_DIR}/out2.log"; then
    echo "FAIL: the underlying psql error was swallowed instead of being reported."
    echo "----- output -----"; cat "${TMP_DIR}/out2.log"
    exit 1
fi

echo "case 2 passed (unreachable database aborts the migrator before Flyway runs)"

# --- Case 3: the Flyway JDBC URL must carry sslmode/sslrootcert as URL params --
# (hybrid-client finding: Flyway connects via pgjdbc, which reads neither
# PGSSLMODE nor PGSSLROOTCERT from the environment. migrate.sh must place both
# in the JDBC URL -url= it passes to Flyway, using the same `?`/`&` separator
# rules regardless of which of the two are set, so a `verify-*` mode always has
# a CA to check the server certificate against.)
#
# The flyway stub is extended here to record its full argv (one arg per line,
# via `printf '%s\n' "$@"`) so the exact `-url=` value can be inspected.
FLYWAY_ARGV_FILE="${TMP_DIR}/flyway_argv"
cat > "${FLYWAY_DIR}/flyway" <<EOF
#!/usr/bin/env bash
echo "flyway stub called: \$*"
printf '%s\n' "\$@" > "${FLYWAY_ARGV_FILE}"
exit 0
EOF
chmod +x "${FLYWAY_DIR}/flyway"

# psql shim: tolerate "already exists" like the other cases; succeed (empty
# result) on every probe so the run falls straight through to Flyway migrate
# without a legacy-history baseline muddying the argv capture.
BIN_DIR3="${TMP_DIR}/bin3"
mkdir -p "${BIN_DIR3}"
cat > "${BIN_DIR3}/psql" <<'EOF'
#!/usr/bin/env bash
args="$*"
if [[ "$args" == *"CREATE DATABASE"* ]]; then
    echo "ERROR:  database already exists" >&2
    exit 1
fi
exit 0
EOF
chmod +x "${BIN_DIR3}/psql"

extract_url () {
    # argv was recorded one-arg-per-line, so the -url= arg is a whole line.
    grep '^-url=' "${FLYWAY_ARGV_FILE}" | sed 's/^-url=//'
}

# 3a: both PGSSLMODE and PGSSLROOTCERT exported -> both appear, joined by `&`.
rm -f "${FLYWAY_ARGV_FILE}"
set +e
PATH="${BIN_DIR3}:${PATH}" \
FLYWAY_HOME="${FLYWAY_HOME}" \
FLYWAY_VERSION="${FLYWAY_VERSION}" \
DB_HOST="db.example.test" \
PGUSER="magda_admin" \
PGPASSWORD="secret" \
CLIENT_USERNAME="client" \
CLIENT_PASSWORD="client_secret" \
PGSSLMODE="verify-full" \
PGSSLROOTCERT="/etc/magda/postgresql-ca/root.crt" \
    bash "${MIGRATE_SH}" > "${TMP_DIR}/out3.log" 2>&1
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
    echo "FAIL: migrate.sh exited ${rc} with PGSSLMODE+PGSSLROOTCERT set (expected 0)."
    echo "----- output -----"; cat "${TMP_DIR}/out3.log"
    exit 1
fi
if [[ ! -f "${FLYWAY_ARGV_FILE}" ]]; then
    echo "FAIL: flyway was never invoked; cannot check the JDBC URL."
    echo "----- output -----"; cat "${TMP_DIR}/out3.log"
    exit 1
fi
url="$(extract_url)"
expected_url="jdbc:postgresql://db.example.test/testdb?sslmode=verify-full&sslrootcert=/etc/magda/postgresql-ca/root.crt"
if [[ "${url}" != "${expected_url}" ]]; then
    echo "FAIL: expected Flyway -url= to be '${expected_url}', got '${url}'"
    exit 1
fi

echo "case 3 passed (Flyway URL carries both sslmode and sslrootcert)"

# 3b: only PGSSLMODE exported (PGSSLROOTCERT unset) -> sslmode only, no stray
#     trailing/leading `?`/`&` and no `sslrootcert=` at all.
rm -f "${FLYWAY_ARGV_FILE}"
set +e
PATH="${BIN_DIR3}:${PATH}" \
FLYWAY_HOME="${FLYWAY_HOME}" \
FLYWAY_VERSION="${FLYWAY_VERSION}" \
DB_HOST="db.example.test" \
PGUSER="magda_admin" \
PGPASSWORD="secret" \
CLIENT_USERNAME="client" \
CLIENT_PASSWORD="client_secret" \
PGSSLMODE="verify-full" \
    bash "${MIGRATE_SH}" > "${TMP_DIR}/out4.log" 2>&1
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
    echo "FAIL: migrate.sh exited ${rc} with only PGSSLMODE set (expected 0)."
    echo "----- output -----"; cat "${TMP_DIR}/out4.log"
    exit 1
fi
if [[ ! -f "${FLYWAY_ARGV_FILE}" ]]; then
    echo "FAIL: flyway was never invoked; cannot check the JDBC URL."
    echo "----- output -----"; cat "${TMP_DIR}/out4.log"
    exit 1
fi
url="$(extract_url)"
expected_url="jdbc:postgresql://db.example.test/testdb?sslmode=verify-full"
if [[ "${url}" != "${expected_url}" ]]; then
    echo "FAIL: expected Flyway -url= to be '${expected_url}' with PGSSLROOTCERT unset, got '${url}'"
    exit 1
fi

echo "case 3b passed (Flyway URL carries sslmode only when PGSSLROOTCERT is unset, no stray separators)"

# --- Case 4: a PostgreSQL 15+ `public`-schema privilege failure (SQLSTATE 42501)
# during migrate must FAIL the migrator AND print actionable guidance, rather than
# leaving Flyway's raw error to look like a TLS/connectivity problem (#3770).
cat > "${FLYWAY_DIR}/flyway" <<'EOF'
#!/usr/bin/env bash
echo "flyway stub called: $*"
# Only the migrate step simulates the failure. Flyway prints the SQLSTATE on its
# own line ("SQL State  : 42501"), which is what migrate.sh keys off.
case "$*" in
  *migrate*)
    cat >&2 <<'FLYERR'
ERROR: Migration V1__init.sql failed
-------------------------------------
SQL State  : 42501
Error Code : 0
Message    : ERROR: permission denied for schema public
FLYERR
    exit 1
    ;;
esac
exit 0
EOF
chmod +x "${FLYWAY_DIR}/flyway"

# psql shim: succeed at everything (CREATE DATABASE ok; legacy-history probes
# return empty -> no baseline) so the run reaches the migrate step, where the
# flyway stub raises the 42501 failure.
BIN_DIR4="${TMP_DIR}/bin4"
mkdir -p "${BIN_DIR4}"
cat > "${BIN_DIR4}/psql" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "${BIN_DIR4}/psql"

set +e
PATH="${BIN_DIR4}:${PATH}" \
FLYWAY_HOME="${FLYWAY_HOME}" \
FLYWAY_VERSION="${FLYWAY_VERSION}" \
DB_HOST="db.example.test" \
PGUSER="magda_admin" \
PGPASSWORD="secret" \
CLIENT_USERNAME="client" \
CLIENT_PASSWORD="client_secret" \
    bash "${MIGRATE_SH}" > "${TMP_DIR}/out5.log" 2>&1
rc=$?
set -e

# The migrator must still fail — the error is translated, not swallowed.
if [[ $rc -eq 0 ]]; then
    echo "FAIL: migrate.sh exited 0 despite the migrate step failing with SQLSTATE 42501."
    echo "----- output -----"; cat "${TMP_DIR}/out5.log"
    exit 1
fi
# ...and it must surface the actionable guidance (keyed on the SQLSTATE).
for needle in "SQLSTATE 42501" "ALTER SCHEMA public OWNER TO" "NOT a TLS/SSL problem"; do
    if ! grep -qF "${needle}" "${TMP_DIR}/out5.log"; then
        echo "FAIL: expected the 42501 guidance to contain '${needle}', but it did not."
        echo "----- output -----"; cat "${TMP_DIR}/out5.log"
        exit 1
    fi
done

echo "case 4 passed (PG15+ public-schema 42501 failure surfaces actionable guidance)"

echo "migrate idempotency checks passed"
