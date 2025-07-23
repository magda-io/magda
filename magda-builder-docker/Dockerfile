FROM ghcr.io/magda-io/magda-builder-nodejs:node18-ubuntu20

ARG TARGETOS
ARG TARGETARCH

# BUILDX_ARCH should be in format e.g. linux-amd64
# Set default to linux-amd64
ENV BUILDX_ARCH="${TARGETOS:-linux}-${TARGETARCH:-amd64}"
ENV BUILDX_VERSION="v0.10.0"

ENV REGCLIENT_VERSION="v0.4.8"
ENV REGCLIENT_ARCH="${TARGETOS:-linux}-${TARGETARCH:-amd64}"

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    docker-compose \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p ~/.docker/cli-plugins && \
    wget -nv -O ~/.docker/cli-plugins/docker-buildx https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.${BUILDX_ARCH} && \
    chmod a+x ~/.docker/cli-plugins/docker-buildx && \
    echo "Successfully installed docker-buildx"

RUN wget -nv -O /usr/local/bin/regctl https://github.com/regclient/regclient/releases/download/${REGCLIENT_VERSION}/regctl-${REGCLIENT_ARCH} && \
    chmod a+x /usr/local/bin/regctl && \
    echo "Successfully installed regctl"

