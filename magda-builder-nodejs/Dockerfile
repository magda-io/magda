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
# Install Helm 3.13.2 (pinned)
# -----------------------------
ARG HELM_VERSION=3.13.2
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
