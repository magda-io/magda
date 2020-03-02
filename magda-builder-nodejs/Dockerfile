FROM mhart/alpine-node:8

RUN npm install -g lerna

RUN apk --update add git openssh bash \
    python make g++ && \
    rm -rf /var/lib/apt/lists/* && \
    rm /var/cache/apk/*
