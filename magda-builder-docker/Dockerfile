FROM data61/magda-builder-nodejs:buildx

ARG TARGETOS
ARG TARGETARCH

# BUILDX_ARCH should be in format e.g. linux-amd64
# Set default to linux-amd64
ENV BUILDX_ARCH="${TARGETOS:-linux}-${TARGETARCH:-amd64}"
ENV BUILDX_VERSION="v0.6.3"

ENV REGCLIENT_VERSION="v0.3.9"
ENV REGCLIENT_ARCH="${TARGETOS:-linux}-${TARGETARCH:-amd64}"

RUN apk add --no-cache docker docker-compose

RUN mkdir -p ~/.docker/cli-plugins && \
    wget -nv -O ~/.docker/cli-plugins/docker-buildx https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.${BUILDX_ARCH} && \
    chmod a+x ~/.docker/cli-plugins/docker-buildx && \
    echo "Successfully installed docker-buildx"

RUN wget -nv -O /usr/local/bin/regctl https://github.com/regclient/regclient/releases/download/${REGCLIENT_VERSION}/regctl-${REGCLIENT_ARCH} && \
    chmod a+x /usr/local/bin/regctl && \
    echo "Successfully installed regctl"

