#!/bin/bash

set -euo pipefail

# FLYWAY_HOME is overridable so the script can be exercised by tests; in the
# container it stays /flyway, where the Flyway install and the mounted sql/ live.
FLYWAY_HOME="${FLYWAY_HOME:-/flyway}"
FLYWAY_VERSION="${FLYWAY_VERSION:-12.11.0}"
FLYWAY_DIR="${FLYWAY_HOME}/flyway-${FLYWAY_VERSION}"
MIGRATOR_USERNAME="${PGUSER:-postgres}"

if [[ ! -d "${FLYWAY_DIR}" ]]; then
    echo "Failed to locate Flyway install at ${FLYWAY_DIR}"
    exit 1
fi

cd "${FLYWAY_DIR}"

# Run a scalar SQL query against a specific database and print the single value.
# Prints an empty string (never aborts under `set -e`) if the query fails, e.g.
# because the database or the referenced table does not exist.
run_scalar () {
    psql -tA -h "${DB_HOST}" -c "${2}" "${1}" 2>/dev/null || true
}

for d in "${FLYWAY_HOME}"/sql/*; do
    if [[ -d "$d" ]]; then
        dbName="$(basename "$d")"
        dbUrl="jdbc:postgresql://${DB_HOST}/${dbName}"

        echo "Creating database ${dbName} (ignored if it already exists)"
        # CREATE DATABASE fails when the database already exists (every re-run / upgrade).
        # Under `set -e` that failure would abort the migrator before Flyway runs, so tolerate
        # it here and let the Flyway step below be the real gate for genuine connectivity/auth errors.
        if ! psql -h "${DB_HOST}" -c "CREATE DATABASE ${dbName} WITH OWNER = ${MIGRATOR_USERNAME} CONNECTION LIMIT = -1;" postgres; then
            echo "Database ${dbName} already exists (or could not be created); continuing to migration."
        fi

        # No-gap upgrade from Flyway 4. Deployments created before this image used
        # Flyway 4, whose history table is "schema_version". Flyway 5+ renamed it to
        # "flyway_schema_history" and no longer auto-upgrades the old table, so a plain
        # Flyway run would baseline at v1 and try to re-apply already-applied migrations
        # against the existing schema (which fails, e.g. "column ... already exists").
        # When the legacy table exists but the new one does not, baseline the new history
        # at the highest version already applied so only newer migrations are run.
        has_legacy="$(run_scalar "${dbName}" "SELECT to_regclass('public.schema_version') IS NOT NULL")"
        has_new="$(run_scalar "${dbName}" "SELECT to_regclass('public.flyway_schema_history') IS NOT NULL")"
        if [[ "${has_legacy}" == "t" && "${has_new}" != "t" ]]; then
            legacy_version="$(run_scalar "${dbName}" "SELECT version FROM schema_version WHERE success = true AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1")"
            if [[ -n "${legacy_version}" ]]; then
                echo "Detected legacy Flyway 4 history in ${dbName}; baselining flyway_schema_history at version ${legacy_version} (already-applied migrations are not re-run)."
                ./flyway baseline \
                    -url="${dbUrl}" \
                    -user="${MIGRATOR_USERNAME}" -password="${PGPASSWORD}" \
                    -baselineVersion="${legacy_version}" \
                    -baselineDescription="Baselined from Flyway 4 schema_version"
            fi
        fi

        echo "Migrating database ${dbName}..."
        # -ignoreMigrationPatterns="*:missing" is the Flyway 10+ replacement for the
        # removed -ignoreMissingMigrations flag: tolerate history entries whose files
        # are no longer present. (The legacy `-n` flag was dropped in Flyway 10+.)
        ./flyway migrate -ignoreMigrationPatterns="*:missing" -baselineOnMigrate=true \
            -url="${dbUrl}" \
            -locations="filesystem:${d}" \
            -user="${MIGRATOR_USERNAME}" -password="${PGPASSWORD}" \
            -placeholders.clientUserName="${CLIENT_USERNAME}" \
            -placeholders.clientPassword="${CLIENT_PASSWORD}"
    fi
done
