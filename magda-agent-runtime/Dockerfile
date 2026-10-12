# Build through MAGDA's generated Node component context:
#   cd magda-agent-runtime && yarn prepare-docker
#   create-docker-context-for-node-component --build --tag magda-agent-runtime:local
ARG NODE_VERSION=22.22.0

FROM node:${NODE_VERSION}-bookworm-slim
ARG DSH_VERSION=0.2.1-alpha.1
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bubblewrap ca-certificates curl file git jq less patch procps python3 \
    python3-pandas tini unzip util-linux \
  && rm -rf /var/lib/apt/lists/*
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
RUN chmod -R a+rX \
  /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@magda/dsh-client-managed-profile
COPY node_modules/ /usr/local/lib/node_modules/
RUN test -x /usr/local/lib/node_modules/@magda/mgd/bin/mgd.js \
  && ln -s /usr/local/lib/node_modules/@magda/mgd/bin/mgd.js /usr/local/bin/mgd \
  && mgd --version
RUN groupadd --gid 10001 agent \
  && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash agent \
  && mkdir -p /data /run/magda-agent \
  && chown -R agent:agent /data /run/magda-agent \
  && install -d -m 0755 /etc/magda-agent /usr/local/lib/magda-agent
COPY --chmod=0644 magda-agent-runtime/magda.cordis.patch.yml /etc/magda-agent/magda.cordis.patch.yml
COPY --chmod=0755 magda-agent-runtime/entrypoint.sh /usr/local/bin/magda-agent-entrypoint
COPY --chmod=0755 magda-agent-runtime/bootstrap.mjs /usr/local/bin/magda-agent-bootstrap
COPY --chmod=0644 magda-agent-runtime/dsh-launch.mjs /usr/local/lib/magda-agent/dsh-launch.mjs
ENV DSH_HOME=/data/agent-home \
  XDG_CONFIG_HOME=/data/config \
  DSH_TELEMETRY_MODE=DISABLED \
  DSH_TELEMETRY_DISABLED=1 \
  DSH_PERMISSION_MODE=workspace-write
USER 10001:10001
RUN mgd skills install --agent codex
WORKDIR /data/workspace
EXPOSE 3080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/magda-agent-entrypoint"]
