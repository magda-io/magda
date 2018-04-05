#!/bin/bash

echo "Setting up snapshot dir"
adduser -D -g '' elasticsearch
mkdir /snapshots
chown -R elasticsearch /snapshots

echo "Starting up"
/run.sh 