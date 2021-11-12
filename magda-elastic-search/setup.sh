#!/bin/bash
echo "Setting up data directory"

mkdir /data/data
mkdir /data/log
chown -R elasticsearch:elasticsearch /data

echo "Setting up snapshot directory"
mkdir /snapshots
chown -R elasticsearch:elasticsearch /snapshots

if [[ ! -z $GOOGLE_APPLICATION_CREDENTIALS ]]; then
    echo "Install repository-gcs plugin..."
    sudo -u elasticsearch -E bin/elasticsearch-plugin install -b repository-gcs
    echo "Finished Install repository-gcs plugin..."
    echo "Creating gcs permissions..."
    sudo -u elasticsearch -E bin/elasticsearch-keystore create
    sudo -u elasticsearch -E bin/elasticsearch-keystore add-file gcs.client.default.credentials_file $GOOGLE_APPLICATION_CREDENTIALS
    echo "Finished gcs permissions..."
fi

echo "Print current max locked memory in host: "
ulimit -l
echo "Set max locked memory to unlimited in host"
ulimit -l unlimited
echo "Re-print current max locked memory in host: "
ulimit -l

echo "Starting up..."
/usr/local/bin/docker-entrypoint.sh