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
#
# Distinguishes "the query legitimately found nothing" from "could not talk to the
# database":
#   - a missing relation/database (expected: that is exactly what the legacy-history
#     probes below are testing for) prints nothing and returns 0;
#   - any other psql failure — connectivity, auth, TLS negotiation, a DB pod still
#     rolling — prints the error and returns non-zero so the caller can abort.
# Swallowing the second kind would let the legacy-history detection below silently
# conclude "no legacy Flyway 4 history", after which `flyway migrate
# -baselineOnMigrate=true` baselines at Flyway's DEFAULT version 1 and re-applies
# V1_1..Vn onto an already-migrated schema, permanently poisoning
# flyway_schema_history.
run_scalar () {
    local db="${1}" query="${2}" out rc err_file
    err_file="$(mktemp)"
    set +e
    out="$(psql -tA -h "${DB_HOST}" -c "${query}" "${db}" 2>"${err_file}")"
    rc=$?
    set -e
    if [[ ${rc} -ne 0 ]]; then
        if grep -qiE '(relation|database|table|schema|column)[^:]*does not exist' "${err_file}"; then
            # Nothing to report, and nothing wrong: the object simply isn't there.
            rm -f "${err_file}"
            return 0
        fi
        echo "Failed to query database ${db} (psql exited ${rc}):" >&2
        cat "${err_file}" >&2
        rm -f "${err_file}"
        return 1
    fi
    rm -f "${err_file}"
    printf '%s' "${out}"
}

# Run the Flyway CLI and, on the PostgreSQL 15+ `public`-schema privilege failure,
# translate Flyway's raw error into actionable guidance instead of leaving it to
# look like a TLS/connectivity problem.
#
# PostgreSQL 15 removed the implicit CREATE grant every role used to have on a
# database's `public` schema. A migrator user that does not own — or hold CREATE
# on — the target database's `public` schema now connects fine (password + TLS
# both pass) and then fails mid-migration with `permission denied for schema
# public`. Because that lands immediately after a fully established and — under
# sslmode=verify-ca/verify-full — certificate-verified connection, it is very
# easy to misdiagnose as an SSL/CA problem. It is not. See magda-io/magda#3770.
#
# Matched on the SQLSTATE (`42501`, insufficient_privilege), NOT the message text
# `permission denied for schema public`: the SQLSTATE is stable, the message is
# localised by the server's `lc_messages`. (Same rationale as #3744.)
run_flyway () {
    local db="${1}"; shift
    local out_file rc
    out_file="$(mktemp)"
    set +e
    ./flyway "$@" 2>&1 | tee "${out_file}"
    rc=${PIPESTATUS[0]}
    set -e
    if [[ ${rc} -ne 0 ]]; then
        if grep -qE 'SQL State[[:space:]]*:[[:space:]]*42501' "${out_file}"; then
            {
                echo ""
                echo "=============================================================================="
                echo "The migrator connected to database \"${db}\" successfully but is not permitted"
                echo "to create objects in its \"public\" schema (PostgreSQL SQLSTATE 42501,"
                echo "insufficient_privilege). This is NOT a TLS/SSL problem -- the connection was"
                echo "established. Since PostgreSQL 15, only the database owner, or a role granted"
                echo "CREATE on the schema, may create objects in \"public\"."
                echo ""
                echo "Grant the migrator user \"${MIGRATOR_USERNAME}\" the privilege on database"
                echo "\"${db}\" -- run as that database's owner or a superuser:"
                echo ""
                echo "    ALTER SCHEMA public OWNER TO \"${MIGRATOR_USERNAME}\";"
                echo "    -- or, without transferring ownership:"
                echo "    GRANT CREATE ON SCHEMA public TO \"${MIGRATOR_USERNAME}\";"
                echo ""
                echo "See https://github.com/magda-io/magda/issues/3770 and the deploy-to-aws /"
                echo "deploy-to-azure guides for details."
                echo "=============================================================================="
                echo ""
            } >&2
        fi
    fi
    rm -f "${out_file}"
    return ${rc}
}

for d in "${FLYWAY_HOME}"/sql/*; do
    if [[ -d "$d" ]]; then
        dbName="$(basename "$d")"
        # psql picks PGSSLMODE/PGSSLROOTCERT up from the environment on its own, but
        # Flyway connects via pgjdbc, which reads neither. Carry both in the URL so the
        # baseline and migrate invocations below use the same TLS settings as the psql
        # probes above — otherwise sslmode=verify-* would have no CA to verify against.
        dbUrl="jdbc:postgresql://${DB_HOST}/${dbName}"
        dbParams=""
        if [[ -n "${PGSSLMODE:-}" ]]; then
            dbParams="sslmode=${PGSSLMODE}"
        fi
        if [[ -n "${PGSSLROOTCERT:-}" ]]; then
            dbParams="${dbParams:+${dbParams}&}sslrootcert=${PGSSLROOTCERT}"
        fi
        dbUrl="${dbUrl}${dbParams:+?${dbParams}}"

        echo "Creating database ${dbName} (ignored if it already exists)"
        # CREATE DATABASE fails when the database already exists (every re-run / upgrade).
        # Under `set -e` that failure would abort the migrator before Flyway runs, so tolerate
        # it here and let the Flyway step below be the real gate for genuine connectivity/auth errors.
        #
        # dbName and MIGRATOR_USERNAME are SQL identifiers here, so quote them: unquoted,
        # PostgreSQL folds them to lower case, so a privileged username with upper case
        # (e.g. PGUSER=MyAdmin) would target the wrong role and CREATE DATABASE would fail
        # with "role does not exist". For the simple lower-case names in use today this is a
        # no-op. (The Flyway `-user=`/`-url=` flags below are connection parameters, not SQL,
        # and must stay unquoted.)
        if ! psql -h "${DB_HOST}" -c "CREATE DATABASE \"${dbName}\" WITH OWNER = \"${MIGRATOR_USERNAME}\" CONNECTION LIMIT = -1;" postgres; then
            echo "Database ${dbName} already exists (or could not be created); continuing to migration."
        fi

        # No-gap upgrade from Flyway 4. Deployments created before this image used
        # Flyway 4, whose history table is "schema_version". Flyway 5+ renamed it to
        # "flyway_schema_history" and no longer auto-upgrades the old table, so a plain
        # Flyway run would baseline at v1 and try to re-apply already-applied migrations
        # against the existing schema (which fails, e.g. "column ... already exists").
        # When the legacy table exists but the new one does not, baseline the new history
        # at the last-installed version so only newer migrations are run.
        #
        # A failed probe must never be mistaken for "no legacy history": that would
        # skip the baseline below and let Flyway baseline at its default version 1,
        # re-applying already-applied migrations. Abort instead — the next run (or a
        # retried hook) can try again against a healthy database.
        if ! has_legacy="$(run_scalar "${dbName}" "SELECT to_regclass('public.schema_version') IS NOT NULL")"; then
            echo "Aborting: could not determine whether ${dbName} has a legacy Flyway 4 history table." >&2
            exit 1
        fi
        if ! has_new="$(run_scalar "${dbName}" "SELECT to_regclass('public.flyway_schema_history') IS NOT NULL")"; then
            echo "Aborting: could not determine whether ${dbName} has a flyway_schema_history table." >&2
            exit 1
        fi
        if [[ "${has_legacy}" == "t" && "${has_new}" != "t" ]]; then
            # `ORDER BY installed_rank DESC LIMIT 1` is the LAST-INSTALLED version, not
            # necessarily the numerically highest. They coincide for Magda's history,
            # which has only ever been applied in version order.
            if ! legacy_version="$(run_scalar "${dbName}" "SELECT version FROM schema_version WHERE success = true AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1")"; then
                echo "Aborting: ${dbName} has a legacy Flyway 4 history table but its last-installed version could not be read; baselining without it would re-apply every migration." >&2
                exit 1
            fi
            if [[ -n "${legacy_version}" ]]; then
                echo "Detected legacy Flyway 4 history in ${dbName}; baselining flyway_schema_history at version ${legacy_version} (already-applied migrations are not re-run)."
                run_flyway "${dbName}" baseline \
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
        run_flyway "${dbName}" migrate -ignoreMigrationPatterns="*:missing" -baselineOnMigrate=true \
            -url="${dbUrl}" \
            -locations="filesystem:${d}" \
            -user="${MIGRATOR_USERNAME}" -password="${PGPASSWORD}" \
            -placeholders.clientUserName="${CLIENT_USERNAME}" \
            -placeholders.clientPassword="${CLIENT_PASSWORD}"
    fi
done
