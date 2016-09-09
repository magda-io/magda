#!/usr/bin/env bash

/docker-entrypoint.sh elasticsearch

if [ ! -f /usr/share/elasticsearch/data/initflag ]; then
    echo "Initializing"
    touch /var/lib/postgresql/data/initflag

		curl -XPUT 'http://localhost:9200/datasets/' -d '{ \
		    "settings" : { \
		        "index" : {} \
		    } \
		}'

fi