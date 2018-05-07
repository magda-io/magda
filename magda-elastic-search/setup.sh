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

echo "Starting up"
/run.sh 