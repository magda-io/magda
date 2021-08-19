#!/bin/bash

# shellcheck disable=SC1091

set -o errexit
set -o nounset
set -o pipefail
#set -o xtrace

if [ "$MAGDA_RECOVERY_MODE" = "true" ] && [ ! -f /wal-g/recovery.complete ]
then
    echo "Entering recovery mode..."
    /wal-g/recover.sh
fi

echo ""
exec "$@"