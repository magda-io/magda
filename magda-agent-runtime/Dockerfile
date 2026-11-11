# Build through MAGDA's generated Node component context:
#   cd magda-agent-runtime && yarn prepare-docker
#   create-docker-context-for-node-component --build --tag magda-agent-runtime:local
ARG NODE_VERSION=22.22.0
ARG DSH_VERSION=0.2.1-alpha.1
# Source baseline: official dsh-v0.2.1-alpha.1, mirrored in this clean fork branch.
# Pin the full Git SHA: moving the branch later must NOT change MAGDA's build.
ARG DSH_SOURCE_REPO=https://github.com/magda-io/dsh-fork.git
ARG DSH_SOURCE_BRANCH=upstream/0.2.1-alpha.1
ARG DSH_SOURCE_SHA=5badb15009ae1756c3afe0ae0cef1faafc290ccc
ARG UV_VERSION=0.13.6
ARG UV_IMAGE_DIGEST=sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0

# Official multi-architecture distroless image, pinned by version and immutable
# index digest. Only its binaries are copied; the runtime keeps Debian's Python.
FROM ghcr.io/astral-sh/uv:${UV_VERSION}@${UV_IMAGE_DIGEST} AS uv

# Compile architecture-independent JS/Web assets on the builder's native CPU.
# Running the full TypeScript/Vite build under ARM QEMU can exhaust shared CI
# runners. No host node_modules crosses into a target-architecture dependency tree.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS dsh-source-build
ARG DSH_VERSION
ARG DSH_SOURCE_REPO
ARG DSH_SOURCE_BRANCH
ARG DSH_SOURCE_SHA
ENV DSH_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git build-essential musl-tools python3 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.7.0 --activate
WORKDIR /src/dsh
RUN git clone --depth=1 --branch "${DSH_SOURCE_BRANCH}" "${DSH_SOURCE_REPO}" . \
  && test "$(git rev-parse HEAD)" = "${DSH_SOURCE_SHA}" \
  && test "$(node -p 'require("./package.json").version')" = "${DSH_VERSION}" \
  && test "$(node -p 'require("./apps/cli/package.json").version')" = "${DSH_VERSION}"
RUN pnpm install --frozen-lockfile
RUN pnpm run build:official \
  && pnpm exec tsx native/system/scripts/build.ts \
  && pnpm run verify-runtime-closure
# Preserve built JS/Web workspace payloads and the exact checkout, excluding
# every host dependency tree AND generated native-system binary directory. The
# target reinstalls the lockfile and rebuilds its selected native outputs itself.
RUN tar --exclude='node_modules' --exclude='./native/system/packages/*/bin' -cf /opt/dsh-built-source.tar .

FROM node:${NODE_VERSION}-bookworm-slim AS dsh-build
ARG DSH_VERSION
ARG DSH_SOURCE_REPO
ARG DSH_SOURCE_BRANCH
ARG DSH_SOURCE_SHA
ENV DSH_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git build-essential musl-tools python3 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.7.0 --activate
WORKDIR /src/dsh
COPY --from=dsh-source-build /opt/dsh-built-source.tar /opt/dsh-built-source.tar
RUN tar -xf /opt/dsh-built-source.tar \
  && rm /opt/dsh-built-source.tar \
  && test ! -d node_modules \
  && test "$(git rev-parse HEAD)" = "${DSH_SOURCE_SHA}" \
  && pnpm install --frozen-lockfile \
  && pnpm exec tsx native/system/scripts/build.ts
# The CLI manifest alone does not provide its required runtime peers. Use the
# upstream executable assembly. Modern offline deploy preserves the committed
# external graph; pnpm 11 legacy+hoisted deploy silently ignores that lockfile.
COPY component/prepare-dsh-deploy.mjs component/verify-dsh-lock.mjs component/deploy-dsh.mjs component/prune-dsh-runtime.mjs /opt/
RUN node /opt/prepare-dsh-deploy.mjs \
  && pnpm --filter dsh-python-runtime-closure --prod deploy --offline \
    --config.inject-workspace-packages=true --config.allow-unused-patches=true \
    --config.node-linker=hoisted /opt/dsh-release \
  && git diff --exit-code -- pnpm-lock.yaml \
  && node /opt/verify-dsh-lock.mjs /opt/dsh-release \
  && DSH_SOURCE_REPO="${DSH_SOURCE_REPO}" DSH_SOURCE_BRANCH="${DSH_SOURCE_BRANCH}" \
    DSH_SOURCE_SHA="${DSH_SOURCE_SHA}" node /opt/deploy-dsh.mjs /opt/dsh-release --prune \
  && test -f /opt/dsh-release/node_modules/@deepseek-ai/dsh/lib/bin.js \
  && node /opt/dsh-release/node_modules/@deepseek-ai/dsh/lib/bin.js --version

FROM node:${NODE_VERSION}-bookworm-slim
ARG DSH_VERSION
ARG DSH_SOURCE_REPO
ARG DSH_SOURCE_SHA
ARG UV_VERSION
LABEL io.magda.dsh.source="${DSH_SOURCE_REPO}" \
  io.magda.dsh.revision="${DSH_SOURCE_SHA}" \
  io.magda.dsh.version="${DSH_VERSION}"
COPY --from=uv /uv /usr/local/lib/magda-agent/uv
COPY --chmod=0755 component/uv-wrapper.sh /usr/local/bin/uv
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bubblewrap ca-certificates curl file git jq less patch procps python3 \
    python3-pandas python3-pip python3-venv tini unzip util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && /usr/local/lib/magda-agent/uv --version | grep -Eq "^uv ${UV_VERSION}( |$)" \
  && python3 -m pip --version \
  && python3 -c 'import venv'
# Keep the existing runtime layout expected by MAGDA's managed profile
# plugins, but source every DSH workspace package from the pinned fork commit.
COPY --from=dsh-build /opt/dsh-release/node_modules/ /usr/local/lib/magda-agent/dsh/node_modules/
COPY --from=dsh-build /opt/dsh-release/provenance/ /usr/local/share/magda-agent/
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
RUN node /usr/local/lib/magda-agent/qualification/test-image.mjs \
  && MAGDA_IMAGE_TEST=1 node /usr/local/lib/magda-agent/qualification/test-image-web.mjs
EXPOSE 3080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/magda-agent-entrypoint"]
