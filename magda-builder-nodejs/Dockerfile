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

RUN npm install -g npm@10.5.2 && npm install -g lerna@3.22.1 yarn@1.22.19

# -----------------------------
# Install Helm 3.13.2 (pinned)
# -----------------------------
ARG HELM_VERSION=3.13.2
RUN curl -fsSLO "https://get.helm.sh/helm-v${HELM_VERSION}-linux-amd64.tar.gz" \
  && tar -xzf "helm-v${HELM_VERSION}-linux-amd64.tar.gz" \
  && mv linux-amd64/helm /usr/local/bin/helm \
  && chmod +x /usr/local/bin/helm \
  && rm -rf "helm-v${HELM_VERSION}-linux-amd64.tar.gz" linux-amd64 \
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
