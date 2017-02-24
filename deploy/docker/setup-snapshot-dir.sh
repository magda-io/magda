#!/bin/sh

echo "Setting up snapshot dir"
adduser -D -g '' elasticsearch
chown -R elasticsearch /snapshots

/run.sh
	
# echo http://nl.alpinelinux.org/alpine/edge/community >> /etc/apk/repositories && \
#	apk --no-cache add shadow && \
#	adduser -D -g '' elasticsearch && \

#	chmod 700 /snapshots && \
#	mkdir /snapshots/~ && \
#	usermod -u 1000 elasticsearch && \