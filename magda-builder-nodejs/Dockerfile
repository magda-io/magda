FROM ubuntu:22.04

# Install required packages
RUN apt-get update && apt-get install -y \
    haveged \
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

# Use NodeSource to install Node.js (LTS or v18)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    node -v && npm -v

RUN npm install -g npm@10.5.2 && npm install -g lerna@3.22.1 yarn@1.22.19

CMD ["/bin/bash"]