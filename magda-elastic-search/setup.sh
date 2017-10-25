#!/bin/bash

echo "Setting up snapshot dir"
adduser -D -g '' elasticsearch
chown -R elasticsearch /snapshots

FILE=/data/passwordschanged

if [[ ! -f $FILE ]] && [[ $NODE_DATA = "true" ]] && [[ $XPACK_ENABLED = "true" ]]; then
    # Reset passwords
    echo "Setting passwords"
    OLD_HTTP_ENABLE="${HTTP_ENABLE}"
    OLD_NETWORK_HOST="${NETWORK_HOST}"
    HTTP_ENABLE="true"
    NETWORK_HOST=0.0.0.0
    ACCEPT_DEFAULT_PASSWORD=true

    # Start temporary elasticsearch
    ulimit -l unlimited
    chown -R elasticsearch:elasticsearch /elasticsearch
    chown -R elasticsearch:elasticsearch /data

    su-exec elasticsearch /elasticsearch/bin/elasticsearch -d

    sleep 10

    until curl --fail -XPUT -u elastic:changeme 'localhost:9200/_xpack/security/user/elastic/_password?pretty' -H 'Content-Type: application/json' -d"
    {
        \"password\": \"${ELASTIC_PASSWORD}\"
    }
    "
    do
        echo "Failed to change default password, trying again"
        sleep 10
    done

    until curl --fail -XPUT -u elastic:$ELASTIC_PASSWORD 'localhost:9200/_xpack/security/user/kibana/_password?pretty' -H 'Content-Type: application/json' -d"
    {
        \"password\": \"${KIBANA_PASSWORD}\"
    }
    "
    do
        echo "Failed to change kibana password, trying again"
        sleep 10
    done

    # Kill temporary elasticsearch
    kill -SIGTERM $(ps -ef | grep elasticsearch | awk '{print $2}')

    HTTP_ENABLE="${OLD_HTTP_ENABLE}"
    NETWORK_HOST="${OLD_NETWORK_HOST}"
    ACCEPT_DEFAULT_PASSWORD=false

    touch $FILE
fi

echo "Starting up"
/run.sh