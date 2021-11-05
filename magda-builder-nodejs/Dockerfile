FROM node:12-alpine

RUN npm install -g lerna

# Install haveged and run it so that we don't get lockups due to a lack of entropy
RUN apk --no-cache add haveged

RUN apk --no-cache add git openssh bash \
    python make g++ \
    ca-certificates \
	curl \
	tar \
	wget
