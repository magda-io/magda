#!/bin/sh

echo "Remove security plugin..."
./bin/opensearch-plugin remove opensearch-security --purge

echo "Starting up"
./opensearch-docker-entrypoint.sh opensearch