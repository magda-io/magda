#!/bin/bash
# Generate the PostgreSQL recovery config (a conf.d snippet) for wal-g recovery,
# based on MAGDA_RECOVERY_TARGET. Written to stdout; recover.sh redirects it into
# conf.d/recovery.conf.
#
#   latest    (default) roll forward through archived WAL to the newest segment,
#             then promote (no recovery_target set)
#   immediate restore to the base backup only (previous shipped behaviour)
#   <other>   treated as a recovery_target_time (point-in-time recovery)
set -euo pipefail

RECOVERY_TARGET="${MAGDA_RECOVERY_TARGET:-latest}"

cat <<'EOF'
restore_command = '/usr/bin/envdir /etc/wal-g.d/env /usr/local/bin/wal-g wal-fetch "%f" "$PGDATA/%p"'
recovery_end_command = '/wal-g/post-recovery.sh'
EOF

case "$RECOVERY_TARGET" in
    latest)
        # no recovery_target -> PostgreSQL replays to the end of available WAL
        # and then promotes.
        ;;
    immediate)
        echo "recovery_target = 'immediate'"
        echo "recovery_target_action = 'promote'"
        ;;
    *)
        echo "recovery_target_time = '${RECOVERY_TARGET}'"
        echo "recovery_target_action = 'promote'"
        ;;
esac
