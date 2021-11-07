FROM data61/magda-builder-nodejs:buildx

ARG TARGETOS
ARG TARGETARCH

# BUILDX_ARCH should be in format e.g. linux-amd64
ENV BUILDX_ARCH "${TARGETOS}-${TARGETARCH}"
ENV BUILDX_VERSION "v0.6.3"

RUN apk add --no-cache docker docker-compose

RUN mkdir -p ~/.docker/cli-plugins && \
    wget -O ~/.docker/cli-plugins/docker-buildx https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.${BUILDX_ARCH} && \
    chmod a+x ~/.docker/cli-plugins/docker-buildx