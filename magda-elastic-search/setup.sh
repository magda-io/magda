#!/bin/bash

echo "Setting up snapshot directory"
adduser -D -g '' elasticsearch
mkdir /snapshots
chown -R elasticsearch /snapshots

if [[ ! -z $GOOGLE_APPLICATION_CREDENTIALS ]]; then
    echo "Creating gcs permissions..."
    su-exec elasticsearch /elasticsearch/bin/elasticsearch-keystore create
    su-exec elasticsearch bin/elasticsearch-keystore add-file gcs.client.default.credentials_file $GOOGLE_APPLICATION_CREDENTIALS
fi

echo "Set vm.max_map_count=262144 in host"
sysctl -w vm.max_map_count=262144

echo "Current max locked memory in host: "
ulimit -l
echo "Set max locked memory to unlimited in host"
ulimit -l unlimited
echo "New max locked memory: "
ulimit -l

echo "Starting up"
/run.sh