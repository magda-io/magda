#!/bin/sh
./bin/opensearch-dashboards-plugin remove securityDashboards
echo "Starting up"
./opensearch-dashboards-docker-entrypoint.sh opensearch-dashboards