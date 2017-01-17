#!/bin/sh
docker-compose -f docker/docker-compose-local.yml down
docker volume rm docker_postgresdata
