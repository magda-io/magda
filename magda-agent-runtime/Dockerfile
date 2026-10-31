# Build through MAGDA's generated Node component context:
#   cd magda-agent-runtime && yarn prepare-docker
#   create-docker-context-for-node-component --build --tag magda-agent-runtime:local
ARG NODE_VERSION=22.22.0
ARG UV_VERSION=0.13.6
ARG UV_IMAGE_DIGEST=sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0

# Official multi-architecture distroless image, pinned by version and immutable
# index digest. Only its binaries are copied; the runtime keeps Debian's Python.
FROM ghcr.io/astral-sh/uv:${UV_VERSION}@${UV_IMAGE_DIGEST} AS uv

FROM node:${NODE_VERSION}-bookworm-slim
ARG DSH_VERSION=0.2.1-alpha.1
ARG UV_VERSION
COPY --from=uv /uv /usr/local/lib/magda-agent/uv
COPY --chmod=0755 magda-agent-runtime/uv-wrapper.sh /usr/local/bin/uv
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bubblewrap ca-certificates curl file git jq less patch procps python3 \
    python3-pandas python3-pip python3-venv tini unzip util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && /usr/local/lib/magda-agent/uv --version | grep -Eq "^uv ${UV_VERSION}( |$)" \
  && python3 -m pip --version \
  && python3 -c 'import venv'
RUN npm install -g --no-audit --no-fund "@deepseek-ai/dsh@${DSH_VERSION}" \
  && npm cache clean --force
# The pinned DSH release hard-codes its first-use directory name. Fail closed if
# that exact implementation changes, then brand both published entry points.
RUN set -eu; \
  package=/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-api-workspace-controller; \
  bundled="$package/lib/index.js"; typed="$package/lib/types/default-directory.js"; \
  test "$(grep -F -c 'paths.join(directory, "deepseek-harness", DEFAULT_WORKSPACE_DIRECTORY)' "$bundled")" = 1; \
  test "$(grep -F -c "paths.join(directory, 'deepseek-harness', DEFAULT_WORKSPACE_DIRECTORY)" "$typed")" = 1; \
  sed -i 's/paths.join(directory, "deepseek-harness", DEFAULT_WORKSPACE_DIRECTORY)/paths.join(directory, "agent-harness", DEFAULT_WORKSPACE_DIRECTORY)/' "$bundled"; \
  sed -i "s/paths.join(directory, 'deepseek-harness', DEFAULT_WORKSPACE_DIRECTORY)/paths.join(directory, 'agent-harness', DEFAULT_WORKSPACE_DIRECTORY)/" "$typed"
COPY magda-agent-runtime/dsh-client-managed-profile/ \
  /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda/dsh-client-managed-profile/
COPY magda-agent-runtime/dsh-workflow-capture-guidance/ \
  /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda/dsh-workflow-capture-guidance/
COPY magda-agent-runtime/dsh-agent-skill-tools/ \
  /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda/dsh-agent-skill-tools/
RUN chown -R root:root /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda \
  && chmod -R a+rX,go-w /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda
COPY node_modules/ /usr/local/lib/node_modules/
RUN test -x /usr/local/lib/node_modules/@magda/mgd/bin/mgd.js \
  && ln -s /usr/local/lib/node_modules/@magda/mgd/bin/mgd.js /usr/local/bin/mgd \
  && mgd --version
RUN groupadd --gid 10001 agent \
  && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash agent \
  && mkdir -p /data /run/magda-agent \
  && chown -R agent:agent /data /run/magda-agent \
  && install -d -m 0755 /etc/magda-agent /usr/local/lib/magda-agent \
  && install -o root -g root -m 0444 /dev/null /etc/magda-agent/workspace-runtime
COPY --chmod=0644 magda-agent-runtime/magda.cordis.patch.yml /etc/magda-agent/magda.cordis.patch.yml
COPY --chmod=0755 magda-agent-runtime/entrypoint.sh /usr/local/bin/magda-agent-entrypoint
COPY --chmod=0755 magda-agent-runtime/bootstrap.mjs /usr/local/bin/magda-agent-bootstrap
COPY --chmod=0644 magda-agent-runtime/dsh-launch.mjs /usr/local/lib/magda-agent/dsh-launch.mjs
# Runtime-bundled Agent Skills: immutable, root-owned and independent of
# Registry/Storage publications. DSH discovers them through DSH_BUNDLED_SKILL_DIR.
COPY magda-agent-runtime/skills/ /usr/local/lib/magda-agent/skills/
COPY --chmod=0755 magda-agent-runtime/session-history.mjs /usr/local/lib/magda-agent/session-history.mjs
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
EXPOSE 3080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/magda-agent-entrypoint"]
