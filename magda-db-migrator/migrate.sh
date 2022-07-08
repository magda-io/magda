#!/bin/bash

cd /flyway
tar xzf flyway-commandline-4.2.0-linux-x64.tar.gz
cd flyway-4.2.0
rm -Rf jre

del_completed_scripts () {
    echo "Attempt to exclude previously executed scripts..."
    local dbName=$(basename "${1}")
    local item=""
    local retCode=0
    local SUCCESS_SCRIPTS=""

    SUCCESS_SCRIPTS=`psql -t -A -h "${DB_HOST}" -c "SELECT script FROM schema_version WHERE success=TRUE" ${dbName} -t` || retCode=$?

    if [[ $retCode -eq "1" ]]; then
        echo "Failed to locate schema version info. Proceed to process all migration scripts..."
    else
        for item in ${1}/*; do
            item=$(basename "${item}")
            if [[ -f "${1}/${item}" ]] && [[ "${SUCCESS_SCRIPTS[*]}" =~ "${item}" ]]; then
                echo "Skip ${item} as it has been sccessfully run previously..."
                rm -Rf ${1}/${item}
            fi
        done
    fi
}

for d in /flyway/sql/*; do
    if [[ -d "$d" ]]; then
        echo "Creating database $(basename "$d") (this will fail if it already exists; that's ok)"
        psql -h "${DB_HOST}" -c "CREATE DATABASE $(basename "$d") WITH OWNER = ${PGUSER:-postgres} CONNECTION LIMIT = -1;" postgres
        
        echo "Migrating database $(basename "$d")..."

        del_completed_scripts "${d}"
        
        if [ -z "$(ls -A ${d})" ]; then
            echo "All scripts have been successfully run previously."
            echo "No need to take migration actions."
        else
            echo "Processing migration scripts in ${d}..."
            ./flyway migrate -ignoreMissingMigrations=true -baselineOnMigrate=true -url=jdbc:postgresql://"${DB_HOST}"/$(basename "$d") -locations=filesystem:$d -user=${PGUSER:-postgres} -password=${PGPASSWORD} -placeholders.clientUserName="${CLIENT_USERNAME}" -placeholders.clientPassword="${CLIENT_PASSWORD}" -n
        fi
    fi
done
