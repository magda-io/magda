FROM ubuntu:20.04

RUN apt-get update && apt-get install -y \
    haveged \
 && rm -rf /var/lib/apt/lists/*

# Install required packages
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    bash \
    build-essential \
    ca-certificates \
    curl \
    tar \
    wget \
    socat \
 && rm -rf /var/lib/apt/lists/*

# Use NodeSource to install Node.js (current LTS v22)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    node -v && npm -v

RUN npm install -g npm@11.5.1 && npm install -g lerna@3.22.1 yarn@1.22.19

# -----------------------------
# Install Helm 3.17.4 (pinned)
# -----------------------------
# NOTE: must be >= 3.17.0. Helm <= 3.16 does not honour a parent chart's
# `null` value when coalescing global values over a subchart's populated
# map default. That caused `global.searchEngine.semanticIndexer.knnVectorFieldConfig.encoder`
# (set to `null` in the magda chart to disable it) to be silently overridden
# by the magda-{csv,pdf}-semantic-indexer charts' populated `encoder` default,
# so the rendered config ended up with both `compressionLevel` and `encoder`
# set. The semantic-indexer SDK rejects that combination, crash-looping the
# indexers and leaving the semantic-index uncreated. Helm 3.17+ coalesces the
# `null` correctly. See magda-io/magda#3711 / hybrid search engine docs.
ARG HELM_VERSION=3.17.4
ARG TARGETARCH

RUN HELM_ARCH="${TARGETARCH:-amd64}" \
  && FILE="helm-v${HELM_VERSION}-linux-${HELM_ARCH}.tar.gz" \
  && (curl --retry 5 --retry-delay 10 -fsSLO "https://get.helm.sh/${FILE}" \
      || curl --retry 5 --retry-delay 10 -fsSLO "https://github.com/magda-io/helm-cache/releases/download/v${HELM_VERSION}/${FILE}") \
  && tar -xzf "$FILE" \
  && mv "linux-${HELM_ARCH}/helm" /usr/local/bin/helm \
  && chmod +x /usr/local/bin/helm \
  && rm -rf "$FILE" "linux-${HELM_ARCH}" \
  && helm version
# -----------------------------
# Install kubectl v1.29.0 (pinned)
# -----------------------------
ARG KUBECTL_VERSION=v1.29.0
RUN curl -fsSLO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
  && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl \
  && rm kubectl \
  && kubectl version --client=true

CMD ["/bin/bash"]
