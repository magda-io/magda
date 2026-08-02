#!/bin/bash
# Unit test for wal-g/gen-recovery-conf.sh (recovery.conf generation).
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
GEN="$DIR/wal-g/gen-recovery-conf.sh"
fail=0

has()    { printf '%s\n' "$1" | grep -qF -- "$2" || { echo "FAIL[$3]: missing: $2"; fail=1; }; }
hasnot() { printf '%s\n' "$1" | grep -qF -- "$2" && { echo "FAIL[$3]: unexpected: $2"; fail=1; } || true; }

RESTORE="restore_command = '/usr/bin/envdir /etc/wal-g.d/env /usr/local/bin/wal-g wal-fetch \"%f\" \"\$PGDATA/%p\"'"
ENDCMD="recovery_end_command = '/wal-g/post-recovery.sh'"

# default (unset) == latest: roll forward, no recovery_target/-time
out="$(bash "$GEN")"
has "$out" "$RESTORE" default; has "$out" "$ENDCMD" default
hasnot "$out" "recovery_target" default

# explicit latest: same as default
out="$(MAGDA_RECOVERY_TARGET=latest bash "$GEN")"
has "$out" "$RESTORE" latest; hasnot "$out" "recovery_target" latest

# immediate: recovery_target = 'immediate' + promote, no _time
out="$(MAGDA_RECOVERY_TARGET=immediate bash "$GEN")"
has "$out" "recovery_target = 'immediate'" immediate
has "$out" "recovery_target_action = 'promote'" immediate
hasnot "$out" "recovery_target_time" immediate

# timestamp: recovery_target_time + promote, not immediate
out="$(MAGDA_RECOVERY_TARGET='2026-08-01 12:00:00+00' bash "$GEN")"
has "$out" "recovery_target_time = '2026-08-01 12:00:00+00'" time
has "$out" "recovery_target_action = 'promote'" time
hasnot "$out" "recovery_target = 'immediate'" time

[ "$fail" = 0 ] && echo "PASS: gen-recovery-conf" || { echo "gen-recovery-conf tests FAILED"; exit 1; }
