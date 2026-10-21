# PoC gateway image for #3841: the published magda-gateway 7.0.0 image with
# the compiled WebSocket support (#3843) overlaid. magda-gateway on
# `next` differs from 7.0.0 only in package versions, so replacing the compiled
# dist files is equivalent to a full rebuild. Build with scripts/02-build-gateway.sh.
ARG BASE_IMAGE=ghcr.io/magda-io/magda-gateway:7.0.0
FROM ${BASE_IMAGE}
COPY *.js /usr/src/app/component/dist/
