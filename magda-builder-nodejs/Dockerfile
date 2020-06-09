FROM mhart/alpine-node:10

RUN npm install -g lerna

# Install haveged and run it so that we don't get lockups due to a lack of entropy
RUN apk -U add haveged && rc-service haveged start && rc-update add haveged

RUN apk --update add git openssh bash \
    python make g++ && \
    rm -rf /var/lib/apt/lists/* && \
    rm /var/cache/apk/*
