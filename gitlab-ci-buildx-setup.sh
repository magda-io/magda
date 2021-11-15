#!/bin/bash

docker info
docker -v

# All env vars are supposed to be provided in CI runtime env
docker login -u gitlab-ci-token -p $CI_JOB_TOKEN $CI_REGISTRY

docker context create builder-context
docker buildx create --name builderx --driver docker-container --use builder-context 