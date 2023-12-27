FROM node:18-alpine3.18

RUN npm install -g lerna@3.22.1

# Install haveged and run it so that we don't get lockups due to a lack of entropy
RUN apk --no-cache add haveged

RUN apk --no-cache add git openssh bash \
	make g++ \
	ca-certificates \
	curl \
	tar \
	wget \
	socat

ENTRYPOINT ["/bin/bash", "-l", "-c"]
