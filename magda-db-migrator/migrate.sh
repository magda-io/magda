#!/bin/bash

cd /flyway
tar xzf flyway-commandline-4.2.0-linux-x64.tar.gz
cd flyway-4.2.0

del_completed_scripts () {
    echo "Attempt to exclude previously executed scripts..."
    local IFS_BAK=$IFS
    local SUCCESS_SCRIPTS=`psql -t -A -h "${DB_HOST}" -c "SELECT script FROM schema_version WHERE success=TRUE" $(basename "$d") -t`
    local item=""
    IFS="|"
    for item in /flyway/sql/${1}/*; do
        if [[ -f "/flyway/sql/${1}/${item}" ]] && [[ "${IFS}${SUCCESS_SCRIPTS[*]}${IFS}" =~ "${IFS}${item}${IFS}" ]]; then
            echo "Skip ${item} as it has been sccessfully run before..."
            rm -Rf /flyway/sql/${1}/${item}
        fi
    done
}

for d in /flyway/sql/*; do
    if [[ -d "$d" ]]; then
        echo "Creating database $(basename "$d") (this will fail if it already exists; that's ok)"
        psql -h "${DB_HOST}" -c "CREATE DATABASE $(basename "$d") WITH OWNER = ${PGUSER:-postgres} CONNECTION LIMIT = -1;" postgres
        del_completed_scripts "$d"
        echo "Migrating database $(basename "$d")"
        if [ -z "$(ls -A /flyway/sql/${d})" ]; then
            echo "All scripts have been successfully run previously."
            echo "No need to take migration actions."
        else
            ./flyway migrate -baselineOnMigrate=true -url=jdbc:postgresql://"${DB_HOST}"/$(basename "$d") -locations=filesystem:$d -user=${PGUSER:-postgres} -password=${PGPASSWORD} -placeholders.clientUserName="${CLIENT_USERNAME}" -placeholders.clientPassword="${CLIENT_PASSWORD}" -n
        fi
    fi
done
