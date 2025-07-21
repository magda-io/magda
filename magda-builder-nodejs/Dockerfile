FROM node:18-bullseye

RUN npm install -g npm@10.5.2 && npm install -g lerna@3.22.1

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

ENTRYPOINT ["/bin/bash", "-l", "-c"]
