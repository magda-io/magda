#!/usr/bin/env bash

# Regression test for migrate.sh: a CREATE DATABASE that fails because the
# database already exists (every re-run / upgrade) must NOT abort the migrator
# under `set -e`; Flyway must still run. Guards the bug where adding
# `set -euo pipefail` caused the expected CREATE DATABASE failure to kill the
# script before migration.
#
# No real PostgreSQL/Flyway is needed: `psql` is shimmed on PATH to fail the
# CREATE DATABASE (and the schema_version lookup), and a `flyway` stub records
# that it was invoked.

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

echo "migrate idempotency check passed (CREATE DATABASE failure tolerated, Flyway still ran)"
