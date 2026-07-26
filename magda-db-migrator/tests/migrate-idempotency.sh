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

echo "migrate idempotency checks passed"
