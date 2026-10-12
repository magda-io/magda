#!/usr/bin/env bash
# Create two Magda users for the PoC (internal auth plugin password login):
#   alice@magda.test  00000000-0000-4000-8000-00000000a11c
#   bob@magda.test    00000000-0000-4000-8000-000000000b0b
# Password: $POC_PASSWORD (default "poc-password-3841"). bcrypt via pgcrypto.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PW="${POC_PASSWORD:-poc-password-3841}"
"$HERE/psql-auth.sh" -v pw="$PW" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO users (id, "displayName", email, source, "sourceId") VALUES
  ('00000000-0000-4000-8000-00000000a11c', 'Alice', 'alice@magda.test', 'internal', 'alice@magda.test'),
  ('00000000-0000-4000-8000-000000000b0b', 'Bob', 'bob@magda.test', 'internal', 'bob@magda.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO user_roles (user_id, role_id)
  SELECT u, '00000000-0000-0002-0000-000000000000'::uuid
  FROM unnest(ARRAY['00000000-0000-4000-8000-00000000a11c', '00000000-0000-4000-8000-000000000b0b']::uuid[]) AS u
  WHERE NOT EXISTS (SELECT 1 FROM user_roles r
    WHERE r.user_id = u AND r.role_id = '00000000-0000-0002-0000-000000000000');
INSERT INTO credentials (user_id, hash)
  SELECT u, crypt(:'pw', gen_salt('bf', 10))
  FROM unnest(ARRAY['00000000-0000-4000-8000-00000000a11c', '00000000-0000-4000-8000-000000000b0b']::uuid[]) AS u
ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash;
SELECT id, email FROM users WHERE email LIKE '%@magda.test';
SQL
