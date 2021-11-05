#!/bin/bash

# All env vars are supposed to be provided in CI runtime env

docker login -u gitlab-ci-token -p $CI_JOB_TOKEN $CI_REGISTRY

mkdir -p ~/.docker/cli-plugins
wget -O ~/.docker/cli-plugins/docker-buildx https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.${BUILDX_ARCH}
chmod +x ~/.docker/cli-plugins/docker-buildx
docker context create builder-context
docker buildx create --name builderx --driver docker-container --use builder-context 