# Magda v8 agent PoC image: DeepSeek Harness (DSH) + mgd + analysis tools.
#
# Build with scripts/03-build-image.sh, which supplies the `mgd` named build
# context (packages/mgd from this repository) so the image carries the mgd
# version of the checked-out branch.
#
# No API keys or credentials are baked into this image: the LLM key and any
# Magda credential are injected at runtime (see manifests/).

ARG NODE_VERSION=22.22.0

FROM node:${NODE_VERSION}-bookworm-slim AS mgd-build
WORKDIR /src/mgd
COPY --from=mgd package.json ./
RUN npm install --no-audit --no-fund --ignore-scripts
COPY --from=mgd . .
# `npm pack` runs the prepack script (esbuild bundle) first.
RUN mkdir -p /out && npm pack --pack-destination /out

FROM node:${NODE_VERSION}-bookworm-slim

ARG DSH_VERSION=0.2.0-rc.2

# bubblewrap: DSH's preferred Linux confinement runner (probed before Landlock).
# python3 + pandas + utilities: minimal local analysis toolbox for smoke tests.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bubblewrap ca-certificates curl file git jq less procps python3 \
    python3-pandas tini unzip util-linux \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g --no-audit --no-fund "@deepseek-ai/dsh@${DSH_VERSION}" \
  && npm cache clean --force

COPY --from=mgd-build /out/ /tmp/mgd/
RUN npm install -g --no-audit --no-fund /tmp/mgd/*.tgz \
  && rm -rf /tmp/mgd && npm cache clean --force

# Non-root runtime user. /data is the persistent volume mount point:
#   /data/dsh-home   DSH_HOME (settings, sessions, credentials store)
#   /data/workspace  the agent workspace (DSH workspace root, cwd)
#   /data/config     XDG_CONFIG_HOME (mgd profiles live in /data/config/mgd)
RUN groupadd --gid 10001 agent \
  && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash agent \
  && mkdir -p /data && chown agent:agent /data \
  && install -d -m 0755 /etc/magda-agent

COPY --chmod=0644 magda.cordis.patch.yml /etc/magda-agent/magda.cordis.patch.yml
COPY --chmod=0755 entrypoint.sh /usr/local/bin/magda-agent-entrypoint
COPY --chmod=0644 loopback-relay.mjs /etc/magda-agent/loopback-relay.mjs

ENV DSH_HOME=/data/dsh-home \
  XDG_CONFIG_HOME=/data/config \
  DSH_TELEMETRY_MODE=DISABLED \
  DSH_TELEMETRY_DISABLED=1 \
  DSH_PERMISSION_MODE=workspace-write \
  DSH_WEB_PORT=3080 \
  RELAY_PORT=8080

USER 10001:10001
# Deployment-level mgd skill: `--agent codex --scope global` writes
# ~/.agents/skills/mgd, which DSH's filesystem skill provider scans
# ($DSH_AGENTS_HOME defaults to ~/.agents). It lives in the image, not on the
# per-session volume, so every new sandbox gets the same trusted skill.
RUN mgd skills install --agent codex
# Not /data/workspace: the runtime would create a missing WORKDIR on the
# mounted volume as root, leaving the agent unable to write its workspace.
# The entrypoint creates it as the agent user and cd's into it.
WORKDIR /home/agent
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/magda-agent-entrypoint"]
