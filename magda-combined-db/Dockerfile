FROM postgres

# COPY @magda/combined-db/scripts/init/* /docker-entrypoint-initdb.d
COPY @magda/combined-db/node_modules/@magda/auth-db/scripts/init/* /docker-entrypoint-initdb.d/auth-db/
COPY @magda/combined-db/node_modules/@magda/registry-datastore/scripts/init/* /docker-entrypoint-initdb.d/registry-datastore/

RUN find /docker-entrypoint-initdb.d/*/ -type f -exec bash -c 'file=${1#./}; mv "$file" "/docker-entrypoint-initdb.d/${file//\//_}"' _ '{}' \; && find /docker-entrypoint-initdb.d/*/ -depth -type d -exec rmdir '{}' \;