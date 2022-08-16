#!/bin/sh
[ -d "/opa-data/policies" ] && cp -R -f /opa-data/policies/* /policies/
echo ""
exec "$@"