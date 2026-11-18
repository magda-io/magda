# syntax=docker/dockerfile:1.7
# Build through MAGDA's generated Node component context:
#   cd magda-agent-runtime && yarn prepare-docker
#   create-docker-context-for-node-component --build --tag magda-agent-runtime:local
ARG NODE_VERSION=22.22.0
ARG DSH_VERSION=0.2.1-alpha.1
# DSH: a MAGDA DSH release from magda-io/dsh-fork's Releases page, an
# annotated tag on the fork's `magda` branch (see the fork's MAGDA.md). The
# image doesn't build DSH: it installs the release's runtime archive for its
# architecture, which the fork's CI builds from the tag. These four arguments
# are the one place a release is pinned; adopt a new release by updating all
# four from the release and its SHA256SUMS. The archive must record this tag,
# commit SHA and upstream baseline (verify-dsh-runtime.mjs).
ARG DSH_SOURCE_REPO=https://github.com/magda-io/dsh-fork.git
ARG DSH_RELEASE_TAG=magda/0.2.1-alpha.1/1.0.4
ARG DSH_RELEASE_SHA=c95a75ac123b282c4f2e7514863a57d4b9027330
ARG DSH_RUNTIME_SHA256_AMD64=da1f2fe9503b3e5dfbc1c436a53933af82dccbcf3fd7e2ae9495fc10966e9ba2
ARG DSH_RUNTIME_SHA256_ARM64=bc763b9173aa43071c90167b353e335c51cee33484cd28edf0c783d2341e4cae
ARG DSH_UPSTREAM_REF=upstream/0.2.1-alpha.1
ARG DSH_UPSTREAM_SHA=5badb15009ae1756c3afe0ae0cef1faafc290ccc
ARG UV_VERSION=0.13.6
ARG UV_IMAGE_DIGEST=sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0

# Official multi-architecture distroless image, pinned by version and immutable
# index digest. Only its binaries are copied; the runtime keeps Debian's Python.
FROM ghcr.io/astral-sh/uv:${UV_VERSION}@${UV_IMAGE_DIGEST} AS uv

# Each stage downloads one architecture's archive by exact URL and pinned
# checksum; only the target architecture's stage runs.
FROM node:${NODE_VERSION}-bookworm-slim AS dsh-runtime-amd64
ARG DSH_RELEASE_TAG
ARG DSH_RUNTIME_SHA256_AMD64
ADD --checksum=sha256:${DSH_RUNTIME_SHA256_AMD64} https://github.com/magda-io/dsh-fork/releases/download/${DSH_RELEASE_TAG}/dsh-runtime-linux-amd64.tar.gz /tmp/dsh-runtime.tar.gz

FROM node:${NODE_VERSION}-bookworm-slim AS dsh-runtime-arm64
ARG DSH_RELEASE_TAG
ARG DSH_RUNTIME_SHA256_ARM64
ADD --checksum=sha256:${DSH_RUNTIME_SHA256_ARM64} https://github.com/magda-io/dsh-fork/releases/download/${DSH_RELEASE_TAG}/dsh-runtime-linux-arm64.tar.gz /tmp/dsh-runtime.tar.gz

FROM dsh-runtime-${TARGETARCH} AS dsh-runtime
ARG TARGETARCH
ARG DSH_SOURCE_REPO
ARG DSH_RELEASE_TAG
ARG DSH_RELEASE_SHA
ARG DSH_UPSTREAM_REF
ARG DSH_UPSTREAM_SHA
COPY component/verify-dsh-runtime.mjs /opt/verify-dsh-runtime.mjs
RUN mkdir /opt/dsh-release \
  && tar -xzf /tmp/dsh-runtime.tar.gz -C /opt/dsh-release \
  && rm /tmp/dsh-runtime.tar.gz \
  && DSH_SOURCE_REPO="${DSH_SOURCE_REPO}" DSH_RELEASE_TAG="${DSH_RELEASE_TAG}" \
    DSH_RELEASE_SHA="${DSH_RELEASE_SHA}" DSH_UPSTREAM_REF="${DSH_UPSTREAM_REF}" \
    DSH_UPSTREAM_SHA="${DSH_UPSTREAM_SHA}" TARGETARCH="${TARGETARCH}" \
    node /opt/verify-dsh-runtime.mjs /opt/dsh-release

FROM node:${NODE_VERSION}-bookworm-slim
ARG DSH_VERSION
ARG DSH_SOURCE_REPO
ARG DSH_RELEASE_TAG
ARG DSH_RELEASE_SHA
ARG DSH_UPSTREAM_REF
ARG DSH_UPSTREAM_SHA
ARG UV_VERSION
LABEL io.magda.dsh.source="${DSH_SOURCE_REPO}" \
  io.magda.dsh.ref="${DSH_RELEASE_TAG}" \
  io.magda.dsh.revision="${DSH_RELEASE_SHA}" \
  io.magda.dsh.upstream-revision="${DSH_UPSTREAM_SHA}" \
  io.magda.dsh.version="${DSH_VERSION}"
COPY --from=uv /uv /usr/local/lib/magda-agent/uv
COPY --chmod=0755 component/uv-wrapper.sh /usr/local/bin/uv
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bubblewrap ca-certificates curl file git jq less patch procps python3 \
    python3-lxml python3-pandas python3-pil python3-pip python3-venv \
    fonts-crosextra-caladea fonts-crosextra-carlito fonts-dejavu-core \
    fonts-liberation2 fonts-wqy-microhei tini unzip util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && /usr/local/lib/magda-agent/uv --version | grep -Eq "^uv ${UV_VERSION}( |$)" \
  && python3 -m pip --version \
  && python3 -c 'import venv'
# Python payload for DSH's load_workspace_dependencies tool and Office skills:
# a read-only venv over Debian's interpreter (no second Python). Native libs
# come from Debian; the pure-Python Office libraries are DSH's locked wheels,
# verified by hash. The fonts above let the installed LibreOffice Kit render;
# WenQuanYi Micro Hei covers Chinese, Japanese and Korean text.
COPY component/office-runtime/ /tmp/office-runtime/
RUN set -eu; \
  payload=/usr/local/lib/magda-agent/primary-runtime; \
  python="$payload/dependencies/python/bin/python3"; \
  /usr/bin/python3 -m venv --system-site-packages --without-pip "$payload/dependencies/python"; \
  UV_PYTHON_DOWNLOADS=never UV_NO_CACHE=1 /usr/local/lib/magda-agent/uv pip install \
    --python "$python" --require-hashes --no-deps --only-binary :all: \
    -r /tmp/office-runtime/requirements.txt; \
  PIP_NO_CACHE_DIR=1 /usr/bin/python3 -m pip --python "$python" check; \
  "$python" /tmp/office-runtime/write-runtime-manifest.py \
    --arch "$(node -p process.arch)" --out "$payload/runtime.json"; \
  "$python" -c 'import docx, pptx, openpyxl, xlsxwriter, PIL, lxml, pandas'; \
  rm -rf /tmp/office-runtime; \
  chown -R root:root "$payload"; chmod -R a+rX,go-w "$payload"
# Keep the existing runtime layout expected by MAGDA's managed profile
# plugins; every DSH workspace package comes from the pinned release's archive.
COPY --from=dsh-runtime /opt/dsh-release/node_modules/ /usr/local/lib/magda-agent/dsh/node_modules/
COPY --from=dsh-runtime /opt/dsh-release/build-info/ /usr/local/share/magda-agent/
COPY --chmod=0644 component/THIRD_PARTY_SOURCES.md /usr/local/share/magda-agent/THIRD_PARTY_SOURCES.md
# Isolate DSH's locked external dependencies from MAGDA's separately built mgd
# dependency tree. Preserve the existing global CLI path for managed plugins.
RUN mkdir -p /usr/local/lib/node_modules/@deepseek-ai \
  && ln -s /usr/local/lib/magda-agent/dsh/node_modules/@deepseek-ai/dsh /usr/local/lib/node_modules/@deepseek-ai/dsh \
  && printf '#!/bin/sh\nexec node /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js "$@"\n' > /usr/local/bin/dsh \
  && chmod 0755 /usr/local/bin/dsh \
  && test "$(dsh --version)" = "${DSH_VERSION}"
# The pinned DSH release hard-codes its first-use directory name. Fail closed if
# that exact implementation changes, then brand both published entry points.
RUN set -eu; \
  package=/usr/local/lib/magda-agent/dsh/node_modules/@deepseek-ai/dsh-api-workspace-controller; \
  test -d "$package"; \
  bundled="$package/lib/index.js"; typed="$package/lib/types/default-directory.js"; \
  test "$(grep -F -c 'paths.join(directory, "deepseek-harness", DEFAULT_WORKSPACE_DIRECTORY)' "$bundled")" = 1; \
  test "$(grep -F -c "paths.join(directory, 'deepseek-harness', DEFAULT_WORKSPACE_DIRECTORY)" "$typed")" = 1; \
  sed -i 's/paths.join(directory, "deepseek-harness", DEFAULT_WORKSPACE_DIRECTORY)/paths.join(directory, "agent-harness", DEFAULT_WORKSPACE_DIRECTORY)/' "$bundled"; \
  sed -i "s/paths.join(directory, 'deepseek-harness', DEFAULT_WORKSPACE_DIRECTORY)/paths.join(directory, 'agent-harness', DEFAULT_WORKSPACE_DIRECTORY)/" "$typed"
COPY component/dsh-client-managed-profile/ \
  /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda/dsh-client-managed-profile/
COPY component/dsh-workflow-capture-guidance/ \
  /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda/dsh-workflow-capture-guidance/
COPY component/dsh-agent-skill-tools/ \
  /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda/dsh-agent-skill-tools/
RUN chown -R root:root /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda \
  && chmod -R a+rX,go-w /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda
COPY node_modules/ /usr/local/lib/node_modules/
# Generated workspace contexts can include local/CI coverage output. It is not a
# runtime dependency or source-distribution evidence and must not ship.
RUN test ! -L /usr/local/lib/node_modules/@magda/mgd \
  && rm -rf /usr/local/lib/node_modules/@magda/mgd/coverage
RUN test -x /usr/local/lib/node_modules/@magda/mgd/bin/mgd.js \
  && ln -s /usr/local/lib/node_modules/@magda/mgd/bin/mgd.js /usr/local/bin/mgd \
  && mgd --version
RUN groupadd --gid 10001 agent \
  && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash agent \
  && mkdir -p /data /run/magda-agent \
  && chown -R agent:agent /data /run/magda-agent \
  && install -d -m 0755 /etc/magda-agent /usr/local/lib/magda-agent /usr/local/lib/magda-agent/qualification \
  && install -o root -g root -m 0444 /dev/null /etc/magda-agent/workspace-runtime
COPY --chmod=0644 component/magda.cordis.patch.yml /etc/magda-agent/magda.cordis.patch.yml
COPY --chmod=0755 component/entrypoint.sh /usr/local/bin/magda-agent-entrypoint
COPY --chmod=0755 component/bootstrap.mjs /usr/local/bin/magda-agent-bootstrap
COPY --chmod=0755 component/workspace-resources.sh /usr/local/bin/magda-workspace-resources
COPY --chmod=0644 component/dsh-launch.mjs /usr/local/lib/magda-agent/dsh-launch.mjs
# skill-office's CLI entry: the installed LibreOffice Kit CLI, one command at a
# time per Workspace (flock on a file in the agent-writable working tree).
COPY --chmod=0644 component/libreoffice-kit-cli.mjs /usr/local/lib/magda-agent/libreoffice-kit-cli.mjs
# Runtime-bundled Agent Skills: immutable, root-owned and independent of
# Registry/Storage publications. DSH discovers them through DSH_BUNDLED_SKILL_DIR.
COPY component/skills/ /usr/local/lib/magda-agent/skills/
COPY --chmod=0755 component/session-history.mjs /usr/local/lib/magda-agent/session-history.mjs
RUN chown -R root:root /usr/local/lib/magda-agent/skills /usr/local/lib/magda-agent/session-history.mjs \
  && chmod -R a+rX,go-w /usr/local/lib/magda-agent/skills \
  && ln -s /usr/local/lib/magda-agent/session-history.mjs /usr/local/bin/magda-session-history
ENV DSH_HOME=/data/agent-home \
  XDG_CONFIG_HOME=/data/config \
  XDG_DATA_HOME=/data/local/share \
  MAGDA_PYTHON_CACHE_ROOT=/data/workspace/agent-harness/default-workspace/.cache \
  UV_CACHE_DIR=/data/workspace/agent-harness/default-workspace/.cache/uv \
  PIP_CACHE_DIR=/data/workspace/agent-harness/default-workspace/.cache/pip \
  MAGDA_PYTHON_TMPDIR=/data/workspace/agent-harness/default-workspace/.tmp \
  MAGDA_PYTHON_VENV_ROOT=/data/workspace/agent-harness/default-workspace/.venvs \
  MAGDA_LIBREOFFICE_KIT_LOCK=/data/workspace/agent-harness/default-workspace/.tmp/libreoffice-kit.lock \
  UV_PYTHON_DOWNLOADS=never \
  UV_PYTHON_PREFERENCE=only-system \
  PIP_REQUIRE_VIRTUALENV=true \
  DSH_TELEMETRY_MODE=DISABLED \
  DSH_TELEMETRY_DISABLED=1 \
  DSH_PERMISSION_MODE=workspace-write \
  DSH_BUNDLED_SKILL_DIR=/usr/local/lib/magda-agent/skills
USER 10001:10001
RUN mgd skills install --agent codex
WORKDIR /data/workspace
# Execute detached packaging/native checks as the actual runtime user on every
# target architecture, before an image can be published by CI.
COPY --chmod=0644 component/test-image.mjs /usr/local/lib/magda-agent/qualification/test-image.mjs
COPY --chmod=0644 component/test-image-web.mjs /usr/local/lib/magda-agent/qualification/test-image-web.mjs
# DSH's Office skills must read, generate, check and render with the shipped
# payload and LibreOffice Kit as the runtime user, without network access.
COPY component/office-fixtures/ /usr/local/lib/magda-agent/qualification/office-fixtures/
RUN DSH_RELEASE_TAG="${DSH_RELEASE_TAG}" DSH_RELEASE_SHA="${DSH_RELEASE_SHA}" \
    DSH_UPSTREAM_REF="${DSH_UPSTREAM_REF}" DSH_UPSTREAM_SHA="${DSH_UPSTREAM_SHA}" \
    DSH_VERSION="${DSH_VERSION}" node /usr/local/lib/magda-agent/qualification/test-image.mjs \
  && MAGDA_IMAGE_TEST=1 node /usr/local/lib/magda-agent/qualification/test-image-web.mjs \
  && /usr/local/lib/magda-agent/primary-runtime/dependencies/python/bin/python3 -m unittest discover \
    -s /usr/local/lib/magda-agent/qualification/office-fixtures -p 'test_*.py'
EXPOSE 3080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/magda-agent-entrypoint"]
