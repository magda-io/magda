FROM localhost:5000/data61/magda-db-migrator:latest
COPY component/node_modules/@magda/migrator-authorization-db/sql/* /flyway/sql/auth/
COPY component/node_modules/@magda/migrator-registry-db/sql/* /flyway/sql/postgres/
COPY component/node_modules/@magda/migrator-discussions-db/sql/* /flyway/sql/discussions/
COPY component/node_modules/@magda/migrator-session-db/sql/* /flyway/sql/session/
