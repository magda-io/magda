# Magda agent image for #3841: DSH Web bound directly to the Pod network.
#
# Differences from the #3812 image (deploy/poc/agent-sandbox-minikube/image):
#   - DSH 0.2.1-alpha.1, the first release with `--public-url` (#3972 upstream);
#   - no loopback relay: the Magda profile patch binds the DSH webserver row to
#     0.0.0.0:3080, so the Sandbox Service targets DSH itself;
#   - DSH runs under dsh-launch.mjs: the launch token goes to a 0600 file in an
#     in-memory emptyDir (/run/magda-agent) instead of stdout/log aggregation;
#   - optional `nba` target: the same image plus the Discussion #8528
#     `--no-browser-auth` port (image/dsh-patches/).
#
# Build with scripts/03-build-images.sh. No API keys or credentials are baked in.

ARG NODE_VERSION=22.22.0

FROM node:${NODE_VERSION}-bookworm-slim AS mgd-build
WORKDIR /src/mgd
COPY --from=mgd package.json ./
RUN npm install --no-audit --no-fund --ignore-scripts
COPY --from=mgd . .
RUN mkdir -p /out && npm pack --pack-destination /out

FROM node:${NODE_VERSION}-bookworm-slim AS stock

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
  && mkdir -p /data && chown agent:agent /data \
  && install -d -m 0755 /etc/magda-agent /usr/local/lib/magda-agent

COPY --chmod=0644 magda.cordis.patch.yml /etc/magda-agent/magda.cordis.patch.yml
COPY --chmod=0755 entrypoint.sh /usr/local/bin/magda-agent-entrypoint
COPY --chmod=0644 dsh-launch.mjs /usr/local/lib/magda-agent/dsh-launch.mjs

ENV DSH_HOME=/data/dsh-home \
  XDG_CONFIG_HOME=/data/config \
  DSH_TELEMETRY_MODE=DISABLED \
  DSH_TELEMETRY_DISABLED=1 \
  DSH_PERMISSION_MODE=workspace-write

USER 10001:10001
RUN mgd skills install --agent codex
WORKDIR /home/agent
EXPOSE 3080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/magda-agent-entrypoint"]

# Variant B: stock image + the #8528 browser-auth opt-out ported to this DSH
# version. The patch only adds an opt-in flag; without DSH_BROWSER_AUTH=false
# the image behaves like `stock`.
FROM stock AS nba
USER 0:0
COPY dsh-patches/8528-no-browser-auth-0.2.1-alpha.1.patch /tmp/8528.patch
RUN set -eu; \
  DSH_PKGS="$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai"; \
  [ -d "$DSH_PKGS/dsh-client-connection" ] || DSH_PKGS="$(npm root -g)/@deepseek-ai"; \
  patch -p1 -d "$DSH_PKGS" < /tmp/8528.patch; \
  rm /tmp/8528.patch; \
  grep -q "no-browser-auth" "$DSH_PKGS/dsh-web-app/lib/startup.js"
USER 10001:10001
