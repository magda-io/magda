# Build from the repository root:
#   docker build -f magda-agent-runtime/Dockerfile -t magda-agent-runtime:local .
ARG NODE_VERSION=22.22.0

FROM node:${NODE_VERSION}-bookworm-slim AS mgd-build
WORKDIR /src/mgd
COPY packages/mgd/package.json ./
RUN npm install --no-audit --no-fund --ignore-scripts
COPY packages/mgd/esbuild.js ./
COPY packages/mgd/src ./src
COPY packages/mgd/skills ./skills
RUN npm run build && mkdir -p /out && npm pack --pack-destination /out

FROM node:${NODE_VERSION}-bookworm-slim
ARG DSH_VERSION=0.2.1-alpha.1
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bubblewrap ca-certificates curl file git jq less patch procps python3 \
    python3-pandas tini unzip util-linux \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g --no-audit --no-fund "@deepseek-ai/dsh@${DSH_VERSION}" \
  && npm cache clean --force
COPY --from=mgd-build /out/ /tmp/mgd/
RUN npm install -g --no-audit --no-fund /tmp/mgd/*.tgz \
  && rm -rf /tmp/mgd && npm cache clean --force
RUN groupadd --gid 10001 agent \
  && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash agent \
  && mkdir -p /data /run/magda-agent \
  && chown -R agent:agent /data /run/magda-agent \
  && install -d -m 0755 /etc/magda-agent /usr/local/lib/magda-agent
COPY --chmod=0644 magda-agent-runtime/magda.cordis.patch.yml /etc/magda-agent/magda.cordis.patch.yml
COPY --chmod=0755 magda-agent-runtime/entrypoint.sh /usr/local/bin/magda-agent-entrypoint
COPY --chmod=0755 magda-agent-runtime/bootstrap.mjs /usr/local/bin/magda-agent-bootstrap
COPY --chmod=0644 magda-agent-runtime/dsh-launch.mjs /usr/local/lib/magda-agent/dsh-launch.mjs
ENV DSH_HOME=/data/dsh-home \
  XDG_CONFIG_HOME=/data/config \
  DSH_TELEMETRY_MODE=DISABLED \
  DSH_TELEMETRY_DISABLED=1 \
  DSH_PERMISSION_MODE=workspace-write
USER 10001:10001
RUN mgd skills install --agent codex
WORKDIR /data/workspace
EXPOSE 3080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/magda-agent-entrypoint"]
