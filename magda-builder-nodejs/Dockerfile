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

CMD ["/bin/bash"]
