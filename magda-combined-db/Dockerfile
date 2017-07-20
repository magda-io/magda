FROM data61/magda-postgres
COPY component/node_modules/@magda/auth-db/sql/* /flyway/sql/auth/
COPY component/node_modules/@magda/registry-datastore/sql/* /flyway/sql/postgres/
COPY component/node_modules/@magda/discussions-db/sql/* /flyway/sql/discussions/
COPY component/node_modules/@magda/session-store/sql/* /flyway/sql/session/
