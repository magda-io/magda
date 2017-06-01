FROM postgres

# Copy the init scripts from the other databases into their own dirs in initdb.d
COPY @magda/combined-db/node_modules/@magda/auth-db/scripts/init/* /docker-entrypoint-initdb.d/auth-db/
COPY @magda/combined-db/node_modules/@magda/registry-datastore/scripts/init/* /docker-entrypoint-initdb.d/registry-datastore/
COPY @magda/combined-db/node_modules/@magda/session-store/scripts/init/* /docker-entrypoint-initdb.d/session-store/
COPY @magda/combined-db/node_modules/@magda/discussions-db/scripts/init/* /docker-entrypoint-initdb.d/discussions-db/

# Flatten them such that the directory path is part of the new filenames (so we can have multiple init.sqls)
RUN find /docker-entrypoint-initdb.d/*/ -type f -exec bash -c 'file=${1#./}; mv "$file" "/docker-entrypoint-initdb.d/${file//\//_}"' _ '{}' \; && find /docker-entrypoint-initdb.d/*/ -depth -type d -exec rmdir '{}' \;