#!/bin/sh
set -e
# wal-g backup-push streams a base backup over the replication protocol.
# Postgres's `all` DATABASE value does not match replication connections,
# so an explicit replication entry is required. Runner connects via
# NetworkMode:host, i.e. from the host; allow it with trust (matches the
# POSTGRES_HOST_AUTH_METHOD=trust choice for normal connections).
cat >> "$PGDATA/pg_hba.conf" <<'EOF'
host replication postgres 0.0.0.0/0 trust
EOF
