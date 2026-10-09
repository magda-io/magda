#!/usr/bin/env bash
# Run psql against the Magda auth DB in the PoC cluster: scripts/psql-auth.sh -c "<sql>"
exec kubectl -n magda exec -i combined-db-postgresql-pg17-0 -c postgresql -- \
  bash -c 'PGPASSWORD="$(cat "$POSTGRES_PASSWORD_FILE")" psql -v ON_ERROR_STOP=1 -U postgres -d auth "$@"' psql "$@"
